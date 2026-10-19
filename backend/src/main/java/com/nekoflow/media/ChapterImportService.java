package com.nekoflow.media;

import static com.nekoflow.media.PlaybackService.map;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nekoflow.progress.ProgressException;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Importação editorial de capítulos: recebe um ZIP ou imagens avulsas, valida o conteúdo
 * real de cada arquivo, ordena de forma determinística, grava no armazenamento de objetos
 * e deixa o lote PRONTO para pré-visualização. Nada é publicado automaticamente; um lote
 * com qualquer erro termina FALHO e sem arquivos.
 */
@Service
public class ChapterImportService {

    static final int MAX_PAGES = 400;
    static final long MAX_FILE_BYTES = 20L * 1024 * 1024;
    static final long MAX_TOTAL_BYTES = 400L * 1024 * 1024;
    static final int MAX_ZIP_ENTRIES = 1000;

    private final JdbcClient jdbc;
    private final ReaderService reader;
    private final ObjectMapper mapper;
    private final Path storageRoot;

    public ChapterImportService(JdbcClient jdbc, ReaderService reader, ObjectMapper mapper,
                                @Value("${nekoflow.media.storage-dir:./data/media}") String storageDir) {
        this.jdbc = jdbc;
        this.reader = reader;
        this.mapper = mapper;
        this.storageRoot = Path.of(storageDir).toAbsolutePath().normalize();
    }

    record Incoming(String name, byte[] bytes) {
    }

    record Page(int position, String name, ImageInspector.Info info, byte[] bytes, String checksum) {
    }

    public Map<String, Object> create(UUID chapterId, UUID editionId, List<MultipartFile> files, long actorId) {
        var chapter = reader.chapterForEditor(chapterId, editionId);
        if (files == null || files.isEmpty()) {
            throw ProgressException.badRequest("IMPORT_EMPTY", "Envie um ZIP ou as imagens do capítulo.");
        }
        List<String> errors = new ArrayList<>();
        List<Incoming> incoming = new ArrayList<>();
        long[] total = {0};
        for (MultipartFile f : files) {
            String name = baseName(f.getOriginalFilename());
            try (InputStream in = f.getInputStream()) {
                if (name.toLowerCase(Locale.ROOT).endsWith(".zip")) {
                    unzip(in, incoming, errors, total);
                } else {
                    byte[] bytes = readLimited(in, MAX_FILE_BYTES);
                    if (bytes == null) {
                        errors.add(name + ": arquivo acima de 20 MB.");
                        continue;
                    }
                    total[0] += bytes.length;
                    incoming.add(new Incoming(name, bytes));
                }
            } catch (IOException e) {
                errors.add(name + ": não foi possível ler o arquivo.");
            }
            if (total[0] > MAX_TOTAL_BYTES) {
                errors.add("O lote passa de 400 MB.");
                break;
            }
        }

        List<Page> pages = validate(incoming, errors);
        UUID importId = UUID.randomUUID();
        jdbc.sql("""
                INSERT INTO chapter_import (id, chapter_id, edition_id, origin, status, provenance, created_by)
                VALUES (?, ?, ?, 'UPLOAD', 'PROCESSING', ?, ?)""")
                .params(importId, chapterId, editionId, "Envio editorial pelo painel", actorId).update();

        if (errors.isEmpty()) {
            try {
                store(importId, pages, "VERTICAL".equals(chapter.readingMode()));
            } catch (IOException e) {
                errors.add("Falha ao gravar as imagens no armazenamento.");
            }
        }
        if (!errors.isEmpty()) {
            deleteFiles(importId);
            jdbc.sql("DELETE FROM chapter_page WHERE import_id = ?").param(importId).update();
            finish(importId, "FAILED", 0, map("errors", errors, "received", incoming.size()));
            audit(chapter.workId(), "CHAPTER_IMPORT_FAILED", map("importId", importId, "errors", errors.size()));
            return detail(importId);
        }
        finish(importId, "READY", pages.size(), map("pages", pages.size(),
                "files", pages.stream().map(Page::name).toList(),
                "doublePages", pages.stream().filter(p -> p.info().width() > p.info().height())
                        .map(Page::position).toList()));
        audit(chapter.workId(), "CHAPTER_IMPORT_READY", map("importId", importId, "pages", pages.size()));
        return detail(importId);
    }

    @Transactional
    public Map<String, Object> publish(UUID importId) {
        var row = importRow(importId);
        if (!"READY".equals(row.get("status"))) {
            throw ProgressException.unprocessable("IMPORT_NOT_READY",
                    "Só um lote validado (pronto) pode ser publicado.");
        }
        Integer pending = jdbc.sql("SELECT count(*) FROM chapter_page WHERE import_id = ? AND status <> 'AVAILABLE'")
                .param(importId).query(Integer.class).single();
        int pages = ((Number) row.get("pageCount")).intValue();
        if (pending > 0 || pages == 0) {
            throw ProgressException.unprocessable("IMPORT_INCOMPLETE", "O lote tem páginas pendentes ou com erro.");
        }
        UUID chapterId = (UUID) row.get("chapterId");
        UUID editionId = (UUID) row.get("editionId");
        jdbc.sql("UPDATE chapter_import SET status = 'REPLACED' WHERE chapter_id = ? AND edition_id = ? AND status = 'PUBLISHED'")
                .params(chapterId, editionId).update();
        jdbc.sql("UPDATE chapter_import SET status = 'PUBLISHED', published_at = now() WHERE id = ?")
                .param(importId).update();
        jdbc.sql("UPDATE chapter SET availability = 'NATIVE' WHERE id = ?").param(chapterId).update();
        audit(reader.chapterForEditor(chapterId, editionId).workId(), "CHAPTER_IMPORT_PUBLISHED",
                map("importId", importId, "pages", pages));
        return detail(importId);
    }

    @Transactional
    public Map<String, Object> discard(UUID importId) {
        var row = importRow(importId);
        String status = (String) row.get("status");
        if (!"READY".equals(status) && !"FAILED".equals(status)) {
            throw ProgressException.unprocessable("IMPORT_NOT_DISCARDABLE",
                    "Lotes publicados não são apagados; publique outro lote para substituí-lo.");
        }
        jdbc.sql("DELETE FROM chapter_page WHERE import_id = ?").param(importId).update();
        jdbc.sql("UPDATE chapter_import SET status = 'DISCARDED', page_count = 0 WHERE id = ?").param(importId).update();
        deleteFiles(importId);
        return detail(importId);
    }

    public List<Map<String, Object>> list(UUID chapterId, UUID editionId) {
        reader.chapterForEditor(chapterId, editionId);
        return jdbc.sql("""
                SELECT id FROM chapter_import WHERE chapter_id = ? AND edition_id = ? ORDER BY created_at DESC""")
                .params(chapterId, editionId).query(UUID.class).list().stream().map(this::summary).toList();
    }

    /** Lote com as páginas para pré-visualização editorial (inclui lotes não publicados). */
    public Map<String, Object> detail(UUID importId) {
        Map<String, Object> m = summary(importId);
        m.put("pages", reader.pages(importId, true));
        return m;
    }

    private Map<String, Object> summary(UUID importId) {
        return importRow(importId);
    }

    private Map<String, Object> importRow(UUID importId) {
        return jdbc.sql("""
                SELECT id, chapter_id, edition_id, origin, status, page_count, report::text, provenance,
                       created_at, published_at FROM chapter_import WHERE id = ?""")
                .param(importId)
                .query((rs, n) -> map("id", rs.getObject(1, UUID.class), "chapterId", rs.getObject(2, UUID.class),
                        "editionId", rs.getObject(3, UUID.class), "origin", rs.getString(4), "status", rs.getString(5),
                        "pageCount", rs.getInt(6), "report", parse(rs.getString(7)), "provenance", rs.getString(8),
                        "createdAt", rs.getTimestamp(9).toInstant(),
                        "publishedAt", rs.getTimestamp(10) == null ? null : rs.getTimestamp(10).toInstant()))
                .optional()
                .orElseThrow(() -> ProgressException.notFound("IMPORT_NOT_FOUND", "Lote não encontrado."));
    }

    // ---- validação ----------------------------------------------------------------------

    static List<Page> validate(List<Incoming> incoming, List<String> errors) {
        if (incoming.isEmpty() && errors.isEmpty()) {
            errors.add("Nenhuma imagem encontrada no envio.");
        }
        if (incoming.size() > MAX_PAGES) {
            errors.add("O capítulo passa de " + MAX_PAGES + " páginas.");
            return List.of();
        }
        List<Incoming> sorted = new ArrayList<>(incoming);
        sorted.sort(Comparator.comparing(Incoming::name, ChapterImportService::natural));
        List<Page> pages = new ArrayList<>();
        String previous = null;
        for (Incoming f : sorted) {
            if (f.name().equalsIgnoreCase(previous)) {
                errors.add(f.name() + ": nome repetido; a ordem das páginas ficaria ambígua.");
            }
            previous = f.name();
            var info = ImageInspector.inspect(f.bytes());
            if (info.isEmpty()) {
                errors.add(f.name() + ": não é uma imagem JPEG, PNG ou WebP válida.");
                continue;
            }
            pages.add(new Page(pages.size() + 1, f.name(), info.get(), f.bytes(), sha256(f.bytes())));
        }
        return pages;
    }

    private static void unzip(InputStream raw, List<Incoming> out, List<String> errors, long[] total)
            throws IOException {
        int entries = 0;
        try (ZipInputStream zip = new ZipInputStream(raw)) {
            ZipEntry e;
            while ((e = zip.getNextEntry()) != null) {
                if (++entries > MAX_ZIP_ENTRIES) {
                    errors.add("O ZIP tem arquivos demais.");
                    return;
                }
                String path = e.getName().replace('\\', '/');
                if (path.startsWith("/") || path.contains("../") || path.startsWith("..") || path.contains(":")) {
                    errors.add(path + ": caminho inválido dentro do ZIP.");
                    continue;
                }
                if (e.isDirectory() || path.startsWith("__MACOSX/") || baseName(path).startsWith(".")) {
                    continue;
                }
                if (path.chars().filter(c -> c == '/').count() > 1) {
                    errors.add(path + ": use as imagens na raiz do ZIP ou em uma única pasta.");
                    continue;
                }
                byte[] bytes = readLimited(zip, MAX_FILE_BYTES);
                if (bytes == null) {
                    errors.add(path + ": arquivo acima de 20 MB.");
                    return; // descompactação abortada: protege contra arquivos-bomba
                }
                total[0] += bytes.length;
                if (total[0] > MAX_TOTAL_BYTES) {
                    errors.add("O conteúdo descompactado passa de 400 MB.");
                    return;
                }
                out.add(new Incoming(baseName(path), bytes));
            }
        } catch (IllegalArgumentException | java.util.zip.ZipException ex) {
            errors.add("ZIP corrompido ou em formato não suportado.");
        }
    }

    private static byte[] readLimited(InputStream in, long limit) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[64 * 1024];
        long read = 0;
        int n;
        while ((n = in.read(buf)) != -1) {
            read += n;
            if (read > limit) {
                return null;
            }
            out.write(buf, 0, n);
        }
        return out.toByteArray();
    }

    /** Ordem natural: "2.jpg" antes de "10.jpg"; empates pelo texto. */
    static int natural(String a, String b) {
        Pattern p = Pattern.compile("(\\d+)|(\\D+)");
        Matcher ma = p.matcher(a.toLowerCase(Locale.ROOT));
        Matcher mb = p.matcher(b.toLowerCase(Locale.ROOT));
        while (ma.find() && mb.find()) {
            String x = ma.group();
            String y = mb.group();
            int c;
            if (ma.group(1) != null && mb.group(1) != null) {
                c = new java.math.BigInteger(x).compareTo(new java.math.BigInteger(y));
            } else {
                c = x.compareTo(y);
            }
            if (c != 0) {
                return c;
            }
        }
        return a.compareTo(b);
    }

    static String baseName(String name) {
        if (name == null) {
            return "";
        }
        String n = name.replace('\\', '/');
        return n.substring(n.lastIndexOf('/') + 1);
    }

    // ---- armazenamento --------------------------------------------------------------------

    private void store(UUID importId, List<Page> pages, boolean vertical) throws IOException {
        Path dir = storageRoot.resolve("chapters").resolve(importId.toString()).normalize();
        if (!dir.startsWith(storageRoot)) {
            throw new IOException("diretório fora do armazenamento");
        }
        Files.createDirectories(dir);
        for (Page p : pages) {
            String file = String.format("%03d-%s.%s", p.position(), p.checksum().substring(0, 12), p.info().extension());
            Path tmp = dir.resolve(file + ".part");
            Files.write(tmp, p.bytes());
            Files.move(tmp, dir.resolve(file), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            String type = vertical ? "SEGMENT" : p.info().width() > p.info().height() ? "DOUBLE" : "SINGLE";
            jdbc.sql("""
                    INSERT INTO chapter_page (import_id, position, storage, asset_key, width, height, page_type,
                                              mime_type, byte_size, checksum, status)
                    VALUES (?, ?, 'LOCAL', ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE')""")
                    .params(importId, p.position(), "chapters/" + importId + "/" + file, p.info().width(),
                            p.info().height(), type, p.info().mime(), (long) p.bytes().length, p.checksum())
                    .update();
        }
    }

    private void deleteFiles(UUID importId) {
        Path dir = storageRoot.resolve("chapters").resolve(importId.toString()).normalize();
        if (!dir.startsWith(storageRoot) || !Files.isDirectory(dir)) {
            return;
        }
        try (var files = Files.list(dir)) {
            for (Path f : files.toList()) {
                Files.deleteIfExists(f);
            }
            Files.deleteIfExists(dir);
        } catch (IOException ignored) {
            // arquivos órfãos não são publicados: o manifesto só lê lotes PUBLISHED
        }
    }

    private void finish(UUID importId, String status, int pages, Map<String, Object> report) {
        jdbc.sql("UPDATE chapter_import SET status = ?, page_count = ?, report = CAST(? AS jsonb) WHERE id = ?")
                .params(status, pages, json(report), importId).update();
    }

    private void audit(long workId, String action, Map<String, Object> data) {
        jdbc.sql("""
                INSERT INTO catalog_audit_event (actor_id, work_id, action, after_data)
                VALUES (?, ?, ?, CAST(? AS jsonb))""")
                .params(com.nekoflow.auth.CurrentUser.orNull() == null ? null : com.nekoflow.auth.CurrentUser.id(),
                        workId, action, json(data))
                .update();
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private String json(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private Object parse(String json) {
        try {
            return mapper.readValue(json, Object.class);
        } catch (Exception e) {
            return Map.of();
        }
    }
}

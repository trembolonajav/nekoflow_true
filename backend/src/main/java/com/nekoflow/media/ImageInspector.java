package com.nekoflow.media;

import java.util.Optional;

/**
 * Identifica o tipo REAL de uma imagem pelos bytes (não pela extensão) e lê suas
 * dimensões sem decodificar o arquivo inteiro. Aceita JPEG, PNG e WebP.
 */
public final class ImageInspector {

    private ImageInspector() {
    }

    public record Info(String mime, String extension, int width, int height) {
    }

    public static Optional<Info> inspect(byte[] d) {
        if (d == null || d.length < 32) {
            return Optional.empty();
        }
        try {
            if (u8(d, 0) == 0x89 && d[1] == 'P' && d[2] == 'N' && d[3] == 'G') {
                return dims("image/png", "png", be32(d, 16), be32(d, 20));
            }
            if (d[0] == 'R' && d[1] == 'I' && d[2] == 'F' && d[3] == 'F' && d[8] == 'W' && d[9] == 'E' && d[10] == 'B'
                    && d[11] == 'P') {
                String chunk = new String(d, 12, 4, java.nio.charset.StandardCharsets.US_ASCII);
                return switch (chunk) {
                    case "VP8X" -> dims("image/webp", "webp", 1 + le24(d, 24), 1 + le24(d, 27));
                    case "VP8 " -> dims("image/webp", "webp", le16(d, 26) & 0x3fff, le16(d, 28) & 0x3fff);
                    case "VP8L" -> {
                        long v = (u8(d, 21)) | (u8(d, 22) << 8) | (u8(d, 23) << 16) | ((long) u8(d, 24) << 24);
                        yield dims("image/webp", "webp", (int) (v & 0x3fff) + 1, (int) ((v >> 14) & 0x3fff) + 1);
                    }
                    default -> Optional.empty();
                };
            }
            if (u8(d, 0) == 0xFF && u8(d, 1) == 0xD8) {
                return jpeg(d);
            }
        } catch (ArrayIndexOutOfBoundsException e) {
            return Optional.empty();
        }
        return Optional.empty();
    }

    private static Optional<Info> jpeg(byte[] d) {
        int i = 2;
        while (i + 9 < d.length) {
            if (u8(d, i) != 0xFF) {
                return Optional.empty();
            }
            int marker = u8(d, i + 1);
            if (marker == 0xD8 || (marker >= 0xD0 && marker <= 0xD7) || marker == 0x01) {
                i += 2;
                continue;
            }
            int len = be16(d, i + 2);
            boolean sof = marker >= 0xC0 && marker <= 0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC;
            if (sof) {
                return dims("image/jpeg", "jpg", be16(d, i + 7), be16(d, i + 5));
            }
            if (len < 2) {
                return Optional.empty();
            }
            i += 2 + len;
        }
        return Optional.empty();
    }

    private static Optional<Info> dims(String mime, String ext, int w, int h) {
        if (w <= 0 || h <= 0 || w > 20000 || h > 60000) {
            return Optional.empty();
        }
        return Optional.of(new Info(mime, ext, w, h));
    }

    private static int u8(byte[] d, int i) {
        return d[i] & 0xff;
    }

    private static int be16(byte[] d, int i) {
        return (u8(d, i) << 8) | u8(d, i + 1);
    }

    private static int be32(byte[] d, int i) {
        return (u8(d, i) << 24) | (u8(d, i + 1) << 16) | (u8(d, i + 2) << 8) | u8(d, i + 3);
    }

    private static int le16(byte[] d, int i) {
        return u8(d, i) | (u8(d, i + 1) << 8);
    }

    private static int le24(byte[] d, int i) {
        return u8(d, i) | (u8(d, i + 1) << 8) | (u8(d, i + 2) << 16);
    }
}

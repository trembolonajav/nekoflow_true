package com.nekoflow.catalog;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nekoflow.auth.CurrentUser;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Operações editoriais não destrutivas do catálogo normalizado. */
@RestController
@RequestMapping("/api/admin/catalog")
public class CatalogAdminController {
    private final JdbcClient jdbc;
    private final ObjectMapper mapper;
    private final AniListSyncService anilist;
    public CatalogAdminController(JdbcClient jdbc,ObjectMapper mapper,AniListSyncService anilist){this.jdbc=jdbc;this.mapper=mapper;this.anilist=anilist;}

    /** Puxa sinopse e banner diretamente do AniList (com atribuição e auditoria). */
    @PostMapping("/works/{publicId}/anilist-sync")
    public Map<String,Object> anilistSync(@PathVariable UUID publicId){return anilist.syncFromAdmin(work(publicId));}

    public record WorkPatch(String title,String synopsisShort,String synopsis,String storyStatus,String coverUrl,String bannerUrl,String originCountry){}
    public record SeasonBody(String title,String displayNumber,BigDecimal sortPosition,String releaseDate){}
    public record EpisodeBody(String title,String displayNumber,BigDecimal sortPosition,Integer durationSeconds){}
    public record EditionBody(String name,String language,Boolean original){}
    public record ChapterBody(UUID editionId,UUID volumeId,String title,String displayNumber,BigDecimal sortPosition){}
    public record RelationBody(UUID targetWorkId,String relationType){}

    @GetMapping("/works")
    public List<Map<String,Object>> works(@RequestParam(defaultValue="") String q){
        String like="%"+q.trim().toLowerCase()+"%";
        return jdbc.sql("SELECT public_id AS id,title,slug,media_family,work_format,story_status,visibility,synopsis_short,synopsis_full,cover AS cover_url,banner AS banner_url,updated_at FROM work WHERE :q='' OR lower(title) LIKE :like OR EXISTS(SELECT 1 FROM work_title t WHERE t.work_id=work.id AND t.title_norm LIKE :like) ORDER BY updated_at DESC LIMIT 40")
                .param("q",q.trim()).param("like",like).query((rs,n)->{Map<String,Object> m=new java.util.LinkedHashMap<>();for(int i=1;i<=rs.getMetaData().getColumnCount();i++)m.put(rs.getMetaData().getColumnLabel(i),rs.getObject(i));return m;}).list();
    }

    @PatchMapping("/works/{publicId}") @Transactional
    public Map<String,Object> patch(@PathVariable UUID publicId,@RequestBody WorkPatch b){
        long id=work(publicId);String before=snapshot(id);
        if(b.storyStatus()!=null&&!List.of("ONGOING","COMPLETED","HIATUS","UNKNOWN").contains(b.storyStatus()))bad("Situação editorial inválida");
        jdbc.sql("UPDATE work SET title=COALESCE(?,title),synopsis_short=COALESCE(?,synopsis_short),synopsis_full=COALESCE(?,synopsis_full),story_status=COALESCE(?,story_status),cover=COALESCE(?,cover),banner=COALESCE(?,banner),origin_country=COALESCE(?,origin_country),updated_at=now() WHERE id=?")
                .params(blank(b.title()),blank(b.synopsisShort()),blank(b.synopsis()),b.storyStatus(),blank(b.coverUrl()),blank(b.bannerUrl()),blank(b.originCountry()),id).update();
        audit(id,"UPDATE_WORK",before,snapshot(id));return view(id);
    }

    @PutMapping("/works/{publicId}/visibility/{visibility}") @Transactional
    public Map<String,Object> visibility(@PathVariable UUID publicId,@PathVariable String visibility){
        String value=visibility.toUpperCase();if(!List.of("DRAFT","PUBLISHED","HIDDEN","ARCHIVED").contains(value))bad("Visibilidade inválida");
        long id=work(publicId);String before=snapshot(id);jdbc.sql("UPDATE work SET visibility=?,updated_at=now() WHERE id=?").params(value,id).update();audit(id,"VISIBILITY_"+value,before,snapshot(id));return view(id);
    }

    @PostMapping("/works/{publicId}/seasons") @Transactional
    public Map<String,Object> season(@PathVariable UUID publicId,@RequestBody SeasonBody b){
        long id=work(publicId);if(blank(b.title())==null||b.sortPosition()==null)bad("Título e ordem são obrigatórios");
        UUID unit=UUID.randomUUID();jdbc.sql("INSERT INTO season(id,work_id,title,display_number,sort_position,release_date,visibility) VALUES (?,?,?,?,?,CAST(? AS date),'DRAFT')")
                .params(unit,id,b.title().trim(),blank(b.displayNumber()),b.sortPosition(),blank(b.releaseDate())).update();audit(id,"CREATE_SEASON",null,json(Map.of("id",unit)));return Map.of("id",unit,"visibility","DRAFT");
    }

    @PostMapping("/seasons/{seasonId}/episodes") @Transactional
    public Map<String,Object> episode(@PathVariable UUID seasonId,@RequestBody EpisodeBody b){
        long id=jdbc.sql("SELECT work_id FROM season WHERE id=?").param(seasonId).query(Long.class).optional().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        if(blank(b.displayNumber())==null||b.sortPosition()==null)bad("Número e ordem são obrigatórios");UUID unit=UUID.randomUUID();
        jdbc.sql("INSERT INTO episode(id,season_id,title,display_number,sort_position,duration_seconds) VALUES (?,?,?,?,?,?)").params(unit,seasonId,blank(b.title()),b.displayNumber().trim(),b.sortPosition(),b.durationSeconds()).update();audit(id,"CREATE_EPISODE",null,json(Map.of("id",unit)));return Map.of("id",unit,"availability","UNAVAILABLE");
    }

    @PostMapping("/works/{publicId}/editions") @Transactional
    public Map<String,Object> edition(@PathVariable UUID publicId,@RequestBody EditionBody b){
        long id=work(publicId);if(blank(b.name())==null||blank(b.language())==null)bad("Nome e idioma são obrigatórios");UUID edition=UUID.randomUUID();
        jdbc.sql("INSERT INTO work_edition(id,work_id,name,language,is_original) VALUES (?,?,?,?,?)").params(edition,id,b.name().trim(),b.language().trim(),Boolean.TRUE.equals(b.original())).update();audit(id,"CREATE_EDITION",null,json(Map.of("id",edition)));return Map.of("id",edition);
    }

    @PostMapping("/works/{publicId}/chapters") @Transactional
    public Map<String,Object> chapter(@PathVariable UUID publicId,@RequestBody ChapterBody b){
        long id=work(publicId);long owner=jdbc.sql("SELECT work_id FROM work_edition WHERE id=?").param(b.editionId()).query(Long.class).optional().orElseThrow(()->new ResponseStatusException(HttpStatus.BAD_REQUEST,"Edição inválida"));
        if(owner!=id||blank(b.displayNumber())==null||b.sortPosition()==null)bad("Edição, número e ordem são obrigatórios");UUID chapter=UUID.randomUUID();
        jdbc.sql("INSERT INTO chapter(id,edition_id,volume_id,title,display_number,sort_position) VALUES (?,?,?,?,?,?)").params(chapter,b.editionId(),b.volumeId(),blank(b.title()),b.displayNumber().trim(),b.sortPosition()).update();audit(id,"CREATE_CHAPTER",null,json(Map.of("id",chapter)));return Map.of("id",chapter,"availability","UNAVAILABLE");
    }

    @PostMapping("/works/{publicId}/relations") @Transactional
    public Map<String,Object> relation(@PathVariable UUID publicId,@RequestBody RelationBody b){
        long source=work(publicId),target=work(b.targetWorkId());if(source==target)bad("Uma obra não pode relacionar-se consigo mesma");
        String type=blank(b.relationType());if(type==null)bad("Tipo da relação é obrigatório");UUID relation=UUID.randomUUID();
        jdbc.sql("INSERT INTO work_relation(id,source_work_id,target_work_id,relation_type) VALUES (?,?,?,?) ON CONFLICT(source_work_id,target_work_id,relation_type) DO NOTHING").params(relation,source,target,type.toUpperCase()).update();audit(source,"CREATE_RELATION",null,json(Map.of("target",b.targetWorkId(),"type",type)));return Map.of("id",relation);
    }

    @GetMapping("/works/{publicId}/audit") public List<Map<String,Object>> audit(@PathVariable UUID publicId){long id=work(publicId);return jdbc.sql("SELECT id,action,before_data,after_data,created_at,actor_id FROM catalog_audit_event WHERE work_id=? ORDER BY created_at DESC LIMIT 100").param(id).query((rs,n)->{Map<String,Object> m=new java.util.LinkedHashMap<>();for(int i=1;i<=rs.getMetaData().getColumnCount();i++)m.put(rs.getMetaData().getColumnLabel(i),rs.getObject(i));return m;}).list();}

    private long work(UUID id){return jdbc.sql("SELECT id FROM work WHERE public_id=?").param(id).query(Long.class).optional().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Obra não encontrada"));}
    private Map<String,Object> view(long id){return jdbc.sql("SELECT public_id AS id,slug,title,media_family,work_format,story_status,visibility,updated_at FROM work WHERE id=?").param(id).query((rs,n)->{var m=new java.util.LinkedHashMap<String,Object>();for(int i=1;i<=rs.getMetaData().getColumnCount();i++)m.put(rs.getMetaData().getColumnLabel(i),rs.getObject(i));return m;}).single();}
    private String snapshot(long id){return json(view(id));}
    private void audit(long id,String action,String before,String after){jdbc.sql("INSERT INTO catalog_audit_event(actor_id,work_id,action,before_data,after_data) VALUES (?,?,?,CAST(? AS jsonb),CAST(? AS jsonb))").params(CurrentUser.id(),id,action,before,after).update();}
    private String json(Object value){try{return mapper.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException(e);}}
    private static String blank(String value){return value==null||value.isBlank()?null:value;}
    private static void bad(String message){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
}

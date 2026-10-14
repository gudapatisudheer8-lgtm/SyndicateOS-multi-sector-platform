package com.syndicateos.erp;

import com.fasterxml.jackson.databind.*;
import com.syndicateos.auth.SessionAccount;
import com.syndicateos.core.*;
import java.nio.file.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/erp/{projectId}/blueprint")
public class BlueprintController {
    private final JdbcTemplate jdbc;
    private final ErpAccess access;
    private final TransactionTemplate tx;
    private final ObjectMapper json;
    private final BlueprintAiClient ai;
    private final ProjectLayout layouts;
    private final Path directory;
    private static final Set<String> TYPES=Set.of("application/pdf","image/png","image/jpeg","image/webp");
    public BlueprintController(JdbcTemplate jdbc,ErpAccess access,TransactionTemplate tx,ObjectMapper json,BlueprintAiClient ai,ProjectLayout layouts,
        @Value("${sos.upload-directory:/var/lib/syndicateos/uploads}") String directory) {
        this.jdbc=jdbc;this.access=access;this.tx=tx;this.json=json;this.ai=ai;this.layouts=layouts;this.directory=Path.of(directory).toAbsolutePath().normalize();
    }
    @PostMapping("/generate")
    public Map<String,Object> generate(@AuthenticationPrincipal SessionAccount actor,@PathVariable UUID projectId,@RequestBody JsonNode body) {
        return tx.execute(s->{
            manage(actor,projectId);access.attachmentProject(actor,projectId,"erp.manage",true);
            lock(projectId);checkRevision(projectId,body);
            ProjectLayout.Inputs inputs=layouts.load(projectId);
            JsonNode geometry=layouts.generate(projectId,inputs);
            BlueprintGeometry.validate(geometry,numbers(inputs),false);
            persist(actor,projectId,null,geometry,false);
            return state(actor,projectId);
        });
    }
    @GetMapping
    public Map<String,Object> read(@AuthenticationPrincipal SessionAccount actor,@PathVariable UUID projectId) {
        return tx.execute(s->{access.attachmentProject(actor,projectId,"erp.read",false);return state(actor,projectId);});
    }
    @PostMapping("/analyze")
    public Map<String,Object> analyze(@AuthenticationPrincipal SessionAccount actor,@PathVariable UUID projectId,@RequestBody JsonNode body) {
        return tx.execute(s->{
            manage(actor,projectId); lock(projectId); checkRevision(projectId,body);
            UUID attachment=Values.id(body,"attachmentId"); var metadata=attachment(projectId,attachment);
            try {
                byte[] bytes=Files.readAllBytes(directory.resolve(attachment.toString()));
                if(bytes.length==0||bytes.length>10*1024*1024) throw ApiProblem.invalid("Use a blueprint of at most 10 MB.");
                JsonNode geometry=ai.extract(bytes,metadata.get("content_type").toString(),metadata.get("file_name").toString());
                manage(actor,projectId);
                persist(actor,projectId,attachment,geometry,false);
                return state(actor,projectId);
            } catch(java.io.IOException e) { throw new ApiProblem(404,"ATTACHMENT_MISSING","The original file is unavailable. Upload it again."); }
        });
    }
    @PostMapping("/save")
    public Map<String,Object> save(@AuthenticationPrincipal SessionAccount actor,@PathVariable UUID projectId,@RequestBody JsonNode body) {
        return tx.execute(s->{
            manage(actor,projectId);access.attachmentProject(actor,projectId,"erp.manage",true);
            lock(projectId);checkRevision(projectId,body);
            UUID attachment=body.hasNonNull("attachmentId")?Values.id(body,"attachmentId"):null;
            if(attachment!=null) attachment(projectId,attachment);
            boolean confirm=body.path("confirm").asBoolean(false);
            if(confirm&&!body.path("reviewAcknowledged").asBoolean(false)) throw ApiProblem.invalid("Review the plot labels, roads, park, measurements and illustrative positions before confirming.");
            JsonNode geometry=body.path("geometry");
            ProjectLayout.Inputs inputs=layouts.load(projectId);
            BlueprintGeometry.validate(geometry,numbers(inputs),confirm);
            validateInventory(geometry,inputs,confirm);
            persist(actor,projectId,attachment,geometry,confirm);return state(actor,projectId);
        });
    }
    private Set<String> numbers(ProjectLayout.Inputs inputs) {
        Set<String> result=new HashSet<>();for(JsonNode p:inputs.plots()) result.add(p.path("number").asText());return result;
    }
    private void validateInventory(JsonNode geometry,ProjectLayout.Inputs inputs,boolean confirm) {
        if(geometry.hasNonNull("inventoryFingerprint")&&!inputs.fingerprint().equals(geometry.path("inventoryFingerprint").asText()))
            throw new ApiProblem(409,"LAYOUT_INPUTS_CHANGED","Project measurements or plot inventory changed. Reload and reconcile the drawing; the last confirmed presentation remains unchanged.");
        Map<String,JsonNode> byId=new HashMap<>();for(JsonNode p:inputs.plots()) byId.put(p.path("id").asText(),p);
        Set<String> seen=new HashSet<>();
        for(JsonNode p:geometry.path("plots")) if(p.hasNonNull("id")) {
            JsonNode live=byId.get(p.path("id").asText());
            if(live==null||!seen.add(p.path("id").asText())||!live.path("number").asText().equals(p.path("number").asText())
                ||!live.path("facing").asText().equals(p.path("facing").asText()))
                throw ApiProblem.invalid("A linked plot's identity, number and facing must match current inventory. Reconcile the layout instead of editing operational records here.");
        }
        if(confirm&&geometry.path("layoutVersion").asInt()>=2) {
            if(!geometry.hasNonNull("inventoryFingerprint")||seen.size()!=byId.size())
                throw ApiProblem.invalid("A project-generated layout must contain every live plot exactly once before confirmation.");
        }
    }
    private void manage(SessionAccount actor,UUID project) {
        actor.business();
        if(!"ACCOUNTANT".equals(actor.role())) throw ApiProblem.denied();
        // A blueprint lock is separate from project money writes; do not hold their row lock during AI processing.
        var row=access.attachmentProject(actor,project,"erp.manage",false);
        if(!Boolean.TRUE.equals(row.get("assignment_enabled"))||!"ACTIVE".equals(row.get("status"))) throw ApiProblem.denied();
    }
    private void lock(UUID project) {
        if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT pg_try_advisory_xact_lock(hashtextextended(?,0))",Boolean.class,"blueprint:"+project)))
            throw new ApiProblem(409,"BLUEPRINT_BUSY","Another blueprint operation is running. Wait for it to finish, then reload.");
    }
    private void checkRevision(UUID project,JsonNode body) {
        JsonNode requested=body.get("revision");
        if(requested==null||!requested.isIntegralNumber()||requested.asLong()<0) throw ApiProblem.invalid("Supply the captured blueprint revision.");
        Long current=jdbc.queryForObject("SELECT coalesce((SELECT revision FROM sos.project_blueprints WHERE project_id=?),0)",Long.class,project);
        if(requested.asLong()!=current) throw ApiProblem.conflict();
    }
    private Map<String,Object> attachment(UUID project,UUID attachment) {
        var rows=jdbc.queryForList("SELECT * FROM sos.erp_attachments WHERE id=? AND project_id=?",attachment,project);
        if(rows.isEmpty()) throw ApiProblem.denied();
        if(!TYPES.contains(rows.getFirst().get("content_type").toString())) throw ApiProblem.invalid("Select a PDF, PNG, JPEG or WebP blueprint.");
        return rows.getFirst();
    }
    private void persist(SessionAccount actor,UUID project,UUID attachment,JsonNode geometry,boolean confirm) {
        jdbc.update("""
            INSERT INTO sos.project_blueprints(project_id,source_attachment_id,status,draft,confirmed,confirmed_attachment_id,reviewed_by,reviewed_at,updated_by)
            VALUES (?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, CASE WHEN ? THEN now() ELSE NULL END, ?)
            ON CONFLICT(project_id) DO UPDATE SET source_attachment_id=excluded.source_attachment_id,
                status=excluded.status,draft=excluded.draft,revision=sos.project_blueprints.revision+1,
                confirmed=CASE WHEN ? THEN excluded.confirmed ELSE sos.project_blueprints.confirmed END,
                confirmed_attachment_id=CASE WHEN ? THEN excluded.confirmed_attachment_id ELSE sos.project_blueprints.confirmed_attachment_id END,
                reviewed_by=CASE WHEN ? THEN excluded.reviewed_by ELSE sos.project_blueprints.reviewed_by END,
                reviewed_at=CASE WHEN ? THEN now() ELSE sos.project_blueprints.reviewed_at END,
                updated_at=now(),updated_by=excluded.updated_by
            """,project,attachment,confirm?"CONFIRMED":"DRAFT",geometry.toString(),confirm?geometry.toString():null,
            confirm?attachment:null,confirm?actor.identityId():null,confirm,actor.identityId(),confirm,confirm,confirm,confirm);
        if(confirm) jdbc.update("""
            INSERT INTO sos.project_blueprint_versions(project_id,revision,geometry,source_attachment_id,reviewed_by)
            SELECT project_id,revision,confirmed,confirmed_attachment_id,reviewed_by
            FROM sos.project_blueprints WHERE project_id=?
            """,project);
        jdbc.update("INSERT INTO sos.erp_audit(id,project_id,actor_id,event) VALUES (?,?,?,?)",
            UUID.randomUUID(),project,actor.identityId(),confirm?"BLUEPRINT_CONFIRMED":"BLUEPRINT_DRAFT_SAVED");
    }
    private Map<String,Object> state(SessionAccount actor,UUID project) {
        var result=new LinkedHashMap<String,Object>();
        boolean manage="ACCOUNTANT".equals(actor.role());
        if(manage) {
            try { manage(actor,project); }
            catch(ApiProblem e) { if(e.status==403||e.status==400) manage=false; else throw e; }
        }
        result.put("revision",0);result.put("status","EMPTY");result.put("sourceAttachmentId",null);
        result.put("draft",null);result.put("confirmed",null);result.put("canManage",manage);
        ProjectLayout.Inputs inputs=layouts.load(project);
        result.put("inventoryFingerprint",inputs.fingerprint());result.put("needsReconciliation",false);
        result.put("warnings",inputs.warnings());
        var rows=jdbc.queryForList("SELECT * FROM sos.project_blueprints WHERE project_id=?",project);
        if(!rows.isEmpty()) {
            var r=rows.getFirst();result.put("revision",r.get("revision"));
            result.put("status",manage?r.get("status"):r.get("confirmed")==null?"EMPTY":"CONFIRMED");
            result.put("sourceAttachmentId",manage?r.get("source_attachment_id"):r.get("confirmed_attachment_id"));
            result.put("draft",manage?parse(r.get("draft")):null);
            result.put("confirmed",parse(r.get("confirmed")));
            result.put("confirmedAttachmentId",r.get("confirmed_attachment_id"));
            JsonNode inspected=parse(manage?r.get("draft"):r.get("confirmed"));
            result.put("needsReconciliation",inspected!=null&&inspected.hasNonNull("inventoryFingerprint")
                &&!inputs.fingerprint().equals(inspected.path("inventoryFingerprint").asText()));
        }
        result.put("attachments",jdbc.queryForList("""
            SELECT a.id,a.file_name AS "fileName",a.content_type AS "contentType"
            FROM sos.erp_attachments a WHERE a.project_id=?
            AND a.content_type IN ('application/pdf','image/png','image/jpeg','image/webp')
            AND (EXISTS(SELECT 1 FROM sos.erp_records d WHERE d.project_id=a.project_id AND d.kind='documents'
                AND d.status<>'deleted' AND d.data->>'attachmentId'=a.id::text
                AND d.data->>'category' IN ('master_layout','floor_plan','elevation','structural','master layout','floor plan'))
              OR a.id IN (SELECT source_attachment_id FROM sos.project_blueprints WHERE project_id=?)
              OR a.id IN (SELECT confirmed_attachment_id FROM sos.project_blueprints WHERE project_id=?))
            ORDER BY a.created_at DESC
            """,project,project,project));
        return result;
    }
    private JsonNode parse(Object value) {
        if(value==null) return null;
        try { return json.readTree(value.toString()); }
        catch(Exception e) { throw new ApiProblem(503,"INVALID_BLUEPRINT","Saved blueprint could not be read."); }
    }
}

package com.syndicateos.erp;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.syndicateos.auth.SessionAccount;
import com.syndicateos.core.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

/** A live project's documents are editable independently of finalized financial setup. */
@RestController
@RequestMapping("/api/erp/{projectId}/documents")
public class ProjectDocumentController {
    private final JdbcTemplate jdbc;
    private final ErpAccess access;
    private final ErpService erp;
    private final ObjectMapper json;
    private final TransactionTemplate tx;
    public ProjectDocumentController(JdbcTemplate jdbc,ErpAccess access,ErpService erp,ObjectMapper json,TransactionTemplate tx) {
        this.jdbc=jdbc;this.access=access;this.erp=erp;this.json=json;this.tx=tx;
    }
    @GetMapping
    public Map<String,Object> read(@AuthenticationPrincipal SessionAccount actor,@PathVariable UUID projectId) {
        return tx.execute(s->{access.project(actor,projectId,"erp.read",false);return state(actor,projectId);});
    }
    @PostMapping
    public Map<String,Object> save(@AuthenticationPrincipal SessionAccount actor,@PathVariable UUID projectId,@RequestBody JsonNode body) {
        return tx.execute(s->{
            if(!"ACCOUNTANT".equals(actor.role())) throw ApiProblem.denied();
            var scope=access.project(actor,projectId,"erp.manage",true);
            if(Values.revision(body)!=((Number)scope.get("revision")).intValue()) throw ApiProblem.conflict();
            var documents=body.path("documents");
            if(!documents.isArray()||documents.size()>100) throw ApiProblem.invalid("Supply at most 100 project documents.");
            var existing=jdbc.queryForList("SELECT id,revision,data FROM sos.erp_records WHERE project_id=? AND kind='documents' AND status<>'deleted' FOR UPDATE",projectId);
            Map<UUID,Map<String,Object>> byId=new HashMap<>();
            for(var r:existing) byId.put((UUID)r.get("id"),r);
            Set<UUID> retained=new HashSet<>(),files=new HashSet<>();
            for(JsonNode d:documents) {
                UUID file=Values.id(d,"attachmentId");
                if(!files.add(file)) throw ApiProblem.invalid("A file can occur only once in this document list.");
                if(jdbc.queryForObject("SELECT count(*) FROM sos.erp_attachments WHERE id=? AND project_id=?",Integer.class,file,projectId)!=1)
                    throw ApiProblem.denied();
                ObjectNode data=json.createObjectNode().put("title",Values.text(d,"title",256))
                    .put("category",Values.text(d,"category",80)).put("attachmentId",file.toString());
                ObjectNode command=json.createObjectNode().put("projectId",projectId.toString()).put("kind","documents")
                    .put("requestId",UUID.randomUUID().toString());
                if(d.hasNonNull("id")) {
                    UUID id=Values.id(d,"id");
                    var old=byId.get(id);
                    if(old==null||!retained.add(id)) throw ApiProblem.invalid("Reload the current project documents before saving.");
                    // Keep optional legacy metadata; only the document fields can be changed.
                    ObjectNode merged=(ObjectNode)parse(old.get("data"));data.fields().forEachRemaining(e->merged.set(e.getKey(),e.getValue()));
                    if(merged.equals(parse(old.get("data")))) continue;
                    command.put("recordId",id.toString()).put("revision",((Number)old.get("revision")).intValue());
                    command.set("data",merged);
                } else command.set("data",data);
                erp.execute(actor,"erp.save",command);
            }
            for(var r:existing) if(!retained.contains((UUID)r.get("id"))) {
                erp.execute(actor,"erp.delete",json.createObjectNode().put("projectId",projectId.toString())
                    .put("recordId",r.get("id").toString()).put("revision",((Number)r.get("revision")).intValue()));
            }
            return state(actor,projectId);
        });
    }
    private Map<String,Object> state(SessionAccount actor,UUID project) {
        var documents=new ArrayList<Map<String,Object>>();
        for(var r:jdbc.queryForList("""
            SELECT r.id,r.data,a.file_name,a.content_type,a.size_bytes
            FROM sos.erp_records r LEFT JOIN sos.erp_attachments a
              ON a.project_id=r.project_id AND a.id::text=r.data->>'attachmentId'
            WHERE r.project_id=? AND r.kind='documents' AND r.status<>'deleted'
            ORDER BY r.created_at,r.id
            """,project)) {
            JsonNode d=parse(r.get("data"));
            var out=new LinkedHashMap<String,Object>();
            out.put("id",r.get("id"));out.put("title",d.path("title").asText(""));
            out.put("category",d.path("category").asText(""));out.put("attachmentId",d.path("attachmentId").asText(""));
            out.put("fileName",Objects.toString(r.get("file_name"),"File unavailable"));
            out.put("contentType",Objects.toString(r.get("content_type"),"application/octet-stream"));
            out.put("size",r.get("size_bytes")==null?0:r.get("size_bytes"));documents.add(out);
        }
        boolean canManage=false;
        if("ACCOUNTANT".equals(actor.role())) try {
            var scope=access.project(actor,project,"erp.manage",false);
            canManage=Boolean.TRUE.equals(scope.get("assignment_enabled"))&&"ACTIVE".equals(scope.get("status"));
        } catch(ApiProblem e) { if(e.status!=400&&e.status!=403) throw e; }
        List<Map<String,String>> categories=new ArrayList<>();
        var definitions=jdbc.queryForList("""
            SELECT e.fields FROM sos.erp_resources e
            JOIN sos.firm_sector_assignments a ON a.release_id=e.release_id
            JOIN sos.projects p ON p.firm_id=a.firm_id AND p.sector_id=a.sector_id
            WHERE p.id=? AND e.kind='documents'
            """,project);
        if(!definitions.isEmpty()) for(JsonNode field:parse(definitions.getFirst().get("fields")))
            if("category".equals(field.path("key").asText())) for(JsonNode option:field.path("options")) {
                String value=option.asText();
                categories.add(Map.of("value",value,"label",field.path("optionLabels").path(value).asText(value.replace('_',' '))));
            }
        return Map.of("revision",jdbc.queryForObject("SELECT revision FROM sos.projects WHERE id=?",Integer.class,project),
            "documents",documents,"canManage",canManage,"categories",categories);
    }
    private JsonNode parse(Object data) {
        try {return json.readTree(data.toString());}
        catch(Exception e) {throw new ApiProblem(503,"INVALID_DOCUMENT","Saved project document could not be read.");}
    }
}

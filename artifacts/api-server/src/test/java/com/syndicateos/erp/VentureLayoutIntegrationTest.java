package com.syndicateos.erp;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.syndicateos.auth.SessionAccount;
import com.syndicateos.core.ApiProblem;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import static org.junit.jupiter.api.Assertions.*;

/** Opt-in localhost disposable test database; never customer RDS or real preview records. */
@EnabledIfEnvironmentVariable(named="SOS_DIRECT_TEST_JDBC_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sos_direct_test")
@SpringBootTest(properties={
    "spring.datasource.url=${SOS_DIRECT_TEST_JDBC_URL}","spring.datasource.username=sos_test","spring.datasource.password=",
    "spring.datasource.hikari.read-only=false","sos.database-name=sos_direct_test","sos.setup-approved=true","sos.writes-enabled=true",
    "SOS_OWNER_MOBILE=+919888880001","SOS_OWNER_INITIAL_PASSWORD=Direct-test-owner-123","spring.flyway.enabled=true",
    "sos.registration-initial-delay-ms=1000000","sos.push-initial-delay-ms=1000000"
})
@Transactional
class VentureLayoutIntegrationTest {
    @Autowired BlueprintController blueprints;
    @Autowired ProjectDocumentController documents;
    @Autowired ErpService erp;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    record Fixture(UUID project,UUID firm,SessionAccount accountant,SessionAccount partner,List<UUID> plots) {}
    Fixture fixture() {
        UUID firm=UUID.randomUUID(),project=UUID.randomUUID(),staff=UUID.randomUUID(),partner=UUID.randomUUID();
        String code="VL-"+UUID.randomUUID().toString().substring(0,8).toUpperCase(Locale.ROOT);
        for(UUID id:List.of(staff,partner))
            jdbc.update("INSERT INTO sos.identities(id,mobile,display_name,credential_hash,must_change_credential) VALUES(?,?,?,'not-a-login-hash',false)",
                id,"+91"+Math.abs(System.nanoTime()%10000000000L),"Isolated layout fixture");
        jdbc.update("INSERT INTO sos.firms(id,client_code,name,created_by) VALUES(?,?,?,?)",firm,code,"Isolated layout fixture",staff);
        jdbc.update("INSERT INTO sos.firm_memberships(firm_id,identity_id,role_code) VALUES(?,?,'ACCOUNTANT'),(?,?,'PARTNER')",firm,staff,firm,partner);
        var rel=jdbc.queryForList("""
            SELECT r.id,r.sector_id FROM sos.sector_releases r JOIN sos.sectors s ON s.id=r.sector_id
            WHERE r.state='PUBLISHED' AND s.code='open-plotting' ORDER BY r.version DESC LIMIT 1
            """).getFirst();
        jdbc.update("INSERT INTO sos.firm_sector_assignments(firm_id,sector_id,release_id) VALUES(?,?,?)",firm,rel.get("sector_id"),rel.get("id"));
        jdbc.update("""
            INSERT INTO sos.projects(id,firm_id,sector_id,name,created_by,setup_state,setup_release_id,details)
            VALUES(?,?,?,'Layout test',?,'READY',?,'{"extentValue":2,"extentUnit":"Acres","roadWidth":"30","openSpacePercent":10}')
            """,project,firm,rel.get("sector_id"),staff,rel.get("id"));
        jdbc.update("INSERT INTO sos.project_memberships(project_id,firm_id,identity_id) VALUES(?,?,?)",project,firm,partner);
        jdbc.update("""
            INSERT INTO sos.erp_project_settings(project_id,data)
            VALUES(?,'{"projectPlan":{"groups":[{"count":2,"facing":"East","areaSqYards":150}]}}')
            """,project);
        List<UUID> plots=new ArrayList<>();
        for(int i=0;i<4;i++) {
            UUID id=UUID.randomUUID();plots.add(id);
            String d=json.createObjectNode().put("plotNumber",Integer.toString(i+1)).put("facing",i<2?"East":"North-East Corner")
                .put("areaSqYards",150).put("dimensions",i%2==0?"29 x 46":"").put("status",i==0?"booked":"available")
                .put("ratePerSqYard",10000).toString();
            jdbc.update("""
                INSERT INTO sos.erp_records(id,project_id,firm_id,kind,data,request_data,status,created_by,request_id)
                VALUES(?,?,?,'plots',?::jsonb,'{}','approved',?,?)
                """,id,project,firm,d,staff,UUID.randomUUID());
        }
        return new Fixture(project,firm,new SessionAccount(staff,"ACCOUNTANT","Layout test","",false,firm,code),
            new SessionAccount(partner,"PARTNER","Layout test","",false,firm,code),plots);
    }
    ObjectNode request(long revision) {return json.createObjectNode().put("revision",revision);}
    long revision(Map<String,Object> s) {return ((Number)s.get("revision")).longValue();}
    ObjectNode draft(Map<String,Object> s) {return ((ObjectNode)s.get("draft")).deepCopy();}
    Map<String,Object> generate(Fixture f,long rev) {return blueprints.generate(f.accountant,f.project,request(rev));}
    Map<String,Object> save(Fixture f,Map<String,Object> state,ObjectNode g,boolean confirm) {
        ObjectNode body=request(revision(state)).putNull("attachmentId").put("confirm",confirm).put("reviewAcknowledged",confirm);
        body.set("geometry",g);return blueprints.save(f.accountant,f.project,body);
    }
    UUID file(Fixture f,String name) {
        UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO sos.erp_attachments(id,project_id,uploaded_by,file_name,content_type,size_bytes) VALUES(?,?,?,?,'application/pdf',10)",
            id,f.project,f.accountant.identityId(),name);return id;
    }
    @Test void noOriginalGenerateConfirmEditAndReopenPreservesMoneyAndLastConfirmed() {
        var f=fixture();
        var before=jdbc.queryForList("SELECT id,data,revision,status FROM sos.erp_records WHERE project_id=? ORDER BY id",f.project);
        var state=generate(f,0);assertNull(state.get("sourceAttachmentId"));
        assertEquals(4,draft(state).path("plots").size());assertFalse(((List<?>)state.get("warnings")).isEmpty());
        var published=save(f,state,draft(state),true);
        Object confirmed=published.get("confirmed");
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM sos.project_blueprint_versions WHERE project_id=?",Integer.class,f.project));
        var regenerated=generate(f,revision(published));
        assertEquals(confirmed,regenerated.get("confirmed"));
        assertEquals("DRAFT",regenerated.get("status"));
        var partner=blueprints.read(f.partner,f.project);
        assertNull(partner.get("draft"));assertEquals("CONFIRMED",partner.get("status"));assertEquals(confirmed,partner.get("confirmed"));
        assertEquals(before,jdbc.queryForList("SELECT id,data,revision,status FROM sos.erp_records WHERE project_id=? ORDER BY id",f.project));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM sos.erp_postings WHERE project_id=?",Integer.class,f.project));
        var edited=draft(regenerated);edited.put("notes","Moved park, reviewed");
        var saved=save(f,regenerated,edited,false);
        assertEquals(edited,blueprints.read(f.accountant,f.project).get("draft"));
        assertEquals(confirmed,saved.get("confirmed"));
        var again=save(f,saved,edited,true);
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM sos.project_blueprint_versions WHERE project_id=?",Integer.class,f.project));
        assertEquals(edited,again.get("confirmed"));
    }
    @Test void staleRevisionChangedInventoryAndPartnerWritesAreDenied() {
        var f=fixture();var s=generate(f,0);
        assertThrows(ApiProblem.class,()->generate(f,0));
        assertThrows(ApiProblem.class,()->blueprints.generate(f.partner,f.project,request(revision(s))));
        var other=fixture();
        assertThrows(ApiProblem.class,()->blueprints.read(other.accountant,f.project));
        jdbc.update("UPDATE sos.erp_records SET data=jsonb_set(data,'{dimensions}','\"30 x 45\"') WHERE id=?",f.plots.get(0));
        assertEquals(true,blueprints.read(f.accountant,f.project).get("needsReconciliation"));
        var changed=assertThrows(ApiProblem.class,()->save(f,s,draft(s),true));
        assertEquals(409,changed.status);
        assertNull(blueprints.read(f.partner,f.project).get("confirmed"));
    }
    @Test void linkedIdentityFacingAndAllLivePlotsAreValidatedAtConfirmation() {
        var f=fixture();var s=generate(f,0);var g=draft(s);
        ((ObjectNode)g.path("plots").get(0)).put("facing","UNKNOWN");
        assertThrows(ApiProblem.class,()->save(f,s,g,true));
        var missing=draft(s);((ArrayNode)missing.path("plots")).remove(0);
        assertThrows(ApiProblem.class,()->save(f,s,missing,true));
        var duplicate=draft(s);((ObjectNode)duplicate.path("plots").get(0)).put("id",duplicate.path("plots").get(1).path("id").asText());
        assertThrows(ApiProblem.class,()->save(f,s,duplicate,false));
    }
    @Test void documentsSaveReopenRemoveAndLegacyWriterConcurrencyAreSafe() {
        var f=fixture();UUID original=file(f,"venture.pdf"),receipt=file(f,"payment-receipt.pdf");
        var initial=documents.read(f.accountant,f.project);
        assertTrue(((List<?>)initial.get("categories")).stream().anyMatch(c->"statutory_clearance".equals(((Map<?,?>)c).get("value"))),
            "Category choices come from the active database configuration, not a client-only permit option.");
        ObjectNode body=request(revision(initial));
        body.putArray("documents").addObject().put("title","Original plan").put("category","master_layout").put("attachmentId",original.toString());
        var added=documents.save(f.accountant,f.project,body);
        assertTrue(revision(added)>revision(initial));
        var current=(List<?>)added.get("documents");assertEquals(1,current.size());
        assertEquals(current,documents.read(f.accountant,f.project).get("documents"));
        assertEquals(1,((List<?>)blueprints.read(f.accountant,f.project).get("attachments")).size(),"Receipt upload isn't a plan document.");
        assertThrows(ApiProblem.class,()->documents.save(f.accountant,f.project,body));
        ObjectNode update=request(revision(added));
        update.set("documents",json.valueToTree(current));
        ((ObjectNode)update.path("documents").get(0)).put("title","Revised title").put("category","floor_plan");
        var revised=documents.save(f.accountant,f.project,update);
        assertEquals("Revised title",((Map<?,?>)((List<?>)revised.get("documents")).getFirst()).get("title"));
        // Existing ERP clients can also save docs; their writes invalidate stale /documents snapshots.
        erp.execute(f.accountant,"erp.save",json.valueToTree(Map.of("projectId",f.project.toString(),"kind","documents",
            "requestId",UUID.randomUUID().toString(),"data",Map.of("title","Second plan","category","master_layout","attachmentId",receipt.toString()))));
        assertThrows(ApiProblem.class,()->documents.save(f.accountant,f.project,update));
        var refreshed=documents.read(f.accountant,f.project);
        ObjectNode remove=request(revision(refreshed));remove.putArray("documents");
        var removed=documents.save(f.accountant,f.project,remove);
        assertTrue(((List<?>)removed.get("documents")).isEmpty());
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM sos.erp_attachments WHERE project_id=?",Integer.class,f.project),"Private historical bytes/metadata retained.");
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM sos.erp_records WHERE project_id=? AND kind='documents' AND status='deleted'",Integer.class,f.project));
    }
    @Test void crossProjectFilesAndPartnerDocumentUpdatesCannotBeSmuggledIn() {
        var f=fixture();var other=fixture();UUID foreign=file(other,"foreign.pdf");
        var initial=documents.read(f.accountant,f.project);
        ObjectNode bad=request(revision(initial));
        bad.putArray("documents").addObject().put("title","Not mine").put("category","master_layout").put("attachmentId",foreign.toString());
        assertThrows(ApiProblem.class,()->documents.save(f.accountant,f.project,bad));
        assertThrows(ApiProblem.class,()->documents.save(f.partner,f.project,bad));
        assertThrows(ApiProblem.class,()->documents.read(other.accountant,f.project));
    }
    @Test void legacyUploadedGeometryAndItsHistoricalReferenceRemainReadable() {
        var f=fixture();UUID source=file(f,"legacy-plan.pdf");
        ObjectNode legacy=json.createObjectNode().putNull("northDegrees").put("notes","Previously reviewed source");
        legacy.putArray("plots").addObject().put("number","1").put("facing","E").set("points",json.valueToTree(List.of(Map.of("x",10,"y",10),Map.of("x",40,"y",10),Map.of("x",40,"y",40))));
        legacy.putArray("roads");
        var body=request(0).put("attachmentId",source.toString()).put("confirm",true).put("reviewAcknowledged",true);body.set("geometry",legacy);
        var saved=blueprints.save(f.accountant,f.project,body);
        assertEquals(legacy,saved.get("confirmed"));assertEquals(source,saved.get("confirmedAttachmentId"));
        assertEquals(1,((List<?>)saved.get("attachments")).size());
        assertEquals(legacy,blueprints.read(f.partner,f.project).get("confirmed"));
    }
}

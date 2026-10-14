package com.syndicateos.marketing;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.fasterxml.jackson.databind.*;
import com.syndicateos.auth.SessionAccount;
import com.syndicateos.core.ApiProblem;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** Only explicitly enabled against a disposable local database; all fixture writes roll back. */
@EnabledIfEnvironmentVariable(named="SOS_MARKETING_TEST_JDBC_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sos_marketing_test")
@SpringBootTest(properties={
    "spring.datasource.url=${SOS_MARKETING_TEST_JDBC_URL}", "spring.datasource.username=sos_test",
    "spring.datasource.password=", "spring.datasource.hikari.read-only=false",
    "sos.database-name=sos_marketing_test", "sos.setup-approved=true", "sos.writes-enabled=true",
    "SOS_OWNER_MOBILE=+919888880000", "SOS_OWNER_INITIAL_PASSWORD=Owner-integration-123",
    "spring.flyway.enabled=false"
})
@AutoConfigureMockMvc
@Transactional
class MarketingAccessIntegrationTest {
    @Autowired MarketingService service;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired PasswordEncoder encoder;
    @Autowired MockMvc http;

    private JsonNode node(Map<String,Object> data) { return json.valueToTree(data); }
    @Test void isolatedInvitationsResetPrivacyAndReviewedProposals() throws Exception {
        UUID accountant=UUID.randomUUID(),firm=UUID.randomUUID(),project=UUID.randomUUID(),otherProject=UUID.randomUUID();
        UUID available=UUID.randomUUID(),sold=UUID.randomUUID(),foreignPlot=UUID.randomUUID();
        String mobile="+919777771111",originalHash=encoder.encode("762415");
        jdbc.update("INSERT INTO sos.identities(id,mobile,display_name,credential_hash,must_change_credential) VALUES(?,?,?,?,false)",
            accountant,mobile,"Isolated accountant",originalHash);
        jdbc.update("INSERT INTO sos.firms(id,client_code,name,created_by) VALUES(?,'MKT-UNIT','Isolated firm',?)",firm,accountant);
        jdbc.update("INSERT INTO sos.firm_memberships(firm_id,identity_id,role_code) VALUES(?,?,'ACCOUNTANT')",firm,accountant);
        var release=jdbc.queryForMap("""
            SELECT r.id,r.sector_id FROM sos.sector_releases r JOIN sos.erp_resources e ON e.release_id=r.id
            WHERE r.state='PUBLISHED' AND e.kind='plots' ORDER BY r.version DESC LIMIT 1
            """);
        jdbc.update("INSERT INTO sos.firm_sector_assignments(firm_id,sector_id,release_id) VALUES(?,?,?)",
            firm,release.get("sector_id"),release.get("id"));
        for(UUID id:List.of(project,otherProject))
            jdbc.update("""
                INSERT INTO sos.projects(id,firm_id,sector_id,name,details,created_by,setup_state,setup_release_id)
                VALUES(?,?,?,'Isolated venture','{"floorRatePerSqYard":10000}'::jsonb,?,'READY',?)
                """,id,firm,release.get("sector_id"),accountant,release.get("id"));
        for(UUID id:List.of(available,sold,foreignPlot)) {
            boolean isSold=id.equals(sold);
            var data=node(Map.of("plotNumber",id.toString(),"areaSqYards",100,"facing","East",
                "status",isSold?"sold":"available","ratePerSqYard",12000,
                "buyerName","PRIVATE_CUSTOMER","buyerPhone","+919999990099","advanceReceived",90000,"notes","PRIVATE_NOTES"));
            jdbc.update("""
                INSERT INTO sos.erp_records(id,project_id,firm_id,kind,data,request_data,created_by,request_id,status)
                VALUES(?,?,?,'plots',?::jsonb,'{}'::jsonb,?,?,'approved')
                """,id,id.equals(foreignPlot)?otherProject:project,firm,data.toString(),accountant,UUID.randomUUID());
        }
        var actor=new SessionAccount(accountant,"ACCOUNTANT","Isolated accountant",mobile,false,firm,"MKT-UNIT");
        var issued=service.invite(actor,node(Map.of("projectId",project.toString(),"agentName","Isolated marketer","mobile",mobile)));
        String invite=(String)issued.get("invitationToken"),temporary=(String)issued.get("temporaryPin");
        assertNotNull(temporary); assertTrue((Boolean)issued.get("created"));
        var deadline=java.time.Instant.parse((String)issued.get("activationExpiresAt"));
        assertEquals(jdbc.queryForObject("SELECT expires_at FROM sos.marketing_invitations WHERE agent_id=(SELECT id FROM sos.marketing_agents WHERE mobile=?)",
            java.sql.Timestamp.class,mobile).toInstant(),deadline);
        jdbc.update("UPDATE sos.marketing_invitations SET expires_at=now()-interval '1 second' WHERE agent_id=(SELECT id FROM sos.marketing_agents WHERE mobile=?)",mobile);
        assertThrows(ApiProblem.class,()->service.info(invite),"An unactivated invitation must expire");
        jdbc.update("UPDATE sos.marketing_invitations SET expires_at=? WHERE agent_id=(SELECT id FROM sos.marketing_agents WHERE mobile=?)",
            java.sql.Timestamp.from(deadline),mobile);
        assertFalse(service.info(invite).containsKey("mobile"));
        http.perform(get("/api/marketing/access/invitation").param("invite",invite)).andExpect(status().isOk());
        http.perform(get("/api/marketing/projects/"+project+"/proposals")).andExpect(status().isUnauthorized());
        assertThrows(ApiProblem.class,()->service.login(node(Map.of("invite",invite,"mobile",mobile,"pin","0000"))));
        assertEquals(1,jdbc.queryForObject("SELECT failed_attempts FROM sos.marketing_agents WHERE mobile=?",Integer.class,mobile));
        var session=service.login(node(Map.of("invite",invite,"mobile",mobile,"pin",temporary)));
        String token=(String)session.get("token");
        assertTrue((Boolean)session.get("mustChangePin"));
        String temporarySession=token;
        assertThrows(ApiProblem.class,()->service.inventory(temporarySession,invite));
        assertThrows(ApiProblem.class,()->service.blueprint(temporarySession,invite));
        http.perform(get("/api/marketing/access/blueprint").param("invite",invite).header("X-Marketing-Session",token))
            .andExpect(status().isForbidden());
        http.perform(get("/api/marketing/access/inventory").param("invite",invite).header("X-Marketing-Session",token))
            .andExpect(status().isForbidden());
        session=service.changePin(token,node(Map.of("invite",invite,"newPin","654321")));
        token=(String)session.get("token"); String permanentSession=token;
        assertFalse((Boolean)session.get("mustChangePin"));
        jdbc.update("UPDATE sos.marketing_invitations SET expires_at=now()-interval '1 second' WHERE agent_id=(SELECT id FROM sos.marketing_agents WHERE mobile=?)",mobile);
        assertDoesNotThrow(()->service.info(invite),"Activation deadline does not revoke activated access");
        assertEquals("EMPTY",service.blueprint(token,invite).get("status"));
        assertNull(service.blueprint(token,invite).get("confirmed"));
        var geometry=json.readTree("""
            {"plots":[{"number":"LABEL","facing":"E","points":[{"x":0,"y":0,"privateUrl":"PRIVATE_URL"},{"x":20,"y":0},{"x":20,"y":20}],
              "buyerPhone":"PRIVATE_CONTACT","attachmentId":"PRIVATE_ATTACHMENT"}],
              "roads":[{"name":"Approach road","widthFeet":30,"points":[{"x":0,"y":25},{"x":90,"y":25}],"notes":"PRIVATE_ROAD"}],
              "parks":[{"name":"Park","id":"PRIVATE_ID","points":[{"x":30,"y":30},{"x":40,"y":30},{"x":40,"y":40}],"notes":"PRIVATE_PARK"}],
              "boundary":{"points":[{"x":0,"y":0},{"x":100,"y":0},{"x":100,"y":100}],"source":"PRIVATE_SOURCE"},
              "scale":{"widthFeet":100,"heightFeet":200,"provenance":"schematic","url":"PRIVATE_SCALE"},
              "northDegrees":0,"notes":"PRIVATE_NOTES","downloadUrl":"PRIVATE_URL"}
            """);
        ((com.fasterxml.jackson.databind.node.ObjectNode)geometry.path("plots").get(0)).put("number",available.toString());
        jdbc.update("""
            INSERT INTO sos.project_blueprints(project_id,status,draft,confirmed,updated_by)
            VALUES(?,'DRAFT','{"notes":"PRIVATE_DRAFT"}'::jsonb,?::jsonb,?)
            """,project,geometry.toString(),accountant);
        var presentation=json.valueToTree(service.blueprint(token,invite));
        assertEquals("CONFIRMED",presentation.path("status").asText());
        assertEquals(2,presentation.path("plots").size());
        assertEquals(available.toString(),presentation.path("confirmed").path("plots").get(0).path("number").asText());
        assertFalse(presentation.toString().contains("PRIVATE_"),presentation.toString());
        assertEquals(Set.of("status","confirmed","plots"),service.blueprint(token,invite).keySet());
        http.perform(get("/api/marketing/access/blueprint").param("invite",invite).header("X-Marketing-Session",token))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        http.perform(get("/api/marketing/access/blueprint").param("invite",invite)).andExpect(status().isUnauthorized());
        // Neither unapproved inventory statuses nor deleted plots are advertised as saleable.
        jdbc.update("UPDATE sos.erp_records SET status='pending' WHERE id=?",available);
        presentation=json.valueToTree(service.blueprint(token,invite));
        assertEquals(1,presentation.path("plots").size());
        assertTrue(presentation.path("confirmed").path("plots").get(0).path("referenceOnly").asBoolean());
        jdbc.update("UPDATE sos.erp_records SET status='approved',data=jsonb_set(data,'{status}','\"reserved\"') WHERE id=?",available);
        assertTrue(json.valueToTree(service.blueprint(token,invite)).toString().contains("reserved"));
        assertThrows(ApiProblem.class,()->service.session(temporarySession,invite));
        assertEquals(originalHash,jdbc.queryForObject("SELECT credential_hash FROM sos.identities WHERE id=?",String.class,accountant));
        assertThrows(ApiProblem.class,()->service.login(node(Map.of("invite",invite,"mobile",mobile,"pin",temporary))));
        var inventory=json.valueToTree(service.inventory(token,invite));
        assertEquals(2,inventory.path("plots").size());
        assertFalse(inventory.toString().contains("PRIVATE_"));
        for(JsonNode p:inventory.path("plots")) {
            assertFalse(p.has("buyerPhone")); assertFalse(p.has("advanceReceived")); assertFalse(p.has("notes"));
            if(p.path("status").asText().equals("sold")) assertFalse(p.has("ratePerSqYard"));
        }
        http.perform(get("/api/workspace").header("X-Marketing-Session",token)).andExpect(status().isUnauthorized());
        http.perform(get("/api/workspace").header("Authorization","Bearer "+token)).andExpect(status().isUnauthorized());
        http.perform(post("/api/marketing/invitations").header("X-Marketing-Session",token)
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("projectId",project.toString(),"agentName","Disallowed","mobile",mobile))))
            .andExpect(status().isUnauthorized());
        var repeated=service.invite(actor,node(Map.of("projectId",otherProject.toString(),"agentName","Another label","mobile",mobile)));
        assertFalse((Boolean)repeated.get("created")); assertFalse(repeated.containsKey("temporaryPin"));
        assertThrows(ApiProblem.class,()->service.inventory(permanentSession,(String)repeated.get("invitationToken")));
        assertThrows(ApiProblem.class,()->service.blueprint(permanentSession,(String)repeated.get("invitationToken")));
        http.perform(get("/api/marketing/access/blueprint").param("invite",(String)repeated.get("invitationToken"))
            .header("X-Marketing-Session",token)).andExpect(status().isUnauthorized());
        // Authorization is re-evaluated against live invitation, employee, project, firm and sector membership.
        for(String table:List.of("marketing_invitations","marketing_agents")) {
            String key=table.equals("marketing_invitations")?"token_hash":"mobile";
            String value=table.equals("marketing_invitations")?MarketingService.digest(invite):mobile;
            jdbc.update("UPDATE sos."+table+" SET enabled=false WHERE "+key+"=?",value);
            assertThrows(ApiProblem.class,()->service.blueprint(permanentSession,invite));
            jdbc.update("UPDATE sos."+table+" SET enabled=true WHERE "+key+"=?",value);
        }
        jdbc.update("UPDATE sos.projects SET status='ARCHIVED' WHERE id=?",project);
        assertThrows(ApiProblem.class,()->service.blueprint(permanentSession,invite));
        jdbc.update("UPDATE sos.projects SET status='ACTIVE' WHERE id=?",project);
        jdbc.update("UPDATE sos.firms SET status='SUSPENDED' WHERE id=?",firm);
        assertThrows(ApiProblem.class,()->service.blueprint(permanentSession,invite));
        jdbc.update("UPDATE sos.firms SET status='ACTIVE' WHERE id=?",firm);
        jdbc.update("UPDATE sos.firm_sector_assignments SET enabled=false WHERE firm_id=?",firm);
        assertThrows(ApiProblem.class,()->service.blueprint(permanentSession,invite));
        jdbc.update("UPDATE sos.firm_sector_assignments SET enabled=true WHERE firm_id=?",firm);
        assertEquals("CONFIRMED",service.blueprint(token,invite).get("status"));
        jdbc.update("UPDATE sos.erp_records SET data=jsonb_set(data,'{status}','\"available\"') WHERE id=?",available);
        assertThrows(ApiProblem.class,()->service.invite(new SessionAccount(accountant,"PARTNER","P",mobile,false,firm,"MKT-UNIT"),
            node(Map.of("projectId",project.toString(),"agentName","X","mobile",mobile))));
        Map<String,Object> request=new LinkedHashMap<>(Map.of("invite",invite,"plotId",available.toString(),
            "requestId",UUID.randomUUID().toString(),"buyerName","Isolated buyer","buyerPhone","+919777770002",
            "proposedRatePerSqYard",12000,"proposedAdvanceAmount",10000,"tokenDeadlineHours",48,"notes","Test request"));
        var bad=new LinkedHashMap<>(request); bad.put("plotId",foreignPlot.toString());
        assertThrows(ApiProblem.class,()->service.submit(permanentSession,node(bad)));
        bad.put("plotId",available.toString()); bad.put("proposedAdvanceAmount",2000000);
        assertThrows(ApiProblem.class,()->service.submit(permanentSession,node(bad)));
        Integer postingCount=jdbc.queryForObject("SELECT count(*) FROM sos.erp_postings",Integer.class);
        var submitted=service.submit(token,node(request));
        assertEquals(submitted,service.submit(token,node(request)));
        assertEquals(1,service.proposals(actor,project).size());
        var retry=new LinkedHashMap<>(request); retry.put("buyerName","Changed request");
        assertThrows(ApiProblem.class,()->service.submit(permanentSession,node(retry)));
        retry.put("requestId",UUID.randomUUID().toString());
        assertThrows(ApiProblem.class,()->service.submit(permanentSession,node(retry)));
        assertEquals("accepted_blocked",submitted.get("status"));
        assertThrows(ApiProblem.class,()->service.review(actor,(UUID)submitted.get("id"),node(Map.of("accept",true))));
        assertEquals("blocked",jdbc.queryForObject("SELECT data->>'status' FROM sos.erp_records WHERE id=?",String.class,available));
        assertEquals(postingCount,jdbc.queryForObject("SELECT count(*) FROM sos.erp_postings",Integer.class));
        assertThrows(ApiProblem.class,()->service.review(actor,(UUID)submitted.get("id"),node(Map.of("accept",true))));
        var rejected=new LinkedHashMap<>(request); rejected.put("requestId",UUID.randomUUID().toString());
        assertThrows(ApiProblem.class,()->service.submit(permanentSession,node(rejected)));
        service.logout(token);
        assertThrows(ApiProblem.class,()->service.session(permanentSession,invite));
    }
}

package com.syndicateos.marketing;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.syndicateos.auth.SessionAccount;
import com.syndicateos.core.*;
import com.syndicateos.erp.ErpAccess;
import java.math.BigDecimal;
import java.security.*;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Separate marketing principals: no firm credential changes, ERP sessions or financial authority. */
@Service
public class MarketingService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final PasswordEncoder encoder;
    private final TransactionTemplate tx;
    private final ErpAccess access;
    private final SecureRandom random=new SecureRandom();
    public MarketingService(JdbcTemplate jdbc,ObjectMapper json,PasswordEncoder encoder,TransactionTemplate tx,ErpAccess access) {
        this.jdbc=jdbc; this.json=json; this.encoder=encoder; this.tx=tx; this.access=access;
    }
    private ObjectNode object(Object value) {
        try { return (ObjectNode)json.readTree(value.toString()); }
        catch(Exception e) { throw new ApiProblem(503,"MARKETING_CONFIGURATION_INVALID","Marketing data is not configured correctly."); }
    }
    private ObjectNode policy() {
        var rows=jdbc.queryForList("SELECT data FROM sos.marketing_policy WHERE singleton");
        if(rows.size()!=1) throw new ApiProblem(503,"MARKETING_NOT_CONFIGURED","Marketing access is not configured.");
        return object(rows.getFirst().get("data"));
    }
    private int positive(JsonNode policy,String key) {
        if(!policy.path(key).canConvertToInt() || policy.path(key).asInt()<=0)
            throw new ApiProblem(503,"MARKETING_CONFIGURATION_INVALID","Marketing access policy is incomplete.");
        return policy.path(key).asInt();
    }
    private Map<String,Object> publicPolicy() {
        var p=policy();
        return Map.of("pinLength",positive(p,"pinLength"),"deadlineHours",positive(p,"deadlineHours"),
            "statusLabels",p.path("statusLabels"));
    }
    private String nonce() {
        byte[] b=new byte[32]; random.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }
    static String digest(String value) {
        if(value==null || !value.matches("[A-Za-z0-9_-]{43}"))
            throw new ApiProblem(401,"MARKETING_AUTH_REQUIRED","This invitation or marketing session is invalid.");
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
        catch(NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    private void staff(SessionAccount actor,UUID project,boolean write) {
        if(actor==null || !"ACCOUNTANT".equals(actor.role())) throw ApiProblem.denied();
        access.project(actor,project,write?"erp.submit":"erp.read",write);
    }
    public Map<String,Object> invite(SessionAccount actor,JsonNode body) {
        UUID project=UUID.fromString(Values.text(body,"projectId",36));
        String name=Values.text(body,"agentName",100),mobile=Values.mobile(Values.text(body,"mobile",30));
        return tx.execute(s -> {
            staff(actor,project,true);
            var p=policy(); String temporary=Values.text(p,"temporaryPin",12);
            if(!temporary.matches("\\d{4,12}")) throw new ApiProblem(503,"MARKETING_CONFIGURATION_INVALID","Temporary PIN policy is invalid.");
            UUID candidate=UUID.randomUUID();
            int created=jdbc.update("""
                INSERT INTO sos.marketing_agents(id,mobile,name,pin_hash) VALUES(?,?,?,?)
                ON CONFLICT(mobile) DO NOTHING
                """,candidate,mobile,name,encoder.encode(temporary));
            var agent=jdbc.queryForMap("SELECT * FROM sos.marketing_agents WHERE mobile=? FOR UPDATE",mobile);
            if(!Boolean.TRUE.equals(agent.get("enabled"))) throw ApiProblem.denied();
            String raw=nonce(); UUID id=UUID.randomUUID();
            jdbc.update("""
                INSERT INTO sos.marketing_invitations(id,agent_id,project_id,token_hash,created_by,expires_at)
                VALUES(?,?,?,?,?,now()+(? * interval '1 hour'))
                """,id,agent.get("id"),project,digest(raw),actor.identityId(),positive(p,"invitationHours"));
            var out=new LinkedHashMap<String,Object>();
            out.put("invitationToken",raw); out.put("created",created==1);
            out.put("requiresPinChange",agent.get("must_change_pin"));
            if(Boolean.TRUE.equals(agent.get("must_change_pin")) && encoder.matches(temporary,(String)agent.get("pin_hash")))
                out.put("temporaryPin",temporary);
            jdbc.update("INSERT INTO sos.erp_audit(id,project_id,actor_id,event) VALUES(?,?,?,'MARKETING_INVITATION_CREATED')",
                UUID.randomUUID(),project,actor.identityId());
            return out;
        });
    }
    private Map<String,Object> invitation(String raw,boolean lock) {
        var rows=jdbc.queryForList("""
            SELECT i.id AS invitation_id,i.agent_id,i.project_id,a.name AS agent_name,a.mobile,
              a.pin_hash,a.must_change_pin,a.credential_version,a.failed_attempts,
              a.locked_until>now() AS locked,p.name AS project_name,p.details AS project_details,
              f.name AS firm_name,p.firm_id
            FROM sos.marketing_invitations i JOIN sos.marketing_agents a ON a.id=i.agent_id
            JOIN sos.projects p ON p.id=i.project_id JOIN sos.firms f ON f.id=p.firm_id
            JOIN sos.firm_sector_assignments fs ON fs.firm_id=p.firm_id AND fs.sector_id=p.sector_id
            JOIN sos.sectors sec ON sec.id=p.sector_id
            WHERE i.token_hash=? AND i.enabled AND a.enabled
              AND (i.expires_at>now() OR i.activated_at IS NOT NULL)
              AND p.status='ACTIVE' AND p.setup_state='READY' AND f.status='ACTIVE' AND fs.enabled AND sec.enabled
            """+(lock?" FOR UPDATE OF a,i":""),digest(raw));
        if(rows.size()!=1) throw new ApiProblem(401,"MARKETING_INVITATION_INVALID","This invitation is expired, disabled or unavailable. Ask the accountant for a new invitation.");
        return rows.getFirst();
    }
    public Map<String,Object> info(String raw) {
        var row=invitation(raw,false);
        return Map.of("projectName",row.get("project_name"),"firmName",row.get("firm_name"),
            "agentName",row.get("agent_name"),"policy",publicPolicy());
    }
    private Map<String,Object> state(Map<String,Object> row) {
        return new LinkedHashMap<>(Map.of("mustChangePin",row.get("must_change_pin"),
            "agentName",row.get("agent_name"),"mobile",row.get("mobile"),
            "projectName",row.get("project_name"),"firmName",row.get("firm_name"),"policy",publicPolicy()));
    }
    private Map<String,Object> issue(Map<String,Object> row) {
        String token=nonce();
        jdbc.update("""
            INSERT INTO sos.marketing_sessions(token_hash,invitation_id,agent_id,credential_version,expires_at)
            VALUES(?,?,?,?,now()+(? * interval '1 hour'))
            """,digest(token),row.get("invitation_id"),row.get("agent_id"),row.get("credential_version"),positive(policy(),"sessionHours"));
        var out=state(row); out.put("token",token); return out;
    }
    public Map<String,Object> login(JsonNode body) {
        String invite=Values.text(body,"invite",100),mobile=Values.mobile(Values.text(body,"mobile",30)),pin=Values.text(body,"pin",12);
        // Commit failed-attempt accounting before returning an authentication error.
        var result=tx.execute(s -> {
            var row=invitation(invite,true);
            if(Boolean.TRUE.equals(row.get("locked"))) return null;
            if(!mobile.equals(row.get("mobile")) || !encoder.matches(pin,(String)row.get("pin_hash"))) {
                var p=policy();
                jdbc.update("""
                    UPDATE sos.marketing_agents SET failed_attempts=failed_attempts+1,
                      locked_until=CASE WHEN failed_attempts+1>=? THEN now()+(? * interval '1 second') ELSE locked_until END
                    WHERE id=?
                    """,positive(p,"maxLoginAttempts"),positive(p,"lockSeconds"),row.get("agent_id"));
                return null;
            }
            jdbc.update("UPDATE sos.marketing_agents SET failed_attempts=0,locked_until=NULL WHERE id=?",row.get("agent_id"));
            if(!Boolean.TRUE.equals(row.get("must_change_pin")))
                jdbc.update("UPDATE sos.marketing_invitations SET activated_at=COALESCE(activated_at,now()) WHERE id=?",row.get("invitation_id"));
            return issue(row);
        });
        if(result==null) throw new ApiProblem(401,"MARKETING_LOGIN_FAILED","Check your mobile and PIN, or wait before retrying if access is temporarily locked.");
        return result;
    }
    private Map<String,Object> authenticated(String token,String invite,boolean temporary) {
        var row=invitation(invite,false);
        Integer count=jdbc.queryForObject("""
            SELECT count(*) FROM sos.marketing_sessions WHERE token_hash=? AND invitation_id=? AND agent_id=?
              AND credential_version=? AND expires_at>now()
            """,Integer.class,digest(token),row.get("invitation_id"),row.get("agent_id"),row.get("credential_version"));
        if(count==null || count!=1) throw new ApiProblem(401,"MARKETING_AUTH_REQUIRED","Sign in to this project's marketing portal.");
        if(!temporary && Boolean.TRUE.equals(row.get("must_change_pin")))
            throw new ApiProblem(403,"MARKETING_PIN_CHANGE_REQUIRED","Change your temporary PIN before accessing inventory.");
        return row;
    }
    public Map<String,Object> session(String token,String invite) { return state(authenticated(token,invite,true)); }
    public Map<String,Object> changePin(String token,JsonNode body) {
        String invite=Values.text(body,"invite",100),pin=Values.text(body,"newPin",12);
        return tx.execute(s -> {
            // Lock the agent before checking session version to prevent concurrent resets.
            invitation(invite,true);
            var row=authenticated(token,invite,true);
            if(!Boolean.TRUE.equals(row.get("must_change_pin"))) throw ApiProblem.denied();
            int length=positive(policy(),"pinLength");
            if(length<6 || length>12 || !pin.matches("\\d{"+length+"}") || encoder.matches(pin,(String)row.get("pin_hash")))
                throw ApiProblem.invalid("Choose a new "+length+"-digit PIN different from the temporary PIN.");
            jdbc.update("UPDATE sos.marketing_agents SET pin_hash=?,must_change_pin=false,credential_version=credential_version+1 WHERE id=?",
                encoder.encode(pin),row.get("agent_id"));
            jdbc.update("DELETE FROM sos.marketing_sessions WHERE agent_id=?",row.get("agent_id"));
            jdbc.update("UPDATE sos.marketing_invitations SET activated_at=COALESCE(activated_at,now()) WHERE id=?",row.get("invitation_id"));
            return issue(invitation(invite,false));
        });
    }
    public Map<String,Object> inventory(String token,String invite) {
        var row=authenticated(token,invite,false);
        List<Map<String,Object>> plots=new ArrayList<>();
        for(var record:jdbc.queryForList("""
            SELECT e.id,e.data,EXISTS(SELECT 1 FROM sos.marketing_proposals r WHERE r.plot_id=e.id AND r.status='pending') AS pending
            FROM sos.erp_records e WHERE e.project_id=? AND e.kind='plots' AND e.status<>'deleted' ORDER BY e.created_at,e.id
            """,row.get("project_id"))) {
            var d=object(record.get("data"));
            // Explicit allow-list: never leak buyers, advances, sold/booked prices, accounts or notes.
            var view=new LinkedHashMap<String,Object>(); view.put("id",record.get("id"));
            for(String key:List.of("plotNumber","areaSqYards","facing","dimensions","roadWidthFt","status"))
                if(d.hasNonNull(key)) view.put(key,d.get(key));
            if("available".equals(d.path("status").asText()) && d.hasNonNull("ratePerSqYard")) view.put("ratePerSqYard",d.get("ratePerSqYard"));
            view.put("requestPending",record.get("pending")); plots.add(view);
        }
        var details=object(row.get("project_details"));
        var project=new LinkedHashMap<String,Object>();
        project.put("id",row.get("project_id")); project.put("name",row.get("project_name"));
        project.put("code",details.path("projectCode").asText(details.path("code").asText()));
        if(details.hasNonNull("floorRatePerSqYard")) project.put("floorRatePerSqYard",details.get("floorRatePerSqYard"));
        return Map.of("project",project,"firm",Map.of("name",row.get("firm_name")),
            "agent",Map.of("name",row.get("agent_name"),"mobile",row.get("mobile")),"plots",plots,"policy",publicPolicy());
    }
    public Map<String,Object> blueprint(String token,String invite) {
        // Resolve the project exclusively from the validated invitation, never from caller input.
        var who=authenticated(token,invite,false);
        var out=new LinkedHashMap<String,Object>();
        out.put("status","EMPTY"); out.put("confirmed",null); out.put("plots",List.of());
        var rows=jdbc.queryForList("SELECT confirmed FROM sos.project_blueprints WHERE project_id=?",who.get("project_id"));
        if(rows.isEmpty()||rows.getFirst().get("confirmed")==null) return out;
        var statuses=new LinkedHashMap<String,String>();
        var plots=new ArrayList<Map<String,Object>>();
        for(var row:jdbc.queryForList("""
            SELECT data->>'plotNumber' AS number,data->>'status' AS status
            FROM sos.erp_records WHERE project_id=? AND kind='plots' AND status='approved'
            ORDER BY created_at,id
            """,who.get("project_id"))) {
            String number=(String)row.get("number"),status=(String)row.get("status");
            if(number==null||status==null||!Set.of("available","reserved","blocked","sold").contains(status)) continue;
            statuses.put(number.trim().toLowerCase(Locale.ROOT),status);
            plots.add(Map.of("plotNumber",number,"status",status));
        }
        out.put("status","CONFIRMED");
        out.put("confirmed",presentationGeometry(object(rows.getFirst().get("confirmed")),statuses.keySet()));
        out.put("plots",plots);
        return out;
    }
    /** Rebuild every nested object: saved JSON may contain arbitrary private extension fields. */
    private ObjectNode presentationGeometry(JsonNode source,Set<String> inventory) {
        var g=json.createObjectNode();
        g.set("northDegrees",source.hasNonNull("northDegrees")?source.get("northDegrees"):json.nullNode());
        if(source.path("aspectRatio").isNumber()) g.set("aspectRatio",source.get("aspectRatio"));
        if(source.hasNonNull("scale")) {
            var scale=json.createObjectNode();
            for(String k:List.of("widthFeet","heightFeet","provenance")) scale.set(k,source.path("scale").path(k));
            g.set("scale",scale);
        }
        if(source.hasNonNull("boundary")) {
            var boundary=json.createObjectNode(); boundary.set("points",presentationPoints(source.path("boundary").path("points")));
            g.set("boundary",boundary);
        }
        var plots=g.putArray("plots");
        for(var p:source.path("plots")) {
            String number=p.path("number").asText();
            var view=plots.addObject();
            view.put("number",number); view.put("facing",p.path("facing").asText("UNKNOWN"));
            view.put("referenceOnly",p.path("referenceOnly").asBoolean()||!inventory.contains(number.trim().toLowerCase(Locale.ROOT)));
            view.set("points",presentationPoints(p.path("points")));
        }
        var roads=g.putArray("roads");
        for(var r:source.path("roads")) {
            var view=roads.addObject(); view.put("name",r.path("name").asText(""));
            view.set("widthFeet",r.hasNonNull("widthFeet")?r.get("widthFeet"):json.nullNode());
            view.set("points",presentationPoints(r.path("points")));
        }
        var parks=g.putArray("parks");
        for(var p:source.path("parks")) {
            var view=parks.addObject(); view.put("name",p.path("name").asText("Open space"));
            view.set("points",presentationPoints(p.path("points")));
        }
        return g;
    }
    private JsonNode presentationPoints(JsonNode source) {
        var points=json.createArrayNode();
        for(var p:source) { var v=points.addObject(); v.set("x",p.path("x")); v.set("y",p.path("y")); }
        return points;
    }
    private BigDecimal amount(JsonNode body,String key,boolean zeroAllowed) {
        var value=body.get(key);
        if(value==null || !value.isNumber()) throw ApiProblem.invalid(key+" must be a number.");
        BigDecimal n=value.decimalValue();
        if(n.signum()<0 || !zeroAllowed && n.signum()==0 || n.precision()>20 || n.scale()>6)
            throw ApiProblem.invalid("Enter a valid "+key+".");
        return n;
    }
    public Map<String,Object> submit(String token,JsonNode body) {
        String invite=Values.text(body,"invite",100);
        UUID plot=UUID.fromString(Values.text(body,"plotId",36)),request=UUID.fromString(Values.text(body,"requestId",36));
        String buyer=Values.text(body,"buyerName",100),phone=Values.mobile(Values.text(body,"buyerPhone",30));
        BigDecimal rate=amount(body,"proposedRatePerSqYard",false),advance=amount(body,"proposedAdvanceAmount",true);
        var p=policy();
        if(!body.path("tokenDeadlineHours").canConvertToInt()) throw ApiProblem.invalid("Enter a valid token deadline.");
        int hours=body.path("tokenDeadlineHours").asInt();
        if(hours<1 || hours>positive(p,"maxDeadlineHours")) throw ApiProblem.invalid("Token deadline exceeds the configured limit.");
        String notes=body.path("notes").asText("").trim();
        if(notes.length()>2000) throw ApiProblem.invalid("Keep proposal notes within 2000 characters.");
        return tx.execute(s -> {
            var who=authenticated(token,invite,false);
            var records=jdbc.queryForList("SELECT data FROM sos.erp_records WHERE id=? AND project_id=? AND kind='plots' AND status<>'deleted' FOR UPDATE",
                plot,who.get("project_id"));
            if(records.isEmpty()) throw ApiProblem.denied();
            // Request IDs are idempotent only within the authenticated project and agent.
            var old=jdbc.queryForList("SELECT id,status,data,plot_id FROM sos.marketing_proposals WHERE agent_id=? AND project_id=? AND request_id=?",
                who.get("agent_id"),who.get("project_id"),request);
            if(!old.isEmpty()) {
                var existing=old.getFirst(); var original=object(existing.get("data"));
                if(!plot.equals(existing.get("plot_id")) || !buyer.equals(original.path("buyerName").asText())
                    || !phone.equals(original.path("buyerPhone").asText()) || rate.compareTo(original.path("proposedRatePerSqYard").decimalValue())!=0
                    || advance.compareTo(original.path("proposedAdvanceAmount").decimalValue())!=0
                    || hours!=original.path("tokenDeadlineHours").asInt() || !notes.equals(original.path("notes").asText()))
                    throw ApiProblem.conflict();
                return Map.of("id",existing.get("id"),"status",existing.get("status"));
            }
            var d=object(records.getFirst().get("data"));
            if(!"available".equals(d.path("status").asText())) throw new ApiProblem(409,"PLOT_UNAVAILABLE","This plot is no longer available.");
            if(jdbc.queryForObject("SELECT count(*) FROM sos.marketing_proposals WHERE plot_id=? AND status='pending'",Integer.class,plot)>0)
                throw new ApiProblem(409,"PROPOSAL_PENDING","This plot has a historical request. Record or withdraw that request before placing another hold.");
            if(!d.path("areaSqYards").isNumber() || d.path("areaSqYards").decimalValue().signum()<=0)
                throw ApiProblem.invalid("The plot area must be corrected before requesting a booking.");
            if(advance.compareTo(rate.multiply(d.path("areaSqYards").decimalValue()))>0)
                throw ApiProblem.invalid("The proposed advance cannot exceed the proposed plot value.");
            var details=object(jdbc.queryForMap("SELECT details FROM sos.projects WHERE id=?",who.get("project_id")).get("details"));
            if(rate.compareTo(details.path("floorRatePerSqYard").decimalValue())<0)
                throw ApiProblem.invalid("This rate is below the project's protected floor rate.");
            UUID id=UUID.randomUUID();
            var data=json.createObjectNode();
            data.put("id",id.toString()).put("agentName",who.get("agent_name").toString()).put("agentPhone",who.get("mobile").toString())
                .put("buyerName",buyer).put("buyerPhone",phone).put("proposedRatePerSqYard",rate).put("proposedAdvanceAmount",advance)
                .put("tokenDeadlineHours",hours).put("submittedAt",Instant.now().toString()).put("status","accepted_blocked").put("notes",notes);
            jdbc.update("INSERT INTO sos.marketing_proposals(id,project_id,agent_id,plot_id,request_id,data,status) VALUES(?,?,?,?,?,?::jsonb,'accepted_blocked')",
                id,who.get("project_id"),who.get("agent_id"),plot,request,data.toString());
            d.set("marketingRequest",data);
            d.put("status","blocked").put("blockedByAgent",who.get("agent_name").toString());
            jdbc.update("UPDATE sos.erp_records SET data=?::jsonb,revision=revision+1 WHERE id=?",d.toString(),plot);
            jdbc.update("INSERT INTO sos.project_notifications(id,project_id,record_id,marketing_agent_id,title,message) VALUES(?,?,?,?,?,?)",
                UUID.randomUUID(),who.get("project_id"),plot,who.get("agent_id"),"Booking hold recorded",
                "A marketing hold was recorded. No promised advance is included in the project balance.");
            return Map.of("id",id,"status","accepted_blocked");
        });
    }
    public List<Map<String,Object>> proposals(SessionAccount actor,UUID project) {
        return tx.execute(s -> {
            staff(actor,project,false);
            var rows=jdbc.queryForList("""
                SELECT r.id,r.status,r.data,a.name AS agent_name,a.mobile,e.data->>'plotNumber' AS plot_number
                FROM sos.marketing_proposals r JOIN sos.marketing_agents a ON a.id=r.agent_id
                JOIN sos.erp_records e ON e.id=r.plot_id WHERE r.project_id=? ORDER BY r.created_at DESC
                """,project);
            return rows.stream().map(r -> Map.<String,Object>of("id",r.get("id"),"status",r.get("status"),"data",object(r.get("data")),
                "agentName",r.get("agent_name"),"mobile",r.get("mobile"),"plotNumber",Objects.toString(r.get("plot_number"),""))).toList();
        });
    }
    public Map<String,Object> review(SessionAccount actor,UUID id,JsonNode body) {
        throw ApiProblem.invalid("Approvals have been removed. Valid marketing requests place a hold immediately; record actual receipts separately.");
    }
    public void logout(String token) {
        jdbc.update("DELETE FROM sos.marketing_sessions WHERE token_hash=?",digest(token));
    }
}

package com.syndicateos.workspace;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.syndicateos.auth.SessionAccount;
import com.syndicateos.configuration.ConfigurationService;
import com.syndicateos.core.*;
import com.syndicateos.erp.ErpService;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Resumable project setup; all children become operational in one transaction. */
@Service
public class ProjectSetupService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final WorkspaceReader access;
    private final ConfigurationService config;
    private final ErpService erp;
    private final PasswordEncoder encoder;
    private final TransactionTemplate tx;
    private final com.syndicateos.erp.ProjectCashAccountService cash;
    public ProjectSetupService(JdbcTemplate jdbc,ObjectMapper json,WorkspaceReader access,
        ConfigurationService config,ErpService erp,PasswordEncoder encoder,TransactionTemplate tx,com.syndicateos.erp.ProjectCashAccountService cash) {
        this.jdbc=jdbc;this.json=json;this.access=access;this.config=config;this.erp=erp;this.encoder=encoder;this.tx=tx;this.cash=cash;
    }
    public Map<String,Object> execute(SessionAccount actor,String action,JsonNode input) {
        actor.business();
        if(!"ACCOUNTANT".equals(actor.role())) throw ApiProblem.denied();
        return tx.execute(status -> {
            UUID request=Values.id(input,"requestId");
            jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,
                "SOS:setup:"+actor.identityId()+":"+request);
            var duplicate=jdbc.queryForList("SELECT action,input,result FROM sos.project_setup_requests WHERE firm_id=? AND actor_id=? AND request_id=?",
                actor.firmId(),actor.identityId(),request);
            if(!duplicate.isEmpty()) {
                var old=duplicate.getFirst();
                if(!action.equals(old.get("action"))||!config.parse(old.get("input")).equals(input)) throw ApiProblem.conflict();
                return json.convertValue(config.parse(old.get("result")),new com.fasterxml.jackson.core.type.TypeReference<Map<String,Object>>() {});
            }
            Map<String,Object> result;
            if("project.setup-save".equals(action)) result=save(actor,input);
            else if("project.setup-create".equals(action)) {
                if (input.hasNonNull("projectId")) throw ApiProblem.invalid("Use setup-save for an existing project.");
                Map<String,Object> saved=save(actor,input);
                @SuppressWarnings("unchecked") Map<String,Object> draft=(Map<String,Object>)saved.get("entity");
                ObjectNode finishInput=json.createObjectNode();
                finishInput.put("projectId",draft.get("id").toString());
                finishInput.put("revision",((Number)draft.get("revision")).intValue());
                finishInput.put("requestId",request.toString());
                result=finish(actor,finishInput);
            }
            else if("project.setup-finalize".equals(action)) result=finish(actor,input);
            else throw ApiProblem.invalid("Unsupported project setup operation.");
            @SuppressWarnings("unchecked") Map<String,Object> entity=(Map<String,Object>)result.get("entity");
            // Temporary PINs are delivered once, never stored as plaintext in retry history.
            Map<String,Object> persisted=new LinkedHashMap<>(entity); persisted.remove("access");
            jdbc.update("INSERT INTO sos.project_setup_requests(firm_id,actor_id,request_id,action,input,project_id,result) VALUES (?,?,?,?,?::jsonb,?,?::jsonb)",
                actor.firmId(),actor.identityId(),request,action,input.toString(),entity.get("id"),
                json.valueToTree(Map.of("status","ok","entity",persisted)).toString());
            return result;
        });
    }
    private Map<String,Object> project(SessionAccount actor,UUID id) {
        var rows=jdbc.queryForList("SELECT * FROM sos.projects WHERE id=? AND firm_id=? FOR UPDATE",id,actor.firmId());
        if(rows.isEmpty()) throw ApiProblem.denied();
        var row=rows.getFirst();
        access.accountantAccess(actor,actor.firmId(),(UUID)row.get("sector_id"),"projects.write");
        return row;
    }
    private JsonNode definition(UUID release) {
        var rows=jdbc.queryForList("SELECT definition FROM sos.project_setup_effective_definitions WHERE release_id=?",release);
        if(rows.isEmpty()) throw new ApiProblem(409,"SETUP_NOT_CONFIGURED","The owner must assign a published Project workspace release.");
        return config.parse(rows.getFirst().get("definition"));
    }
    private JsonNode snapshot(UUID project) {
        var rows=jdbc.queryForList("SELECT data FROM sos.project_setup_sections WHERE project_id=?",project);
        return rows.isEmpty()?json.createObjectNode():config.parse(rows.getFirst().get("data"));
    }
    private Map<String,Object> save(SessionAccount actor,JsonNode input) {
        UUID sector=Values.id(input,"sectorId");
        UUID release=access.accountantAccess(actor,actor.firmId(),sector,"projects.write");
        UUID id=input.hasNonNull("projectId")?Values.id(input,"projectId"):UUID.randomUUID();
        Map<String,Object> existing=input.hasNonNull("projectId")?project(actor,id):null;
        if(existing!=null) {
            if(!sector.equals(existing.get("sector_id")))
                throw new ApiProblem(409,"CONFIGURATION_CHANGED","The project sector changed. Reload and review before saving.");
            // Operational projects retain their own setup contract. A new firm
            // release must not silently migrate an existing project on edit.
            if("READY".equals(existing.get("setup_state")) && existing.get("setup_release_id")!=null) {
                UUID pinned=(UUID)existing.get("setup_release_id");
                if(input.hasNonNull("setupReleaseId") && !pinned.equals(Values.id(input,"setupReleaseId")))
                    throw new ApiProblem(409,"CONFIGURATION_CHANGED","The project setup release changed. Reload and review before saving.");
                release=pinned;
            }
        }
        JsonNode def=definition(release);
        JsonNode accountEdits=input.path("accountEdits");
        if(!accountEdits.isMissingNode() && (!accountEdits.isArray() || accountEdits.size()>100))
            throw ApiProblem.invalid("Supply at most 100 project account edits.");
        if((!accountEdits.isMissingNode() && !accountEdits.isEmpty()) || input.has("plotMatrix")) {
            if(existing==null || !"READY".equals(existing.get("setup_state")))
                throw ApiProblem.invalid("Edit live accounts and inventory only on an operational project.");
        }
        Set<UUID> accountIds=new HashSet<>();
        for(JsonNode edit:accountEdits) {
            if(!edit.isObject() || !edit.path("data").isObject()) throw ApiProblem.invalid("Supply valid project account data.");
            if(edit.hasNonNull("recordId")) {
                UUID account=Values.id(edit,"recordId");
                if(!accountIds.add(account)) throw ApiProblem.invalid("Repeated project account.");
                Values.revision(edit);
                var found=jdbc.queryForList("SELECT kind,status FROM sos.erp_records WHERE project_id=? AND id=?",id,account);
                if(found.isEmpty() || !"accounts".equals(found.getFirst().get("kind")) ||
                    !"approved".equals(found.getFirst().get("status"))) throw ApiProblem.denied();
            }
        }
        JsonNode plotEdits=input.path("plotEdits");
        if(!plotEdits.isMissingNode() && (!plotEdits.isArray() || plotEdits.size()>2000))
            throw ApiProblem.invalid("Supply at most 2000 saved plot edits.");
        if(!plotEdits.isMissingNode() && !plotEdits.isEmpty()) {
            if(existing==null || !"READY".equals(existing.get("setup_state")))
                throw ApiProblem.invalid("Edit saved plots only on an operational project.");
            Set<UUID> editedIds=new HashSet<>();
            for(JsonNode edit:plotEdits) {
                if(!edit.isObject() || !edit.path("data").isObject() || !editedIds.add(Values.id(edit,"recordId")))
                    throw ApiProblem.invalid("Supply distinct saved plot records with their data.");
                Values.revision(edit);
                var records=jdbc.queryForList("SELECT kind,status FROM sos.erp_records WHERE id=? AND project_id=?",
                    Values.id(edit,"recordId"),id);
                if(records.isEmpty() || !"plots".equals(records.getFirst().get("kind")) ||
                    !"approved".equals(records.getFirst().get("status"))) throw ApiProblem.denied();
            }
        }
        JsonNode setup=input.path("setup").deepCopy();
        if(!setup.isObject()||setup.toString().length()>120000) throw ApiProblem.invalid("Supply a bounded setup object.");
        for(String key:List.of("values","settings")) if(!setup.path(key).isObject()) throw ApiProblem.invalid("Setup "+key+" must be an object.");
        for(String key:List.of("groups","partners","accounts","documents"))
            if(!setup.path(key).isArray()) throw ApiProblem.invalid("Setup "+key+" must be an array.");
        setup.fieldNames().forEachRemaining(key -> {if(!Set.of("values","settings","groups","partners","accounts","documents").contains(key)) throw ApiProblem.invalid("Unknown setup section.");});
        ObjectNode values=fields(allFields(def),setup.path("values"),false);
        String name=Values.text(values,"name",160);
        ObjectNode settings=fields(def.path("settingsFields"),setup.path("settings"),false);
        checkRows(setup.path("partners"),def.path("rules").path("maxPartners").asInt(),100);
        checkRows(setup.path("accounts"),def.path("rules").path("maxAccounts").asInt(),100);
        checkRows(setup.path("groups"),def.path("inventory").path("maxRows").asInt(0),2000);
        checkRows(setup.path("documents"),100,100);
        int revision=1; String state="DRAFT";
        ObjectNode details=values.deepCopy();details.remove(List.of("name","location"));
        if(details.hasNonNull("projectCode")) details.put("projectCode",details.path("projectCode").asText().trim().toUpperCase(Locale.ROOT));
        if(input.hasNonNull("projectId")) {
            var row=existing;
            if(!sector.equals(row.get("sector_id"))||!release.equals(row.get("setup_release_id")) && row.get("setup_release_id")!=null
                && !release.toString().equals(input.path("reviewedReleaseId").asText()))
                throw new ApiProblem(409,"CONFIGURATION_CHANGED","The project sector or setup release changed. Reload and review before saving.");
            if(!"ACTIVE".equals(row.get("status"))) throw ApiProblem.invalid("Archived or completed projects cannot be modified here.");
            revision=Values.revision(input);
            if(revision!=(Integer)row.get("revision")) throw ApiProblem.conflict();
            state=(String)row.get("setup_state");
            if("READY".equals(state)) {
                fields(allFields(def),values,true);
                JsonNode previous=snapshot(id);
                for(String key:List.of("groups","partners","accounts","documents"))
                    if(previous.has(key)&&!previous.path(key).equals(setup.path(key))||!previous.has(key)&&!setup.path(key).isEmpty())
                        throw ApiProblem.invalid("Update existing project partners, accounts, plans and documents through their tabs, not by recreating setup.");
                ObjectNode merged=(ObjectNode)config.parse(row.get("details"));
                // Replace configured fields, including optional fields cleared by
                // the accountant. Preserve unrelated historical metadata.
                for(JsonNode field:allFields(def)) merged.remove(field.path("key").asText());
                details.fields().forEachRemaining(e->merged.set(e.getKey(),e.getValue()));details=merged;
                List<JsonNode> profiles=jdbc.queryForList("SELECT data FROM sos.erp_records WHERE project_id=? AND kind='partner-profiles' AND status='approved'",id)
                    .stream().map(p->config.parse(p.get("data"))).toList();
                CapitalAllocation.validate(def,values,profiles,false,false);
            }
            if(!"READY".equals(state)) {
                normalizeRows(def,(ObjectNode)setup);
                CapitalAllocation.validate(def,values,setup.path("partners"),false);
            }
            jdbc.update("UPDATE sos.projects SET name=?,location=?,details=?::jsonb,revision=revision+1,setup_release_id=? WHERE id=?",
                name,values.has("location")?values.path("location").asText():null,details.toString(),release,id);
            revision++;
        } else {
            normalizeRows(def,(ObjectNode)setup);
            CapitalAllocation.validate(def,values,setup.path("partners"),false);
            jdbc.update("INSERT INTO sos.projects(id,firm_id,sector_id,name,location,details,created_by,setup_state,setup_release_id) VALUES (?,?,?,?,?,?::jsonb,?,'DRAFT',?)",
                id,actor.firmId(),sector,name,values.has("location")?values.path("location").asText():null,details.toString(),actor.identityId(),release);
        }
        ObjectNode stored=(ObjectNode)setup.deepCopy();stored.set("values",values);stored.set("settings",settings);
        jdbc.update("INSERT INTO sos.project_setup_sections(project_id,data) VALUES (?,?::jsonb) ON CONFLICT(project_id) DO UPDATE SET data=excluded.data,updated_at=now()",
            id,stored.toString());
        if("READY".equals(state)) {
            var old=jdbc.queryForList("SELECT data FROM sos.erp_project_settings WHERE project_id=?",id);
            ObjectNode saved=old.isEmpty()?json.createObjectNode():(ObjectNode)config.parse(old.getFirst().get("data"));
            for(JsonNode field:def.path("settingsFields")) saved.remove(field.path("key").asText());
            settings.fields().forEachRemaining(e->saved.set(e.getKey(),e.getValue()));
            if(saved.path("projectPlan").isObject()) ((ObjectNode)saved.path("projectPlan")).set("values",values);
            jdbc.update("INSERT INTO sos.erp_project_settings(project_id,data) VALUES (?,?::jsonb) ON CONFLICT(project_id) DO UPDATE SET data=excluded.data,revision=sos.erp_project_settings.revision+1",
                id,saved.toString());
        }
        // The enclosing transaction includes every plot change: a stale,
        // protected or invalid plot rolls back the project details as well.
        for(JsonNode edit:plotEdits) {
            UUID record=Values.id(edit,"recordId");
            ObjectNode mutation=json.createObjectNode().put("projectId",id.toString()).put("kind","plots")
                .put("recordId",record.toString()).put("revision",Values.revision(edit))
                .put("requestId",UUID.nameUUIDFromBytes((Values.id(input,"requestId")+":plot:"+record)
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString());
            mutation.set("data",edit.path("data"));
            erp.execute(actor,"erp.save",mutation);
        }
        if(input.has("plotMatrix") && !plotEdits.isEmpty())
            throw ApiProblem.invalid("Use either the facing matrix or individual plot edits in one save.");
        int matrixChanges=new ProjectMatrixEditor(jdbc,json,erp).apply(actor,id,Values.id(input,"requestId"),def,values,input.path("plotMatrix"));
        int accountIndex=0;
        for(JsonNode edit:accountEdits) {
            ObjectNode mutation=json.createObjectNode().put("projectId",id.toString()).put("kind","accounts")
                .put("requestId",UUID.nameUUIDFromBytes((Values.id(input,"requestId")+":account:"+accountIndex++)
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString());
            if(edit.hasNonNull("recordId")) mutation.put("recordId",Values.id(edit,"recordId").toString()).put("revision",Values.revision(edit));
            mutation.set("data",edit.path("data"));
            erp.execute(actor,"erp.save",mutation);
        }
        config.audit(actor,"PROJECT_SETUP_SAVED",actor.firmId(),release);
        return ok(Map.of("id",id,"revision",revision,"setupState",state,"updatedPlots",plotEdits.size()+matrixChanges,"updatedAccounts",accountEdits.size()));
    }
    private void normalizeRows(JsonNode definition,ObjectNode setup) {
        for(String group:List.of("partners","accounts","groups")) {
            JsonNode definitions="groups".equals(group)?definition.path("inventory").path("fields"):definition.path("partners".equals(group)?"partnerFields":"accountFields");
            ArrayNode normalized=json.createArrayNode();
            for(JsonNode row:setup.path(group)) normalized.add(fields(definitions,row,false));
            setup.set(group,normalized);
        }
    }
    private Map<String,Object> finish(SessionAccount actor,JsonNode input) {
        UUID id=Values.id(input,"projectId");
        var project=project(actor,id);
        if(!"DRAFT".equals(project.get("setup_state"))||(Integer)project.get("revision")!=Values.revision(input)) throw ApiProblem.conflict();
        UUID release=access.accountantAccess(actor,actor.firmId(),(UUID)project.get("sector_id"),"projects.write");
        if(!release.equals(project.get("setup_release_id"))) throw new ApiProblem(409,"CONFIGURATION_CHANGED","Review setup against the assigned release before finalizing.");
        JsonNode def=definition(release),setup=snapshot(id);
        ObjectNode values=fields(allFields(def),setup.path("values"),true);
        ObjectNode settings=fields(def.path("settingsFields"),setup.path("settings"),true);
        for(JsonNode p:setup.path("partners")) fields(def.path("partnerFields"),p,true);
        for(JsonNode a:setup.path("accounts")) fields(def.path("accountFields"),a,true);
        CapitalAllocation.validate(def,values,setup.path("partners"),true);
        if(!setup.path("partners").isEmpty()&&"fixed".equals(settings.path("equitySplitMode").asText())) {
            BigDecimal total=BigDecimal.ZERO;
            for(JsonNode p:setup.path("partners")) total=total.add(p.path("fixedEquityPercent").decimalValue());
            if(total.compareTo(def.path("rules").path("fixedEquityTotal").decimalValue())!=0)
                throw ApiProblem.invalid("Fixed partner allocations must equal the configured full equity total.");
        }
        var inventory=inventory(def,values,setup.path("groups"),settings.path("autoGenerateInventory").asBoolean());
        // Activation is uncommitted while all subordinate operations run. Any failure rolls it back.
        jdbc.update("UPDATE sos.projects SET setup_state='READY',revision=revision+1 WHERE id=?",id);
        List<Map<String,Object>> credentials=new ArrayList<>();
        Set<String> mobiles=new HashSet<>();
        UUID request=Values.id(input,"requestId");int pos=0;
        for(JsonNode partner:setup.path("partners")) {
            String mobile=Values.mobile(Values.text(partner,"mobile",24));
            if(!mobiles.add(mobile)) throw ApiProblem.invalid("A partner can occur only once per project.");
            var identity=provision(mobile,Values.text(partner,"name",120));
            UUID identityId=(UUID)identity.get("id");
            jdbc.update("INSERT INTO sos.firm_memberships(firm_id,identity_id,role_code) VALUES (?,?,'PARTNER') ON CONFLICT(firm_id,identity_id,role_code) DO UPDATE SET enabled=true",actor.firmId(),identityId);
            jdbc.update("INSERT INTO sos.project_memberships(project_id,firm_id,identity_id) VALUES (?,?,?)",id,actor.firmId(),identityId);
            ObjectNode profile=(ObjectNode)partner.deepCopy();profile.remove(List.of("name","mobile"));profile.put("partnerId",identityId.toString());
            bootstrap(actor,id,"partner-profiles",profile,request,pos++);
            @SuppressWarnings("unchecked") Map<String,Object> credential=(Map<String,Object>)identity.get("access");
            credentials.add(credential);
        }
        for(JsonNode a:setup.path("accounts")) bootstrap(actor,id,"accounts",a,request,pos++);
        for(JsonNode d:setup.path("documents")) bootstrap(actor,id,"documents",d,request,pos++);
        for(JsonNode row:inventory) bootstrap(actor,id,def.path("inventory").path("kind").asText(),row,request,pos++);
        ObjectNode erpSettings=settings.deepCopy();
        erpSettings.set("equitySplitMode",settings.path("equitySplitMode"));
        ObjectNode plan=erpSettings.putObject("projectPlan");plan.set("groups",setup.path("groups"));plan.set("values",values);
        jdbc.update("INSERT INTO sos.erp_project_settings(project_id,data) VALUES (?,?::jsonb) ON CONFLICT(project_id) DO UPDATE SET data=excluded.data,revision=sos.erp_project_settings.revision+1",
            id,erpSettings.toString());
        cash.ensure(actor,id);
        config.audit(actor,"PROJECT_SETUP_FINALIZED",actor.firmId(),release);
        return ok(Map.of("id",id,"revision",jdbc.queryForObject("SELECT revision FROM sos.projects WHERE id=?",Integer.class,id),"setupState","READY","access",credentials,
            "counts",Map.of("partners",setup.path("partners").size(),"accounts",setup.path("accounts").size()+1,"documents",setup.path("documents").size(),"inventory",inventory.size())));
    }
    private void bootstrap(SessionAccount actor,UUID project,String kind,JsonNode data,UUID request,int pos) {
        ObjectNode input=json.createObjectNode().put("projectId",project.toString()).put("kind",kind)
            .put("requestId",UUID.nameUUIDFromBytes((request+":"+pos).getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString());
        input.set("data",data);erp.execute(actor,"erp.save",input);
    }
    private ArrayNode inventory(JsonNode def,JsonNode values,JsonNode groups,boolean generate) {
        ArrayNode result=json.createArrayNode();JsonNode policy=def.path("inventory");
        if(policy.isNull()||policy.isMissingNode()) {
            if(!groups.isEmpty()) throw ApiProblem.invalid("No inventory builder is configured for this sector.");
            return result;
        }
        Set<String> numbers=new HashSet<>(); BigDecimal area=BigDecimal.ZERO;
        int sequential=1;
        if("sequential".equals(def.path("rules").path("inventoryNumbering").asText())) {
            for(JsonNode f:policy.path("fields")) if("startNumber".equals(f.path("key").asText())) sequential=f.path("default").asInt();
        }
        for(JsonNode group:groups) {
            ObjectNode g=fields(policy.path("fields"),group,true);
            int count=g.path(policy.path("mappings").path("count").asText()).asInt();
            if(count<1||count+result.size()>policy.path("maxRows").asInt()||count+result.size()>2000)
                throw ApiProblem.invalid("Inventory exceeds the configured safe creation limit.");
            for(int i=0;i<count;i++) {
                ObjectNode row=g.deepCopy();row.remove(List.of("count","numberPrefix","startNumber"));
                String number=g.path("numberPrefix").asText("")+("sequential".equals(def.path("rules").path("inventoryNumbering").asText())?sequential++:g.path("startNumber").asInt()+i);
                if(!numbers.add(number.toUpperCase(Locale.ROOT))) throw ApiProblem.invalid("Generated inventory numbers must be unique.");
                row.put(policy.path("mappings").path("number").asText(),number);
                row.put("status",def.path("rules").path("inventoryInitialStatus").path(policy.path("kind").asText()).asText());
                String rateKey=policy.path("mappings").path("rate").asText();
                if(row.path(rateKey).decimalValue().compareTo(values.path(policy.path("rateField").asText()).decimalValue())<0)
                    throw ApiProblem.invalid("An inventory selling rate is below the configured project floor.");
                area=area.add(row.path(policy.path("mappings").path("area").asText()).decimalValue());
                result.add(row);
            }
        }
        if(values.hasNonNull("extentValue")&&values.hasNonNull("extentUnit")) {
            JsonNode conversion=def.path("rules").path("unitConversions").path(values.path("extentUnit").asText());
            if(!conversion.isNumber()) throw ApiProblem.invalid("An extent-unit conversion is not configured.");
            BigDecimal gross=values.path("extentValue").decimalValue().multiply(conversion.decimalValue());
            BigDecimal deduction=values.path("roadDeductionPercent").decimalValue().add(values.path("openSpacePercent").decimalValue());
            BigDecimal full=def.path("rules").path("fixedEquityTotal").decimalValue();
            if(deduction.compareTo(full)>0) throw ApiProblem.invalid("Total deductions cannot exceed the parcel.");
            BigDecimal net=gross.multiply(full.subtract(deduction)).divide(full);
            if(area.compareTo(net)>0) throw ApiProblem.invalid("Inventory area exceeds the entered net parcel area. Correct the plan/deductions.");
        }
        return generate?result:json.createArrayNode();
    }
    private ArrayNode allFields(JsonNode def) {
        ArrayNode fields=json.createArrayNode();for(JsonNode section:def.path("sections")) fields.addAll((ArrayNode)section.path("fields"));return fields;
    }
    public static ObjectNode fields(JsonNode definitions,JsonNode source,boolean required) {
        if(!definitions.isArray()||!source.isObject()) throw ApiProblem.invalid("Invalid configured form.");
        ObjectNode data=((ObjectNode)source).deepCopy();Set<String> allowed=new HashSet<>();
        for(JsonNode field:definitions) {
            String key=field.path("key").asText();allowed.add(key);
            if(field.path("visibleWhen").isObject()) {
                boolean visible=false;
                for(JsonNode option:field.path("visibleWhen").path("values"))
                    if(option.asText().equals(data.path(field.path("visibleWhen").path("field").asText()).asText())) visible=true;
                if(!visible) {data.remove(key);continue;}
            }
            if(!data.has(key)&&field.has("default")) data.set(key,field.path("default"));
            JsonNode v=data.path(key);
            boolean missing=v.isMissingNode()||v.isNull()||v.isTextual()&&v.asText().isBlank();
            if(missing) {
                data.remove(key);
                if(required&&field.path("required").asBoolean()) throw ApiProblem.invalid("Required: "+field.path("label").asText());
                continue;
            }
            switch(field.path("kind").asText()) {
                case "number" -> {
                    if(!v.isNumber()||v.decimalValue().precision()>18||v.decimalValue().stripTrailingZeros().scale()>field.path("decimalPlaces").asInt(6)
                        ||field.path("integer").asBoolean()&&v.decimalValue().stripTrailingZeros().scale()>0)
                        throw ApiProblem.invalid("Enter a valid number: "+field.path("label").asText());
                    if(field.has("min")&&v.decimalValue().compareTo(field.path("min").decimalValue())<0
                        ||field.has("max")&&v.decimalValue().compareTo(field.path("max").decimalValue())>0)
                        throw ApiProblem.invalid("Outside configured limits: "+field.path("label").asText());
                }
                case "boolean" -> {if(!v.isBoolean()) throw ApiProblem.invalid("Choose a valid boolean.");}
                case "rows" -> {
                    if(!v.isArray()||v.size()>field.path("maxRows").asInt(1000))
                        throw ApiProblem.invalid("Invalid rows: "+field.path("label").asText());
                    ArrayNode rows=data.arrayNode();
                    for(JsonNode row:v) rows.add(fields(field.path("fields"),row,required));
                    data.set(key,rows);
                }
                case "date" -> {try{LocalDate.parse(v.asText());}catch(Exception e){throw ApiProblem.invalid("Enter an ISO date.");}}
                case "select" -> {
                    boolean found=false;for(JsonNode option:field.path("options")) if(option.asText().equals(v.asText())) found=true;
                    if(!found) throw ApiProblem.invalid("Choose a configured "+field.path("label").asText());
                }
                case "text","multiline" -> {
                    if(!v.isTextual()||v.asText().length()>field.path("maxLength").asInt(4000)) throw ApiProblem.invalid("Invalid text: "+field.path("label").asText());
                    String text=v.asText().trim();
                    if(field.path("uppercase").asBoolean()) text=text.toUpperCase(Locale.ROOT);
                    if(field.has("pattern")&&!text.matches(field.path("pattern").asText())) throw ApiProblem.invalid("Enter a valid "+field.path("label").asText()+".");
                    data.put(key,text);
                }
                default -> throw ApiProblem.invalid("Unsupported configured setup field.");
            }
        }
        data.fieldNames().forEachRemaining(k->{if(!allowed.contains(k))throw ApiProblem.invalid("Unconfigured setup field: "+k);});
        return data;
    }
    private void checkRows(JsonNode rows,int configured,int ceiling) {
        if(!rows.isArray()||rows.size()>configured||rows.size()>ceiling) throw ApiProblem.invalid("Too many setup rows for this configured section.");
        for(JsonNode row:rows) if(!row.isObject()) throw ApiProblem.invalid("Setup rows must be objects.");
    }
    private Map<String,Object> provision(String mobile,String name) {
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"SOS:identity:"+mobile);
        var rows=jdbc.queryForList("SELECT id,enabled FROM sos.identities WHERE mobile=? FOR UPDATE",mobile);
        if(!rows.isEmpty()) {
            UUID id=(UUID)rows.getFirst().get("id");
            if(!Boolean.TRUE.equals(rows.getFirst().get("enabled"))||jdbc.queryForObject("SELECT count(*) FROM sos.owner_memberships WHERE identity_id=?",Integer.class,id)>0)
                throw ApiProblem.invalid("This identity cannot be used for partner access.");
            return Map.of("id",id,"access",Map.of("mobile",mobile,"reused",true));
        }
        UUID id=UUID.randomUUID();String pin=Values.temporaryCredential();Instant expiry=Instant.now().plus(7,ChronoUnit.DAYS);
        jdbc.update("INSERT INTO sos.identities(id,mobile,display_name,credential_hash,temporary_credential_expires_at) VALUES (?,?,?,?,?)",
            id,mobile,name,encoder.encode(pin),Timestamp.from(expiry));
        return Map.of("id",id,"access",Map.of("mobile",mobile,"reused",false,"temporaryCredential",pin,"expiresAt",expiry.toString()));
    }
    private Map<String,Object> ok(Object entity){return Map.of("status","ok","entity",entity);}
}

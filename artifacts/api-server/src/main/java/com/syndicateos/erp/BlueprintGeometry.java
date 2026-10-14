package com.syndicateos.erp;

import com.fasterxml.jackson.databind.JsonNode;
import com.syndicateos.core.ApiProblem;
import java.util.*;

/** A visual coordinate draft, never a source of financial quantities or survey dimensions. */
public final class BlueprintGeometry {
    private BlueprintGeometry() {}
    public static void validate(JsonNode g,Set<String> inventory,boolean confirm) {
        if(!g.isObject()||g.toString().length()>1_000_000) throw ApiProblem.invalid("Supply a bounded layout geometry.");
        JsonNode plots=g.path("plots"),roads=g.path("roads");
        if(!plots.isArray()||!roads.isArray()||plots.size()>2000||roads.size()>500)
            throw ApiProblem.invalid("Supply plot and road polygon arrays.");
        if(confirm && plots.isEmpty()&&roads.isEmpty()) throw ApiProblem.invalid("Confirm at least one reviewed plot or road.");
        optionalNumber(g.get("northDegrees"),0,Math.nextDown(360d),"north direction");
        optionalNumber(g.get("aspectRatio"),Math.nextUp(0.05),20,"source page aspect ratio");
        if(g.hasNonNull("units")&&!"feet".equals(g.path("units").asText())) throw ApiProblem.invalid("Layout dimension units must be feet.");
        if(g.hasNonNull("scale")) {
            JsonNode scale=g.path("scale");
            if(!scale.isObject()) throw ApiProblem.invalid("Supply a layout scale object.");
            optionalNumber(scale.get("widthFeet"),0.001,10000000,"workspace width");
            optionalNumber(scale.get("heightFeet"),0.001,10000000,"workspace height");
            if(!Set.of("schematic","user-entered").contains(scale.path("provenance").asText()))
                throw ApiProblem.invalid("Record whether the drawing scale is schematic or user-entered.");
        }
        if((g.hasNonNull("notes")&&!g.path("notes").isTextual())||g.path("notes").asText().length()>8000) throw ApiProblem.invalid("Supply plain-text layout notes, at most 8000 characters.");
        Set<String> numbers=new HashSet<>();
        for(JsonNode p:plots) {
            String number=p.path("number").asText("").trim();
            if(!p.path("number").isTextual()||number.isEmpty()||number.length()>80||!numbers.add(number.toLowerCase(Locale.ROOT)))
                throw ApiProblem.invalid("Plot labels must be non-empty and unique.");
            if(p.has("referenceOnly")&&!p.path("referenceOnly").isBoolean()) throw ApiProblem.invalid("Plan-only must be an explicit checkbox value.");
            if(!Set.of("E","N","W","S","NE","NW","SE","SW","UNKNOWN").contains(p.path("facing").asText()))
                throw ApiProblem.invalid("Select a known facing or UNKNOWN.");
            polygon(p.path("points")); optionalNumber(p.get("confidence"),0,1,"confidence");
            optionalNumber(p.get("rotationDegrees"),-36000,36000,"rotation");
            if(confirm&&!inventory.contains(number)&&!p.path("referenceOnly").asBoolean(false))
                throw ApiProblem.invalid("Plot "+number+" is not in live inventory. Correct its label or explicitly mark it plan-only.");
        }
        for(JsonNode r:roads) {
            if((r.hasNonNull("name")&&!r.path("name").isTextual())||r.path("name").asText().length()>160) throw ApiProblem.invalid("Supply a short plain-text road label.");
            optionalNumber(r.get("widthFeet"),0.01,1000,"road width");
            optionalNumber(r.get("lengthFeet"),0.01,1000000,"road length");
            optionalNumber(r.get("rotationDegrees"),-36000,36000,"rotation");
            optionalNumber(r.get("confidence"),0,1,"confidence");
            if(r.path("points").size()==2&&g.path("layoutVersion").asInt()<2) {
                for(JsonNode p:r.path("points")) vertex(p);
                if(r.path("points").get(0).equals(r.path("points").get(1))) throw ApiProblem.invalid("A road must have a non-zero length.");
            } else polygon(r.path("points"));
        }
        JsonNode parks=g.path("parks");
        if(!parks.isMissingNode()&&!parks.isNull()) {
            if(!parks.isArray()||parks.size()>100) throw ApiProblem.invalid("Supply at most 100 park areas.");
            for(JsonNode park:parks) {
                if(!park.path("name").isTextual()||park.path("name").asText().length()>160) throw ApiProblem.invalid("Supply a short park name.");
                polygon(park.path("points"));
                optionalNumber(park.get("targetAreaSqYards"),0.000001,100000000,"park target area");
            }
        }
        if(g.hasNonNull("boundary")) polygon(g.path("boundary").path("points"));
    }
    private static void optionalNumber(JsonNode n,double min,double max,String label) {
        if(n==null||n.isNull()) return;
        if(!n.isNumber()||!Double.isFinite(n.asDouble())||n.asDouble()<min||n.asDouble()>max)
            throw ApiProblem.invalid("Invalid "+label+". Leave unreadable measurements blank.");
    }
    private static void polygon(JsonNode points) {
        if(!points.isArray()||points.size()<3||points.size()>64) throw ApiProblem.invalid("Each polygon needs 3–64 vertices.");
        double area=0;
        for(int i=0;i<points.size();i++) {
            JsonNode p=points.get(i),q=points.get((i+1)%points.size());
            vertex(p);
            area+=p.path("x").asDouble()*q.path("y").asDouble()-q.path("x").asDouble()*p.path("y").asDouble();
        }
        if(Math.abs(area)<0.0001) throw ApiProblem.invalid("A polygon cannot have zero area.");
        for(int i=0;i<points.size();i++) for(int j=i+1;j<points.size();j++) {
            if(j==i+1||(i==0&&j==points.size()-1)) continue;
            JsonNode a=points.get(i),b=points.get((i+1)%points.size()),c=points.get(j),d=points.get((j+1)%points.size());
            if(cross(a,b,c)*cross(a,b,d)<-1e-10&&cross(c,d,a)*cross(c,d,b)<-1e-10)
                throw ApiProblem.invalid("A polygon cannot cross itself.");
        }
    }
    private static void vertex(JsonNode p) {
        if(!p.hasNonNull("x")||!p.hasNonNull("y")) throw ApiProblem.invalid("Every vertex needs x and y.");
        optionalNumber(p.get("x"),0,100,"vertex x");optionalNumber(p.get("y"),0,100,"vertex y");
    }
    private static double cross(JsonNode a,JsonNode b,JsonNode c) {
        return (b.path("x").asDouble()-a.path("x").asDouble())*(c.path("y").asDouble()-a.path("y").asDouble())
            -(b.path("y").asDouble()-a.path("y").asDouble())*(c.path("x").asDouble()-a.path("x").asDouble());
    }
}

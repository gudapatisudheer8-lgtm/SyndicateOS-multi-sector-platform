package com.syndicateos.erp;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ProjectLayoutTest {
    final ObjectMapper json=new ObjectMapper();
    final ProjectLayout layouts=new ProjectLayout(null,json);
    final UUID project=UUID.randomUUID();
    ProjectLayout.Inputs inputs(int count) throws Exception {
        ArrayNode plots=json.createArrayNode();
        String[] facings={"E","N","NE","SW","W","NW","SE","S"};
        for(int i=0;i<count;i++) plots.addObject().put("id",UUID.nameUUIDFromBytes(("p"+i).getBytes()).toString())
            .put("number",Integer.toString(i+1)).put("facing",facings[i%8])
            .put("dimensions",i%2==0?"29' × 46'":"").put("areaSqYards",150);
        return new ProjectLayout.Inputs(plots,(ObjectNode)json.readTree("""
            {"extentValue":15,"extentUnit":"Acres","roadWidth":"30","openSpacePercent":10}
            """),json.createArrayNode(),json.createArrayNode(),"captured-input-fingerprint",List.of());
    }
    @Test void generatedPositionsAreExplicitlySchematicAndAllInventoryLinksSurvive() throws Exception {
        var in=inputs(40);var g=layouts.generate(project,in);Set<String> numbers=new HashSet<>();
        for(JsonNode p:in.plots()) numbers.add(p.path("number").asText());
        assertDoesNotThrow(()->BlueprintGeometry.validate(g,numbers,true));
        assertEquals(40,g.path("plots").size());assertEquals("PROJECT",g.path("origin").asText());
        assertEquals("schematic",g.path("scale").path("provenance").asText());
        assertEquals(7260,g.path("parks").get(0).path("targetAreaSqYards").asDouble());
        assertEquals(in.fingerprint(),g.path("inventoryFingerprint").asText());
        Set<String> ids=new HashSet<>();
        for(JsonNode p:g.path("plots")) {
            assertTrue(ids.add(p.path("id").asText()));
            JsonNode original=null;for(JsonNode candidate:in.plots()) if(candidate.path("id").equals(p.path("id"))) original=candidate;
            assertNotNull(original);assertEquals(original.path("dimensions"),p.path("dimensions"));
            assertEquals(original.path("facing"),p.path("facing"));
            assertEquals(original.path("number"),p.path("number"));
        }
        for(JsonNode r:g.path("roads")) {
            assertTrue(ids.add(r.path("id").asText()));
            assertTrue(r.path("lengthFeet").isNull(),"No road length was supplied by project setup.");
            if(!r.path("name").asText().equals("Approach / main road")) assertTrue(r.path("widthFeet").isNull());
            else assertEquals(30,r.path("widthFeet").asDouble());
        }
        assertEquals(g,layouts.generate(project,in),"Same saved inputs yield the same suggestion.");
    }
    @Test void generationDoesNotNeedUploadOrNorthDirectionAndHandlesMaximumInventory() throws Exception {
        var in=inputs(2000);Set<String> numbers=new HashSet<>();
        for(JsonNode p:in.plots()) numbers.add(p.path("number").asText());
        assertTimeoutPreemptively(Duration.ofSeconds(5),()->{
            var g=layouts.generate(project,in);
            assertTrue(g.path("northDegrees").isNull());assertEquals(2000,g.path("plots").size());
            BlueprintGeometry.validate(g,numbers,true);
        });
    }
    @Test void optionalParkOnlyAppearsWhenConfiguredAndRecordedDimensionsAreNotGuessed() throws Exception {
        var in=inputs(2);in.values().remove("openSpacePercent");
        var g=layouts.generate(project,in);assertTrue(g.path("parks").isEmpty());
        for(JsonNode p:g.path("plots")) {
            assertEquals(p.path("dimensions").asText().isEmpty()?"schematic":"recorded",p.path("measurementSource").asText());
        }
        assertEquals("NE",ProjectLayout.facing("North-East Corner"));assertEquals("UNKNOWN",ProjectLayout.facing("Commercial"));
    }
    @Test void parksBoundarySelfCrossingAndInvalidScaleAreRejected() throws Exception {
        var in=inputs(2);var g=layouts.generate(project,in);Set<String> numbers=Set.of("1","2");
        ((ObjectNode)g.path("parks").get(0).path("points").get(0)).put("x",200);
        assertThrows(com.syndicateos.core.ApiProblem.class,()->BlueprintGeometry.validate(g,numbers,true));
        var bad=layouts.generate(project,in);
        bad.withObject("/scale").put("widthFeet",-1);
        assertThrows(com.syndicateos.core.ApiProblem.class,()->BlueprintGeometry.validate(bad,numbers,false));
    }
}

package com.syndicateos.erp;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.syndicateos.core.ApiProblem;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Deterministic illustrative arrangement. Never writes operational inventory or money. */
@Service
public class ProjectLayout {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private static final Pattern DIMENSIONS=Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*(?:ft|feet|')?\\s*[xX×*]\\s*(\\d+(?:\\.\\d+)?)");
    public record Inputs(ArrayNode plots,ObjectNode values,ArrayNode groups,JsonNode amenities,String fingerprint,List<String> warnings) {}
    public ProjectLayout(JdbcTemplate jdbc,ObjectMapper json) {this.jdbc=jdbc;this.json=json;}
    public Inputs load(UUID project) {
        JsonNode details=read(jdbc.queryForObject("SELECT details FROM sos.projects WHERE id=?",String.class,project));
        var settingsRows=jdbc.queryForList("SELECT data FROM sos.erp_project_settings WHERE project_id=?",project);
        JsonNode settings=settingsRows.isEmpty()?json.createObjectNode():read(settingsRows.getFirst().get("data"));
        var setupRows=jdbc.queryForList("SELECT data FROM sos.project_setup_sections WHERE project_id=?",project);
        JsonNode setup=setupRows.isEmpty()?json.createObjectNode():read(setupRows.getFirst().get("data"));
        ObjectNode values=json.createObjectNode();
        for(String key:List.of("extentValue","extentUnit","roadWidth","openSpacePercent","roadDeductionPercent")) {
            JsonNode v=details.get(key);
            if(v==null) v=settings.path("projectPlan").path("values").get(key);
            if(v==null) v=setup.path("values").get(key);
            if(v!=null) values.set(key,v);
        }
        JsonNode sourceGroups=settings.path("projectPlan").path("groups");
        if(!sourceGroups.isArray()) sourceGroups=setup.path("groups");
        ArrayNode groups=json.createArrayNode();
        if(sourceGroups.isArray()) for(JsonNode g:sourceGroups) {
            ObjectNode row=groups.addObject();
            for(String key:List.of("count","facing","areaSqYards","dimensions","numberPrefix","startNumber"))
                if(g.has(key)) row.set(key,g.get(key));
        }
        ArrayNode plots=json.createArrayNode();
        for(var r:jdbc.queryForList("SELECT id,data FROM sos.erp_records WHERE project_id=? AND kind='plots' AND status<>'deleted' ORDER BY id",project)) {
            JsonNode data=read(r.get("data"));
            ObjectNode p=plots.addObject().put("id",r.get("id").toString())
                .put("number",data.path("plotNumber").asText()).put("facing",facing(data.path("facing").asText()))
                .put("recordedFacing",data.path("facing").asText()).put("dimensions",data.path("dimensions").asText(""));
            if(data.hasNonNull("areaSqYards")) p.set("areaSqYards",data.get("areaSqYards"));
            else p.putNull("areaSqYards");
            if(data.hasNonNull("roadWidthFt")) p.set("roadWidthFt",data.get("roadWidthFt"));
        }
        List<String> warnings=new ArrayList<>();
        Map<String,Integer> expected=new TreeMap<>(),actual=new TreeMap<>();
        for(JsonNode g:groups) expected.merge(facing(g.path("facing").asText()),g.path("count").asInt(),Integer::sum);
        for(JsonNode p:plots) actual.merge(p.path("facing").asText(),1,Integer::sum);
        if(!groups.isEmpty()&&!expected.equals(actual))
            warnings.add("Saved plot matrix differs from live inventory. All live plots are included; no inventory is created or removed.");
        if(!groups.isEmpty()&&expected.equals(actual)) {
            Map<String,Integer> expectedAreas=new TreeMap<>(),actualAreas=new TreeMap<>();
            boolean known=true;
            for(JsonNode row:groups) {
                if(number(row.path("areaSqYards"))<=0) {known=false;break;}
                expectedAreas.merge(facing(row.path("facing").asText())+":"+number(row.path("areaSqYards")),row.path("count").asInt(),Integer::sum);
            }
            for(JsonNode p:plots) actualAreas.merge(p.path("facing").asText()+":"+number(p.path("areaSqYards")),1,Integer::sum);
            if(known&&!expectedAreas.equals(actualAreas))
                warnings.add("Live plot areas differ from the saved matrix groups. The layout uses current live measurements; review the discrepancy rather than recreating inventory.");
        }
        if(plots.isEmpty()) warnings.add("No live plots exist yet. Finalize plot setup before generating a layout.");
        long unknown=java.util.stream.StreamSupport.stream(plots.spliterator(),false).filter(p->measurements(p)==null).count();
        if(unknown>0) warnings.add(unknown+" plots have no usable recorded frontage/depth. Their footprints are schematic, not measured dimensions.");
        JsonNode amenities=settings.path("layoutAmenities").isArray()?settings.path("layoutAmenities"):json.createArrayNode();
        double extent=extentSqYards(values),plotArea=0,parkArea=0;
        for(JsonNode p:plots) plotArea+=number(p.path("areaSqYards"));
        for(JsonNode a:amenities) if("park".equals(a.path("category").asText())) parkArea+=number(a.path("allocatedAreaSqYards"));
        if(parkArea<=0&&extent>0) parkArea=extent*number(values.path("openSpacePercent"))/100;
        if(extent>0&&plotArea+parkArea>extent+0.01)
            warnings.add("Recorded plot area plus configured park/open space exceeds the saved venture extent. Review the area budget; no operational quantities are changed.");
        else if(extent>0&&plotArea+parkArea+extent*number(values.path("roadDeductionPercent"))/100>extent+0.01)
            warnings.add("Plots, open space and configured road deduction exceed the saved venture extent. Review the area budget.");
        String canonical=plots.toString()+values+groups.toString()+amenities;
        String fingerprint;
        try {fingerprint=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8)));}
        catch(Exception e) {throw new IllegalStateException(e);}
        return new Inputs(plots,values,groups,amenities,fingerprint,warnings);
    }
    public ObjectNode generate(UUID project,Inputs in) {
        if(in.plots.isEmpty()||in.plots.size()>2000) throw ApiProblem.invalid("Generate a layout from 1–2000 saved live plots.");
        Map<String,List<JsonNode>> groups=new TreeMap<>();
        double maxW=1,maxH=1;
        for(JsonNode p:in.plots) {
            groups.computeIfAbsent(p.path("facing").asText(),k->new ArrayList<>()).add(p);
            double[] dims=footprint(p);maxW=Math.max(maxW,dims[0]);maxH=Math.max(maxH,dims[1]);
        }
        for(var group:groups.values()) group.sort(Comparator.comparing(p->p.path("number").asText(),String.CASE_INSENSITIVE_ORDER));
        double recordedRoad=number(in.values.path("roadWidth"));
        double rw=recordedRoad>0?recordedRoad:Math.max(8,Math.min(maxW,maxH)/4);
        // This width is a drawing allowance for internal roads, not a surveyed road measurement.
        double gap=Math.max(2,rw/4),cellW=maxW+rw+gap,cellH=maxH+rw+gap;
        int largest=groups.values().stream().mapToInt(List::size).max().orElse(1),cols=(int)Math.ceil(Math.sqrt(largest));
        int rows=(int)Math.ceil((double)largest/cols),groupCols=Math.min(2,groups.size());
        double groupW=cols*cellW+rw+gap,groupH=rows*cellH+rw+gap;
        double width=groupW*groupCols+gap*2,height=groupH*Math.ceil((double)groups.size()/groupCols)+rw+gap*3;
        double mainY=height-rw-gap;
        double parkTarget=0;
        for(JsonNode a:in.amenities) if("park".equals(a.path("category").asText())) parkTarget+=number(a.path("allocatedAreaSqYards"));
        double extent=extentSqYards(in.values);
        if(parkTarget<=0&&extent>0) parkTarget=extent*number(in.values.path("openSpacePercent"))/100;
        double parkSide=parkTarget>0?Math.sqrt(parkTarget*9):0,parkX=width;
        if(parkSide>0) {width+=parkSide+gap;height=Math.max(height,parkSide+gap*2);}
        // Very elongated recorded dimensions stay recorded; enlarge the drawing workspace only.
        width=Math.max(width,height/19);height=Math.max(height,width/19);
        ObjectNode g=json.createObjectNode().put("layoutVersion",2).put("origin","PROJECT").put("units","feet")
            .put("inventoryFingerprint",in.fingerprint).put("aspectRatio",width/height).putNull("northDegrees")
            .put("notes","Illustrative arrangement generated from saved project data, not a survey. Positions, internal roads and unknown plot footprints require review. Operational plot numbers, facing, bookings and money are unchanged.");
        g.putObject("scale").put("widthFeet",width).put("heightFeet",height).put("provenance","schematic");
        ArrayNode plots=g.putArray("plots"),roads=g.putArray("roads"),parks=g.putArray("parks");
        int gi=0;
        for(var entry:groups.entrySet()) {
            String facing=entry.getKey();
            double gx=gap+(gi%groupCols)*groupW,gy=gap+(gi/groupCols)*groupH;
            int index=0;
            boolean east=facing.contains("E"),west=facing.contains("W"),north=facing.contains("N"),south=facing.contains("S");
            for(JsonNode p:entry.getValue()) {
                double[] dims=footprint(p);
                double x=gx+rw+(index%cols)*cellW,y=gy+(index/cols)*cellH;
                double px=east?x+maxW-dims[0]:west?x+rw:x+(maxW-dims[0])/2;
                double py=north?y+rw:south?y+maxH-dims[1]:y+(maxH-dims[1])/2;
                ObjectNode plot=plots.addObject();plot.setAll((ObjectNode)p.deepCopy());
                plot.put("rotationDegrees",0).put("measurementSource",measurements(p)==null?"schematic":"recorded");
                plot.set("points",rectangle(px,py,dims[0],dims[1],width,height));index++;
            }
            int usedRows=(int)Math.ceil((double)entry.getValue().size()/cols);
            if(east||west) for(int c=0;c<Math.min(cols,entry.getValue().size());c++) {
                double rx=gx+rw+c*cellW+(east?maxW:0);
                road(roads,project,"Internal "+facing+" vertical "+(c+1),rx,gy,rw,usedRows*cellH+rw,width,height,null);
            }
            if(north||south||(!east&&!west)) for(int r=0;r<usedRows;r++) {
                double ry=gy+r*cellH+(south?maxH:0);
                road(roads,project,"Internal "+facing+" horizontal "+(r+1),gx,ry,cols*cellW+rw,rw,width,height,null);
            }
            road(roads,project,"Suggested access "+facing,gx,gy,rw,usedRows*cellH+rw,width,height,null);
            road(roads,project,"Suggested connector "+facing,gx,gy+usedRows*cellH,cols*cellW+rw,rw,width,height,null);
            gi++;
        }
        for(int c=0;c<groupCols;c++) road(roads,project,"Suggested main connection "+(c+1),gap+c*groupW,gap,rw,mainY-gap+rw,width,height,null);
        road(roads,project,"Approach / main road",gap,mainY,parkX-gap,rw,width,height,recordedRoad>0?recordedRoad:null);
        if(parkSide>0) {
            ObjectNode park=parks.addObject().put("id",stableId(project,"park")).put("name","Park / open space")
                .put("targetAreaSqYards",parkTarget);
            park.set("points",rectangle(parkX,gap,parkSide,parkSide,width,height));
        }
        g.putObject("boundary").set("points",rectangle(0,0,width,height,width,height));
        g.withObject("/boundary").put("provenance","schematic");
        return g;
    }
    public static String facing(String s) {
        String n=s.trim().toUpperCase(Locale.ROOT).replaceAll("[ _-]","").replace("CORNER","");
        return switch(n) {case "E","EAST"->"E";case "W","WEST"->"W";case "N","NORTH"->"N";case "S","SOUTH"->"S";
            case "NE","NORTHEAST"->"NE";case "NW","NORTHWEST"->"NW";case "SE","SOUTHEAST"->"SE";case "SW","SOUTHWEST"->"SW";default->"UNKNOWN";};
    }
    private static double[] measurements(JsonNode p) {
        String text=p.path("dimensions").asText().trim();
        // The setup dimensions field is feet. Do not reinterpret explicit metric or feet/inch notation.
        if(text.toLowerCase(Locale.ROOT).matches(".*(?:metre|meter|\\bcm\\b|\\bmm\\b).*")||text.contains("\"")) return null;
        Matcher m=DIMENSIONS.matcher(text);
        if(!m.find()||m.start()!=0) return null;
        try {
            double w=Double.parseDouble(m.group(1)),h=Double.parseDouble(m.group(2));
            if(w>0&&h>0&&w<100000&&h<100000) return new double[]{w,h};
        } catch(NumberFormatException ignored) { /* retain unreadable original text */ }
        return null;
    }
    private static double[] footprint(JsonNode p) {
        double[] known=measurements(p);if(known!=null) return known;
        double area=number(p.path("areaSqYards"));
        // Unknown frontage/depth: an area-proportional square is a schematic symbol, not a claim.
        double side=area>0?Math.sqrt(area*9):30;
        return new double[]{side,side};
    }
    private ArrayNode rectangle(double x,double y,double w,double h,double width,double height) {
        ArrayNode points=json.createArrayNode();
        for(double[] p:new double[][]{{x,y},{x+w,y},{x+w,y+h},{x,y+h}})
            points.addObject().put("x",p[0]*100/width).put("y",p[1]*100/height);
        return points;
    }
    private void road(ArrayNode roads,UUID project,String name,double x,double y,double w,double h,double width,double height,Double recordedWidth) {
        ObjectNode road=roads.addObject().put("id",stableId(project,name)).put("name",name).put("rotationDegrees",0)
            .put("measurementSource",recordedWidth==null?"schematic":"recorded-width");
        if(recordedWidth==null) road.putNull("widthFeet"); else road.put("widthFeet",recordedWidth);
        road.putNull("lengthFeet").set("points",rectangle(x,y,w,h,width,height));
    }
    private static String stableId(UUID project,String label) {return UUID.nameUUIDFromBytes((project+":"+label).getBytes(StandardCharsets.UTF_8)).toString();}
    private static double number(JsonNode n) {
        try {double v=Double.parseDouble(n.asText());return Double.isFinite(v)&&v>0?v:0;}
        catch(NumberFormatException e) {return 0;}
    }
    private static double extentSqYards(JsonNode values) {
        double amount=number(values.path("extentValue"));
        return amount*switch(values.path("extentUnit").asText()) {case "Acres"->4840d;case "Guntas"->121d;case "Cents"->48.4d;case "Sq. Yards","Sq. Yds"->1d;default->0d;};
    }
    private JsonNode read(Object value) {
        try {return value==null?json.createObjectNode():json.readTree(value.toString());}
        catch(Exception e) {throw new ApiProblem(503,"INVALID_LAYOUT_INPUT","Saved project layout inputs could not be read.");}
    }
}

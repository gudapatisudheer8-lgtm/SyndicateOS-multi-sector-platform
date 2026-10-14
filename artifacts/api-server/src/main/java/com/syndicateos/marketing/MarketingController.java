package com.syndicateos.marketing;

import com.fasterxml.jackson.databind.JsonNode;
import com.syndicateos.auth.SessionAccount;
import java.util.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/marketing")
public class MarketingController {
    private final MarketingService service;
    public MarketingController(MarketingService service) { this.service=service; }
    @PostMapping("/invitations")
    public Map<String,Object> invite(@AuthenticationPrincipal SessionAccount actor,@RequestBody JsonNode body) {
        return service.invite(actor,body);
    }
    @GetMapping("/projects/{project}/proposals")
    public List<Map<String,Object>> proposals(@AuthenticationPrincipal SessionAccount actor,@PathVariable UUID project) {
        return service.proposals(actor,project);
    }
    @PostMapping("/proposals/{id}/review")
    public Map<String,Object> review(@AuthenticationPrincipal SessionAccount actor,@PathVariable UUID id,@RequestBody JsonNode body) {
        return service.review(actor,id,body);
    }
    @GetMapping("/access/invitation")
    public Map<String,Object> info(@RequestParam String invite) { return service.info(invite); }
    @PostMapping("/access/login")
    public Map<String,Object> login(@RequestBody JsonNode body) { return service.login(body); }
    @GetMapping("/access/session")
    public Map<String,Object> session(@RequestHeader(value="X-Marketing-Session",required=false) String token,@RequestParam String invite) {
        return service.session(token,invite);
    }
    @PostMapping("/access/pin")
    public Map<String,Object> pin(@RequestHeader(value="X-Marketing-Session",required=false) String token,@RequestBody JsonNode body) {
        return service.changePin(token,body);
    }
    @GetMapping("/access/inventory")
    public Map<String,Object> inventory(@RequestHeader(value="X-Marketing-Session",required=false) String token,@RequestParam String invite) {
        return service.inventory(token,invite);
    }
    @GetMapping("/access/blueprint")
    public org.springframework.http.ResponseEntity<Map<String,Object>> blueprint(
        @RequestHeader(value="X-Marketing-Session",required=false) String token,@RequestParam String invite) {
        return org.springframework.http.ResponseEntity.ok()
            .cacheControl(org.springframework.http.CacheControl.noStore()).body(service.blueprint(token,invite));
    }
    @PostMapping("/access/proposals")
    public Map<String,Object> submit(@RequestHeader(value="X-Marketing-Session",required=false) String token,@RequestBody JsonNode body) {
        return service.submit(token,body);
    }
    @PostMapping("/access/logout")
    public Map<String,Object> logout(@RequestHeader(value="X-Marketing-Session",required=false) String token) {
        service.logout(token); return Map.of("status","ok");
    }
}

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createParkingServer } from "./serve.mjs";

// Real HTTP requests exercise the production proxy. Upstream records requests;
// authorization and SQL persistence are covered separately by the Java suite.
async function fixture(t) {
  const seen=[];
  const root=await mkdtemp(join(tmpdir(),"parking-security-"));
  await writeFile(join(root,"index.html"),"<!doctype html><title>Security fixture</title>");
  const backend=http.createServer((req,res)=>{
    seen.push({url:req.url,headers:req.headers});
    req.resume(); res.setHeader("Content-Type","application/json"); res.end('{"ok":true}');
  });
  backend.listen(0,"127.0.0.1"); await once(backend,"listening");
  const server=createParkingServer({backend:`http://127.0.0.1:${backend.address().port}`,root});
  server.listen(0,"127.0.0.1"); await once(server,"listening");
  t.after(async()=>{
    server.closeAllConnections(); backend.closeAllConnections();
    await Promise.all([new Promise(resolve=>server.close(resolve)),new Promise(resolve=>backend.close(resolve))]);
    await rm(root,{recursive:true,force:true});
  });
  return {base:`http://127.0.0.1:${server.address().port}`,seen};
}

test("SEC-PROXY-01: public requests cannot invoke ingestion or inspect secrets",async t=>{
  const {base,seen}=await fixture(t);
  for(const path of ["/api/v1/logs","/api/v1/parking-spots/sync","/api/v1/parking-spots/events"])
    assert.equal((await fetch(base+path,{method:"POST",headers:{"X-API-Key":"forged"}})).status,404);
  for(const path of ["/.env","/v3/api-docs","/actuator/env"])
    assert.equal((await fetch(base+path)).status,404);
  assert.equal(seen.length,0);
});

test("SEC-PROXY-02: cross-origin reservation forgery never reaches backend",async t=>{
  const {base,seen}=await fixture(t);
  for(const headers of [
    {Origin:"https://attacker.invalid","X-Parking-Client":"mobile"},
    {Origin:base,"X-Parking-Client":"mobile","Sec-Fetch-Site":"cross-site"},
    {Origin:base}, {"X-Parking-Client":"mobile"}
  ]) assert.equal((await fetch(base+"/api/v1/reservations",{method:"POST",headers})).status,403);
  assert.equal(seen.length,0);
  assert.equal((await fetch(base+"/api/v1/reservations",{method:"POST",headers:{Origin:base,"X-Parking-Client":"mobile"}})).status,200);
  assert.equal(seen.length,1); // Positive control.
});

test("SEC-PROXY-03: oversized bot payload rejected before forwarding",async t=>{
  const {base,seen}=await fixture(t);
  const response=await fetch(base+"/api/v1/reservations",{method:"POST",
    headers:{Origin:base,"X-Parking-Client":"mobile","Content-Type":"application/json"},body:"x".repeat(4097)});
  assert.equal(response.status,413); assert.equal(seen.length,0);
});

test("SEC-PROXY-04: forged ingestion and forwarding headers stripped",async t=>{
  const {base,seen}=await fixture(t);
  assert.equal((await fetch(base+"/api/v1/parking-spots",{headers:{
    "X-API-Key":"do-not-forward","X-Forwarded-For":"203.0.113.10","X-Forwarded-Host":"attacker.invalid"
  }})).status,200);
  for(const name of ["x-api-key","x-forwarded-for","x-forwarded-host"]) assert.equal(seen[0].headers[name],undefined);
});

test("SEC-PROXY-05: browser headers prohibit script injection and framing",async t=>{
  const {base}=await fixture(t);
  const response=await fetch(base+"/totem");
  assert.equal(response.status,200);
  assert.equal(response.headers.get("x-content-type-options"),"nosniff");
  const csp=response.headers.get("content-security-policy");
  assert.match(csp,/script-src 'self'/); assert.match(csp,/frame-ancestors 'none'/);
  assert.doesNotMatch(csp,/unsafe-inline|unsafe-eval/);
});

test("SEC-PROXY-06: encoded traversal cannot read files outside build",async t=>{
  const {base,seen}=await fixture(t);
  for(const path of ["/..%2f.env","/%2e%2e%2f.env","/%2e%2e%5c.env"])
    assert.equal((await fetch(base+path)).status,404);
  assert.equal(seen.length,0);
});

test("SEC-PROXY-07: observation - read bots encounter no rate limit at proxy",async t=>{
  const {base,seen}=await fixture(t);
  const codes=[];
  for(let i=0;i<40;i++) codes.push((await fetch(base+"/api/v1/reservations/current")).status);
  assert.equal(codes.filter(code=>code===429).length,0);
  assert.equal(seen.length,40);
  // Characterization of a coverage gap, not a claim that bots are blocked.
});

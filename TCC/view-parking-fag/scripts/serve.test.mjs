import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createParkingServer } from "./serve.mjs";

test("fronteira publica bloqueia ingestao, configuracoes e POST de outra origem",async () => {
  const backend = http.createServer((req,res)=>res.end(JSON.stringify({ok:true, origin:req.headers.origin})));
  backend.listen(0,"127.0.0.1"); await once(backend,"listening");
  const server = createParkingServer({backend:`http://127.0.0.1:${backend.address().port}`});
  server.listen(0,"127.0.0.1"); await once(server,"listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ["/api/v1/logs","/api/v1/parking-spots/sync","/.env","/actuator/health","/v3/api-docs"])
      assert.equal((await fetch(base+path)).status,404);
    assert.equal((await fetch(base+"/api/v1/parking-spots")).status,200);
    assert.equal((await fetch(base+"/api/v1/reservations",{method:"POST",headers:{Origin:"https://other.example","X-Parking-Client":"mobile"}})).status,403);
    const accepted = await fetch(base+"/api/v1/reservations",{method:"POST",headers:{Origin:base,"X-Parking-Client":"mobile"}});
    assert.equal(accepted.status,200); assert.equal((await accepted.json()).origin,undefined);
  } finally { server.closeAllConnections(); backend.closeAllConnections(); server.close(); backend.close(); }
});

test("identificacao publica do deploy possui JSON legivel e commit verificavel",async () => {
  const temporaryRoot=resolve(tmpdir());
  const root=await mkdtemp(join(temporaryRoot,"parking-version-"));
  const version={commit:"a".repeat(40),deployment:"123-1",publishedAt:"2026-10-29T18:00:00Z"};
  await writeFile(join(root,"deploy-info.json"),JSON.stringify(version));
  const server=createParkingServer({root});
  server.listen(0,"127.0.0.1"); await once(server,"listening");
  try {
    const response=await fetch(`http://127.0.0.1:${server.address().port}/deploy-info.json`);
    assert.equal(response.status,200);
    assert.match(response.headers.get("content-type"),/^application\/json/);
    assert.deepEqual(await response.json(),version);
  } finally {
    server.closeAllConnections(); await new Promise(done=>server.close(done));
    assert.ok(root.startsWith(temporaryRoot+sep) && root.slice(temporaryRoot.length+1).startsWith("parking-version-"));
    await rm(root,{recursive:true,force:true});
  }
});

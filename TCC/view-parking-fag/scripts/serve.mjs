import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const types = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png", ".ico":"image/x-icon" };
function allowed(path, method) {
  return method === "GET" && ["/api/v1/parking-spots", "/api/v1/parking-spots/summary", "/api/v1/parking-spots/alternatives", "/api/v1/reservations/current"].includes(path)
    || method === "POST" && (path === "/api/v1/reservations" || /^\/api\/v1\/reservations\/[a-f0-9-]{36}\/(confirm|reject|cancel)$/.test(path));
}
export function createParkingServer({ backend = "http://127.0.0.1:8080", root = resolve(here,"dist") } = {}) {
  const target = new URL(backend);
  if (target.protocol !== "http:") throw new Error("O backend interno deve usar HTTP local");
  const headers = req => {
    const result = { ...req.headers, host: target.host, "x-forwarded-proto":req.headers["x-forwarded-proto"] === "https" ? "https" : "http" };
    // Same-origin policy is enforced at this public boundary; upstream accepts only loopback traffic.
    delete result.origin; delete result["x-forwarded-host"]; delete result["x-forwarded-for"]; delete result["x-api-key"];
    return result;
  };
  const server = http.createServer({ maxHeaderSize:16384 }, async (req,res) => {
    res.setHeader("X-Content-Type-Options","nosniff");
    res.setHeader("Referrer-Policy","same-origin");
    res.setHeader("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'");
    let url;
    try { url = new URL(req.url,"http://localhost"); } catch { res.writeHead(400).end(); return; }
    if (url.pathname.startsWith("/api/")) {
      let body;
      if (!allowed(url.pathname,req.method)) { res.writeHead(404).end(); return; }
      if (req.method === "POST") {
        const origin = req.headers.origin;
        if (!origin || ![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(origin)
            || req.headers["sec-fetch-site"] === "cross-site" || req.headers["x-parking-client"] !== "mobile") {
          res.writeHead(403,{"Content-Type":"application/json"}).end(JSON.stringify({message:"Origem inválida"})); return;
        }
        if (Number(req.headers["content-length"] || 0) > 4096) { res.writeHead(413).end(); return; }
        const chunks = []; let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 4096) { res.writeHead(413).end(); return; }
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      }
      const upstream = http.request(new URL(url.pathname + url.search,target), {method:req.method,headers:headers(req)}, response => {
        res.writeHead(response.statusCode,response.headers); response.pipe(res);
      });
      upstream.on("error",() => { if (!res.headersSent) res.writeHead(502,{"Content-Type":"application/json"}); res.end(JSON.stringify({message:"Servidor indisponível"})); });
      upstream.setTimeout(10000,() => upstream.destroy()); req.on("aborted",() => upstream.destroy());
      if (body) upstream.end(body); else req.pipe(upstream);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return; }
    try {
      const route = ["/","/mobile","/totem","/painel"].includes(url.pathname.replace(/\/$/,"") || "/");
      const file = route ? resolve(root,"index.html") : resolve(root, "." + decodeURIComponent(url.pathname));
      if (!file.startsWith(resolve(root) + sep) || !(await stat(file)).isFile()) { res.writeHead(404).end(); return; }
      res.writeHead(200,{"Content-Type":types[extname(file)] || "application/octet-stream", "Cache-Control":"no-cache"});
      res.end(req.method === "HEAD" ? undefined : await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on("upgrade",(req,socket,head) => {
    if (req.url !== "/api/v1/events") { socket.destroy(); return; }
    const upstream = http.request(new URL(req.url,target),{headers:headers(req)});
    upstream.on("upgrade",(response,remote,remoteHead) => {
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers).map(([key,value])=>`${key}: ${value}\r\n`).join("")}\r\n`);
      if (remoteHead.length) socket.write(remoteHead); if (head.length) remote.write(head);
      remote.pipe(socket); socket.pipe(remote);
      remote.on("error",()=>socket.destroy()); socket.on("error",()=>remote.destroy());
      socket.on("close",()=>remote.destroy()); remote.on("close",()=>socket.destroy());
    });
    upstream.on("error",()=>socket.destroy());
    upstream.on("response",()=>socket.destroy());
    upstream.end();
  });
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.PUBLIC_BIND || "127.0.0.1";
  const port = Number(process.env.PUBLIC_PORT || 4173);
  createParkingServer({backend:process.env.JAVA_PROXY_URL || "http://127.0.0.1:8080"}).listen(port,host,
    () => console.log(`Parking FAG: http://${host}:${port}/mobile · Ctrl+C para encerrar`));
}

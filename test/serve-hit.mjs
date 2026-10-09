import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const D = process.argv[2], got = [];
const T = { ".html":"text/html; charset=utf-8", ".js":"text/javascript", ".css":"text/css", ".png":"image/png", ".json":"application/json", ".webmanifest":"application/manifest+json" };
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/api/")) {
    let b = ""; for await (const c of req) b += c;
    if (u.pathname === "/api/hit") { try { got.push(JSON.parse(b)); } catch(e){} res.writeHead(204); return res.end(); }
    if (u.pathname === "/api/_got") { res.writeHead(200); res.end(JSON.stringify(got)); got.length = 0; return; }
    res.writeHead(204); return res.end();
  }
  let p = path.join(D, decodeURIComponent(u.pathname)); if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {"content-type": T[path.extname(p)] || "application/octet-stream"}); fs.createReadStream(p).pipe(res);
}).listen(8791);

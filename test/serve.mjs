// テスト用のローカルサーバー：dist/ を配信し、/api/quiz/submit と /api/hit を本物の関数で動かす（D1 は sqlite で代用）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { makeD1 } from "./d1shim.mjs";
import * as submit from "../functions/api/quiz/submit.js";
const env = { QUIZDB: process.env.NODB ? undefined : makeD1() };
const hits = [];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const port = +process.env.PORT || 8787;
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    const body = await new Promise(r => { let b = ""; req.on("data", c => b += c); req.on("end", () => r(b)); });
    if (u.pathname === "/api/hit") { hits.push(JSON.parse(body || "{}")); res.writeHead(204); return res.end(); }
    if (u.pathname === "/api/_hits") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(hits)); }
    if (u.pathname === "/api/quiz/submit") {
      const r = await submit.onRequestPost({ request: new Request("http://localhost" + req.url, { method: "POST", body }), env });
      res.writeHead(r.status, { "content-type": "application/json" }); return res.end(await r.text());
    }
    res.writeHead(204); return res.end();
  }
  let p = path.join("dist", decodeURIComponent(u.pathname));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end("404"); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log("serving on " + port));

export function onRequestGet(){ return new Response("pong", { headers: { "cache-control": "no-store" } }); }

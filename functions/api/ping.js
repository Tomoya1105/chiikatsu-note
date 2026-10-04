export function onRequestGet({ request }){ return new Response(decodeURIComponent(request.url), { headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" } }); }

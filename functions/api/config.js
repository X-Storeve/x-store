export async function onRequestGet({ env }) {
  try {
    let cfg = await env.XSTORE_KV.get('config', 'json');
    if (!cfg) {
      const url = new URL('/data/config.json', 'https://x-store.pages.dev');
      const r = await fetch(url.toString(), { cf: { cacheTtl: 0 } });
      cfg = await r.json();
    }
    return new Response(JSON.stringify(cfg), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

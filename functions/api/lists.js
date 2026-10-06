export async function onRequestGet({ env }) {
  try {
    const bancos = (await env.XSTORE_KV.get('bancos', 'json')) || [];
    const juegos = (await env.XSTORE_KV.get('juegos', 'json')) || [];
    return json({ bancos, juegos });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAuth(request, env);
    if (!auth.ok) return json({ error: 'unauthorized' }, 401);

    const url = new URL(request.url);
    if (url.searchParams.get('action') !== 'save') {
      return json({ error: 'invalid action' }, 400);
    }
    const body = await request.json();
    const bancos = Array.isArray(body.bancos) ? body.bancos.filter(b => typeof b === 'string' && b.trim()) : [];
    const juegos = Array.isArray(body.juegos) ? body.juegos.filter(j => typeof j === 'string' && j.trim()) : [];
    if (bancos.length === 0 || juegos.length === 0) {
      return json({ error: 'Debe haber al menos 1 banco y 1 juego' }, 400);
    }
    await env.XSTORE_KV.put('bancos', JSON.stringify(bancos));
    await env.XSTORE_KV.put('juegos', JSON.stringify(juegos));
    return json({ ok: true, lists: { bancos, juegos } });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }
  });
}

async function requireAuth(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/xstore_session=([^;]+)/);
  if (!match) return { ok: false };
  const sess = await env.XSTORE_KV.get(`session:${match[1]}`, 'json');
  if (!sess || (sess.exp && Date.now() > sess.exp)) return { ok: false };
  return { ok: true, username: sess.username };
}

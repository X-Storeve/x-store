export async function onRequestGet({ env }) {
  try {
    let cfg = await env.XSTORE_KV.get('config', 'json');
    if (!cfg) {
      cfg = { maintenance: false, paymentMethods: [], heroCards: [], games: {} };
    }
    return json(cfg);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAuth(request, env);
    if (!auth.ok) return json({ error: 'unauthorized' }, 401);

    const body = await request.json();
    const current = (await env.XSTORE_KV.get('config', 'json')) || {};
    const next = {
      ...current,
      games: body.games ?? current.games ?? {},
      paymentMethods: body.paymentMethods ?? current.paymentMethods ?? [],
      heroCards: body.heroCards ?? current.heroCards ?? [],
      maintenance: typeof body.maintenance === 'boolean' ? body.maintenance : (current.maintenance || false),
      whatsapp: body.whatsapp ?? current.whatsapp ?? ''
    };
    await env.XSTORE_KV.put('config', JSON.stringify(next));
    return json({ ok: true, config: next });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

async function requireAuth(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/xstore_session=([^;]+)/);
  if (!match) return { ok: false };
  const sess = await env.XSTORE_KV.get(`session:${match[1]}`, 'json');
  if (!sess) return { ok: false };
  if (sess.exp && Date.now() > sess.exp) {
    await env.XSTORE_KV.delete(`session:${match[1]}`);
    return { ok: false };
  }
  return { ok: true, username: sess.username };
}

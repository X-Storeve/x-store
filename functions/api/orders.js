export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'set-status') {
    const auth = await requireAuth(request, env);
    if (!auth.ok) return json({ error: 'unauthorized' }, 401);
    const body = await request.json();
    const { id, status } = body;
    if (!id || !['pending','verified','completed','rejected'].includes(status)) {
      return json({ error: 'invalid payload' }, 400);
    }
    const o = await env.XSTORE_KV.get(`order:${id}`, 'json');
    if (!o) return json({ error: 'not found' }, 404);
    o.status = status;
    o.updatedAt = Date.now();
    await env.XSTORE_KV.put(`order:${id}`, JSON.stringify(o));
    return json({ ok: true, order: o });
  }

  if (action === 'delete') {
    const auth = await requireAuth(request, env);
    if (!auth.ok) return json({ error: 'unauthorized' }, 401);
    const { id } = await request.json();
    if (!id) return json({ error: 'missing id' }, 400);
    await env.XSTORE_KV.delete(`order:${id}`);
    return json({ ok: true });
  }

  // Crear orden (público)
  try {
    const body = await request.json();
    const id = crypto.randomUUID();
    const now = Date.now();
    const order = {
      id, createdAt: now, status: 'pending',
      phone: body.phone, clientName: body.clientName || '',
      gameKey: body.gameKey, gameTitle: body.gameTitle,
      playerId: body.playerId, serverId: body.serverId,
      packages: body.packages, paymentMethod: body.paymentMethod,
      reference: body.reference, bank: body.bank,
      totalUSDT: body.totalUSDT, totalLocal: body.totalLocal,
      currencyCode: body.currencyCode, captureKey: null
    };
    if (body.capture && body.capture.startsWith('data:image')) {
      const base64 = body.capture.split(',')[1];
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const key = `captures/${id}.jpg`;
      await env.XSTORE_R2.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
      order.captureKey = key;
    }
    await env.XSTORE_KV.put(`order:${id}`, JSON.stringify(order));
    const listRaw = await env.XSTORE_KV.get(`orders:${body.phone}`, 'json');
    const list = Array.isArray(listRaw) ? listRaw : [];
    list.unshift(id);
    await env.XSTORE_KV.put(`orders:${body.phone}`, JSON.stringify(list.slice(0, 200)));
    await env.XSTORE_KV.put('orders:global', JSON.stringify(await prependGlobal(env, id)));
    return json({ ok: true, id });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const id = url.searchParams.get('id');

  if (action === 'get' && id) {
    const o = await env.XSTORE_KV.get(`order:${id}`, 'json');
    if (!o) return json({ error: 'not found' }, 404);
    return json({ ok: true, order: o });
  }

  // A partir de aquí, todo requiere auth
  const auth = await requireAuth(request, env);
  if (!auth.ok) return json({ error: 'unauthorized' }, 401);

  if (action === 'list') {
    const status = url.searchParams.get('status') || '';
    const globalIds = (await env.XSTORE_KV.get('orders:global', 'json')) || [];
    const orders = [];
    for (const oid of globalIds) {
      const o = await env.XSTORE_KV.get(`order:${oid}`, 'json');
      if (o && (!status || o.status === status)) orders.push(o);
    }
    return json({ ok: true, orders });
  }

  if (action === 'count-pending') {
    const globalIds = (await env.XSTORE_KV.get('orders:global', 'json')) || [];
    let count = 0;
    for (const oid of globalIds) {
      const o = await env.XSTORE_KV.get(`order:${oid}`, 'json');
      if (o && o.status === 'pending') count++;
    }
    return json({ ok: true, count });
  }

  return json({ error: 'invalid action' }, 400);
}

async function prependGlobal(env, id) {
  const g = (await env.XSTORE_KV.get('orders:global', 'json')) || [];
  g.unshift(id);
  return g.slice(0, 500);
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

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'lookup') {
    const phone = norm(url.searchParams.get('phone'));
    if (!phone) return json({ found: false }, 400);
    const c = await env.XSTORE_KV.get(`client:${phone}`, 'json');
    return json({ found: !!c, client: c || null });
  }

  if (action === 'list') {
    const auth = await requireAuth(request, env);
    if (!auth.ok) return json({ error: 'unauthorized' }, 401);
    const index = (await env.XSTORE_KV.get('clients:index', 'json')) || [];
    const clients = [];
    for (const phone of index) {
      const c = await env.XSTORE_KV.get(`client:${phone}`, 'json');
      if (c) clients.push(c);
    }
    return json({ ok: true, clients });
  }

  return json({ error: 'invalid action' }, 400);
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'register';

  // Registro público (lo usa la tienda cuando un cliente se autorregistra)
  if (action === 'register') {
    const body = await request.json();
    const phone = norm(body.phone);
    if (phone.length < 8) return json({ error: 'invalid phone' }, 400);
    const client = {
      phone,
      firstName: body.firstName || '',
      lastName: body.lastName || '',
      cedula: body.cedula || '',
      notes: body.notes || '',
      registeredAt: Date.now()
    };
    await env.XSTORE_KV.put(`client:${phone}`, JSON.stringify(client));
    await addToIndex(env, phone);
    return json({ ok: true, client });
  }

  // Acciones protegidas (admin/planilla)
  const auth = await requireAuth(request, env);
  if (!auth.ok) return json({ error: 'unauthorized' }, 401);

  const body = await request.json();

  if (action === 'save') {
    const phone = norm(body.phone);
    if (phone.length < 8) return json({ error: 'Teléfono inválido' }, 400);
    if (!body.firstName || !body.lastName) return json({ error: 'Nombre y apellido obligatorios' }, 400);
    const existing = await env.XSTORE_KV.get(`client:${phone}`, 'json');
    const client = {
      phone,
      firstName: body.firstName,
      lastName: body.lastName,
      cedula: body.cedula || '',
      notes: body.notes || '',
      registeredAt: existing?.registeredAt || Date.now(),
      updatedAt: Date.now()
    };
    await env.XSTORE_KV.put(`client:${phone}`, JSON.stringify(client));
    await addToIndex(env, phone);
    return json({ ok: true, client });
  }

  if (action === 'delete') {
    const phone = norm(body.phone);
    await env.XSTORE_KV.delete(`client:${phone}`);
    await removeFromIndex(env, phone);
    return json({ ok: true });
  }

  if (action === 'change-phone') {
    const oldPhone = norm(body.oldPhone);
    const newPhone = norm(body.newPhone);
    if (!oldPhone || !newPhone) return json({ error: 'Teléfonos inválidos' }, 400);
    if (oldPhone === newPhone) return json({ error: 'Es el mismo número' }, 400);
    const client = await env.XSTORE_KV.get(`client:${oldPhone}`, 'json');
    if (!client) return json({ error: 'Cliente no encontrado' }, 404);
    if (await env.XSTORE_KV.get(`client:${newPhone}`, 'json')) return json({ error: 'El nuevo número ya existe' }, 409);

    const updated = { ...client, phone: newPhone, updatedAt: Date.now() };
    await env.XSTORE_KV.put(`client:${newPhone}`, JSON.stringify(updated));
    await env.XSTORE_KV.delete(`client:${oldPhone}`);
    await removeFromIndex(env, oldPhone);
    await addToIndex(env, newPhone);

    // Actualizar pedidos que tenían el teléfono viejo
    const orderIndex = (await env.XSTORE_KV.get(`orders:${oldPhone}`, 'json')) || [];
    let ordersUpdated = 0;
    for (const orderId of orderIndex) {
      const o = await env.XSTORE_KV.get(`order:${orderId}`, 'json');
      if (o && o.phone === oldPhone) {
        o.phone = newPhone;
        await env.XSTORE_KV.put(`order:${orderId}`, JSON.stringify(o));
        ordersUpdated++;
      }
    }
    await env.XSTORE_KV.put(`orders:${newPhone}`, JSON.stringify(orderIndex));
    await env.XSTORE_KV.delete(`orders:${oldPhone}`);

    return json({ ok: true, client: updated, ordersUpdated });
  }

  return json({ error: 'invalid action' }, 400);
}

function norm(p) { return String(p || '').replace(/\D/g, ''); }

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }
  });
}

async function addToIndex(env, phone) {
  const index = (await env.XSTORE_KV.get('clients:index', 'json')) || [];
  if (!index.includes(phone)) {
    index.push(phone);
    await env.XSTORE_KV.put('clients:index', JSON.stringify(index));
  }
}
async function removeFromIndex(env, phone) {
  const index = (await env.XSTORE_KV.get('clients:index', 'json')) || [];
  const next = index.filter(p => p !== phone);
  await env.XSTORE_KV.put('clients:index', JSON.stringify(next));
}
async function requireAuth(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/xstore_session=([^;]+)/);
  if (!match) return { ok: false };
  const sess = await env.XSTORE_KV.get(`session:${match[1]}`, 'json');
  if (!sess || (sess.exp && Date.now() > sess.exp)) return { ok: false };
  return { ok: true, username: sess.username };
}

// functions/api/orders.js
import {
  jsonOut, readJSON, writeJSON, readInput,
  normalizePhone, isAdmin, getAllOrders, saveOrder, deleteOrder
} from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';
  const method = request.method;

  if (method === 'OPTIONS') return jsonOut({}, 204);

  // ---- PÚBLICO: crear pedido ----
  if (method === 'POST' && action === 'create') {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rlKey = `rl:${ip}`;
    const rl = await readJSON(env, rlKey, []);
    const now = Date.now();
    const recent = rl.filter(t => now - t < 3600e3);
    if (recent.length >= 8) return jsonOut({ error: 'Demasiados pedidos seguidos. Intenta más tarde.' }, 429);
    recent.push(now);
    await writeJSON(env, rlKey, recent);

    const in_ = await readInput(request);
    const phone = normalizePhone(in_.phone || '');
    if (phone.length < 8) return jsonOut({ error: 'Teléfono inválido' }, 400);

    const clients = await readJSON(env, 'clients', {});
    if (!clients[phone]) return jsonOut({ error: 'Cliente no registrado' }, 403);
    const client = clients[phone];

    const gameKey   = String(in_.gameKey || '');
    const gameTitle = String(in_.gameTitle || '');
    const playerId  = String(in_.playerId || '').trim();
    const serverId  = String(in_.serverId || '').trim();
    const packages  = in_.packages || [];
    const payMethod = String(in_.paymentMethod || '');
    const reference = String(in_.reference || '').trim();
    const bank      = String(in_.bank || '').trim();
    const capture   = String(in_.capture || '');
    const totalUSDT = Number(in_.totalUSDT || 0);
    const totalLocal = Number(in_.totalLocal || 0);
    const currency  = String(in_.currencyCode || '');

    if (!gameKey || !gameTitle) return jsonOut({ error: 'Juego inválido' }, 400);
    if (!Array.isArray(packages) || packages.length === 0) return jsonOut({ error: 'Sin paquetes' }, 400);
    if (!payMethod) return jsonOut({ error: 'Método de pago requerido' }, 400);
    if (reference.length < 4) return jsonOut({ error: 'Referencia inválida' }, 400);
    if (!capture) return jsonOut({ error: 'Captura obligatoria' }, 400);
    if (capture.length > 2.5e6) return jsonOut({ error: 'Captura muy pesada' }, 413);

    const id = 'ord-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

    let captureKey = '';
    if (capture.startsWith('data:')) {
      const comma = capture.indexOf(',');
      const b64 = capture.slice(comma + 1);
      const m = capture.match(/^data:image\/(\w+);/);
      const ext = m && m[1] !== 'jpeg' ? m[1] : 'jpg';
      const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      captureKey = `captures/${id}.${ext}`;
      await env.XSTORE_R2.put(captureKey, buf, {
        httpMetadata: { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` },
      });
    }

    const cleanPkgs = packages.map(p => ({
      id: String(p.id || ''),
      name: String(p.name || ''),
      price: Number(p.price || 0),
      qty: Math.max(1, parseInt(p.qty || 1)),
    }));

    const order = {
      id, phone,
      clientName: `${client.firstName || ''} ${client.lastName || ''}`.trim(),
      gameKey, gameTitle, playerId, serverId,
      packages: cleanPkgs,
      paymentMethod: payMethod,
      paymentFields: in_.paymentFields || {},
      reference, bank,
      totalUSDT, totalLocal,
      currencyCode: currency,
      captureKey,
      status: 'pending',
      source: 'web',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveOrder(env, id, order);
    return jsonOut({ ok: true, id });
  }

  // ---- ADMIN: get ----
  if (method === 'GET' && action === 'get') {
    if (!await isAdmin(request, env)) return jsonOut({ error: 'No autorizado' }, 401);
    const id = url.searchParams.get('id') || '';
    if (!id) return jsonOut({ error: 'ID requerido' }, 400);
    const order = await readJSON(env, `order:${id}`, null);
    if (order) return jsonOut({ order });
    const orders = await readJSON(env, 'orders', {});
    if (!orders[id]) return jsonOut({ error: 'Pedido no existe' }, 404);
    return jsonOut({ order: orders[id] });
  }

  // ---- ADMIN: list ----
  if (method === 'GET' && action === 'list') {
    if (!await isAdmin(request, env)) return jsonOut({ error: 'No autorizado' }, 401);
    const orders = await getAllOrders(env);
    const status = url.searchParams.get('status') || '';
    let list = Object.values(orders);
    if (status) list = list.filter(o => o.status === status);
    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return jsonOut({ orders: list });
  }

  // ---- ADMIN: count-pending ----
  if (method === 'GET' && action === 'count-pending') {
    if (!await isAdmin(request, env)) return jsonOut({ error: 'No autorizado' }, 401);
    const orders = await getAllOrders(env);
    const n = Object.values(orders).filter(o => o.status === 'pending').length;
    return jsonOut({ count: n });
  }

  // ---- ADMIN: set-status ----
  if (method === 'POST' && action === 'set-status') {
    if (!await isAdmin(request, env)) return jsonOut({ error: 'No autorizado' }, 401);
    const in_ = await readInput(request);
    const id = String(in_.id || '');
    const status = String(in_.status || '');
    const valid = ['pending', 'verified', 'completed', 'rejected'];
    if (!valid.includes(status)) return jsonOut({ error: 'Estado inválido' }, 400);

    const order = await readJSON(env, `order:${id}`, null);
    if (order) {
      order.status = status;
      order.updatedAt = new Date().toISOString();
      await saveOrder(env, id, order);
      return jsonOut({ ok: true, order });
    }
    const orders = await readJSON(env, 'orders', {});
    if (!orders[id]) return jsonOut({ error: 'Pedido no existe' }, 404);
    orders[id].status = status;
    orders[id].updatedAt = new Date().toISOString();
    await writeJSON(env, 'orders', orders);
    return jsonOut({ ok: true, order: orders[id] });
  }

  // ---- ADMIN: delete ----
  if (method === 'POST' && action === 'delete') {
    if (!await isAdmin(request, env)) return jsonOut({ error: 'No autorizado' }, 401);
    const in_ = await readInput(request);
    const id = String(in_.id || '');
    if (!id) return jsonOut({ error: 'ID requerido' }, 400);

    const order = await readJSON(env, `order:${id}`, null);
    if (order && order.captureKey) {
      try { await env.XSTORE_R2.delete(order.captureKey); } catch {}
    }
    await deleteOrder(env, id);
    return jsonOut({ ok: true });
  }

  return jsonOut({ error: 'Acción no válida' }, 400);
}
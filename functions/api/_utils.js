export function jsonOut(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}

export async function readJSON(env, key, fallback = {}) {
  const raw = await env.XSTORE_KV.get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export async function writeJSON(env, key, data) {
  await env.XSTORE_KV.put(key, JSON.stringify(data));
}

export async function readInput(request) {
  try { return await request.json(); } catch { return {}; }
}

export function normalizePhone(p) {
  return String(p || '').replace(/\D+/g, '');
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function createToken(env, username) {
  const payload = btoa(JSON.stringify({ u: username, exp: Date.now() + 7 * 864e5 }));
  const sig = await hmac(env.ADMIN_SECRET, payload);
  return `${payload}.${sig}`;
}

export async function verifyToken(env, token) {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = await hmac(env.ADMIN_SECRET, payload);
  if (expected !== sig) return null;
  try {
    const data = JSON.parse(atob(payload));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}

export function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export async function isAdmin(request, env) {
  const token = getCookie(request, 'xstore_admin');
  return await verifyToken(env, token);
}

export async function getAllOrders(env) {
  const idx = await env.XSTORE_KV.get('orders:index');
  if (idx) {
    const ids = JSON.parse(idx);
    const orders = {};
    for (const id of ids) {
      const o = await readJSON(env, `order:${id}`, null);
      if (o) orders[id] = o;
    }
    return orders;
  }
  return await readJSON(env, 'orders', {});
}

export async function saveOrder(env, id, order) {
  const idxRaw = await env.XSTORE_KV.get('orders:index');
  if (idxRaw) {
    const ids = JSON.parse(idxRaw);
    await writeJSON(env, `order:${id}`, order);
    if (!ids.includes(id)) {
      ids.push(id);
      await writeJSON(env, 'orders:index', ids);
    }
  } else {
    const orders = await readJSON(env, 'orders', {});
    orders[id] = order;
    await writeJSON(env, 'orders', orders);
  }
}

export async function deleteOrder(env, id) {
  const idxRaw = await env.XSTORE_KV.get('orders:index');
  if (idxRaw) {
    await env.XSTORE_KV.delete(`order:${id}`);
    const ids = JSON.parse(idxRaw).filter(x => x !== id);
    await writeJSON(env, 'orders:index', ids);
  } else {
    const orders = await readJSON(env, 'orders', {});
    delete orders[id];
    await writeJSON(env, 'orders', orders);
  }
}
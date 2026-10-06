
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'check') {
    const admin = await env.XSTORE_KV.get('auth:admin', 'json');
    const session = await getSession(request, env);
    return json({ hasAdmin: !!admin, loggedIn: !!session });
  }

  if (action === 'guard') {
    const session = await getSession(request, env);
    return json({ ok: !!session });
  }

  return json({ error: 'invalid action' }, 400);
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'register') {
    const existing = await env.XSTORE_KV.get('auth:admin', 'json');
    if (existing) return json({ error: 'Ya existe un administrador' }, 409);
    const { username, password } = await request.json();
    if (!username || !password || password.length < 6) {
      return json({ error: 'Usuario y contraseña (mín 6) obligatorios' }, 400);
    }
    const { hash, salt } = await hashPassword(password);
    const admin = { username, passwordHash: hash, salt, createdAt: Date.now() };
    await env.XSTORE_KV.put('auth:admin', JSON.stringify(admin));
    const token = await createSession(username, env);
    return withSessionCookie({ ok: true }, token);
  }

  if (action === 'login') {
    const admin = await env.XSTORE_KV.get('auth:admin', 'json');
    if (!admin) return json({ error: 'No hay admin registrado' }, 404);
    const { username, password } = await request.json();
    if (username !== admin.username) return json({ error: 'Credenciales inválidas' }, 401);
    const ok = await verifyPassword(password, admin.salt, admin.passwordHash);
    if (!ok) return json({ error: 'Credenciales inválidas' }, 401);
    const token = await createSession(username, env);
    return withSessionCookie({ ok: true }, token);
  }

  if (action === 'logout') {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(/xstore_session=([^;]+)/);
    if (match) await env.XSTORE_KV.delete(`session:${match[1]}`);
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.append('Set-Cookie', 'xstore_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  return json({ error: 'invalid action' }, 400);
}

// ---- Helpers ----
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = [...salt].map(b => b.toString(16).padStart(2, '0')).join('');
  const hash = await pbkdf2(password, saltHex);
  return { hash, salt: saltHex };
}

async function verifyPassword(password, saltHex, expectedHash) {
  const hash = await pbkdf2(password, saltHex);
  return timingSafeEqual(hash, expectedHash);
}

async function pbkdf2(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function createSession(username, env) {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  await env.XSTORE_KV.put(
    `session:${token}`,
    JSON.stringify({ username, exp }),
    { expirationTtl: 7 * 24 * 60 * 60 }
  );
  return token;
}

function withSessionCookie(data, token) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append(
    'Set-Cookie',
    `xstore_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
  );
  return new Response(JSON.stringify(data), { status: 200, headers });
}

async function getSession(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/xstore_session=([^;]+)/);
  if (!match) return null;
  const sess = await env.XSTORE_KV.get(`session:${match[1]}`, 'json');
  if (!sess || (sess.exp && Date.now() > sess.exp)) return null;
  return sess;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

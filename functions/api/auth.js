// functions/api/auth.js
import {
  jsonOut, readJSON, writeJSON, readInput,
  createToken, isAdmin
} from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';
  const method = request.method;

  if (method === 'OPTIONS') return jsonOut({}, 204);

  // ---- CHECK ----
  if (action === 'check') {
    const auth = await readJSON(env, 'auth', {});
    const admin = await isAdmin(request, env);
    return jsonOut({
      loggedIn: !!admin,
      hasAdmin: !!auth.username && !auth.requiresRehash,
    });
  }

  // ---- REGISTER ----
  if (action === 'register' && method === 'POST') {
    const auth = await readJSON(env, 'auth', {});
    if (auth.username && !auth.requiresRehash) {
      return jsonOut({ error: 'Ya existe un administrador' }, 400);
    }
    const in_ = await readInput(request);
    const u = String(in_.username || auth.username || '').trim();
    const p = String(in_.password || '');
    if (!u || p.length < 6) return jsonOut({ error: 'Usuario o contraseña inválidos (mín. 6)' }, 400);

    const salt = crypto.getRandomValues(new Uint8Array(16)).join('');
    const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + p));
    const hash = btoa(String.fromCharCode(...new Uint8Array(hashBuf)));

    await writeJSON(env, 'auth', {
      username: u, salt, hash, createdAt: new Date().toISOString(),
    });

    const token = await createToken(env, u);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `xstore_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7*86400}`,
      },
    });
  }

  // ---- LOGIN ----
  if (action === 'login' && method === 'POST') {
    const auth = await readJSON(env, 'auth', {});
    if (!auth.username) return jsonOut({ error: 'No hay administrador registrado' }, 400);
    if (auth.requiresRehash) {
      return jsonOut({ error: 'Debes crear una nueva contraseña (migración)', needsSetup: true }, 428);
    }
    const in_ = await readInput(request);
    const u = String(in_.username || '').trim();
    const p = String(in_.password || '');
    const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(auth.salt + p));
    const hash = btoa(String.fromCharCode(...new Uint8Array(hashBuf)));
    if (u !== auth.username || hash !== auth.hash) {
      return jsonOut({ error: 'Credenciales incorrectas' }, 401);
    }
    const token = await createToken(env, u);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `xstore_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7*86400}`,
      },
    });
  }

  // ---- LOGOUT ----
  if (action === 'logout') {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': 'xstore_admin=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
      },
    });
  }

  // ---- GUARD ----
  if (action === 'guard') {
    const admin = await isAdmin(request, env);
    if (!admin) return jsonOut({ error: 'No autorizado' }, 401);
    return jsonOut({ ok: true, username: admin.u });
  }

  return jsonOut({ error: 'Acción no válida' }, 400);
}
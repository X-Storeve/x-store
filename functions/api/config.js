// functions/api/config.js
import { jsonOut, readJSON, writeJSON, readInput, isAdmin } from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  if (method === 'OPTIONS') return jsonOut({}, 204);

  if (method === 'GET') {
    const cfg = await readJSON(env, 'config', {});
    delete cfg._internal;
    return jsonOut(cfg);
  }

  if (method === 'POST') {
    if (!await isAdmin(request, env)) return jsonOut({ error: 'No autorizado' }, 401);
    const in_ = await readInput(request);
    if (typeof in_ !== 'object' || Array.isArray(in_)) {
      return jsonOut({ error: 'JSON inválido' }, 400);
    }
    const current = await readJSON(env, 'config', {});
    const merged = { ...current, ...in_ };
    await writeJSON(env, 'config', merged);
    return jsonOut({ ok: true });
  }

  return jsonOut({ error: 'Método no permitido' }, 405);
}
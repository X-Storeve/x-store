// functions/api/lists.js
import { jsonOut, readJSON, writeJSON, readInput, isAdmin } from './_utils.js';

const DEFAULT_BANCOS = ['Mercantil','Banesco','Venezuela','Provincial','BNC','BBVA','BOD','Banplus','Bancamiga','Tesoro','Plaza','Efectivo'];
const DEFAULT_JUEGOS  = ['Free Fire','Mobile Legends','Roblox','Blood Strike','PUBG Mobile','Call of Duty','Clash Royale','Genshin Impact','Honkai Star Rail','Brawl Stars','Otro'];

async function ensureLists(env) {
  const lists = await readJSON(env, 'lists', {});
  let changed = false;
  if (!Array.isArray(lists.bancos) || !lists.bancos.length) { lists.bancos = DEFAULT_BANCOS; changed = true; }
  if (!Array.isArray(lists.juegos)  || !lists.juegos.length)  { lists.juegos = DEFAULT_JUEGOS;  changed = true; }
  if (changed) await writeJSON(env, 'lists', lists);
  return lists;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';
  const method = request.method;

  if (method === 'OPTIONS') return jsonOut({}, 204);

  if (method === 'GET') {
    return jsonOut(await ensureLists(env));
  }

  if (method === 'POST' && action === 'save') {
    if (!await isAdmin(request, env)) return jsonOut({ error: 'No autorizado' }, 401);
    const in_ = await readInput(request);
    const lists = await ensureLists(env);

    if (Array.isArray(in_.bancos)) {
      const clean = [];
      for (const b of in_.bancos) {
        const s = String(b).trim();
        if (s && !clean.includes(s)) clean.push(s);
      }
      lists.bancos = clean;
    }
    if (Array.isArray(in_.juegos)) {
      const clean = [];
      for (const j of in_.juegos) {
        const s = String(j).trim();
        if (s && !clean.includes(s)) clean.push(s);
      }
      lists.juegos = clean;
    }
    await writeJSON(env, 'lists', lists);
    return jsonOut({ ok: true, lists });
  }

  return jsonOut({ error: 'Acción no válida' }, 400);
}
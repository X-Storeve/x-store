// functions/api/clients.js
import {
  jsonOut, readJSON, writeJSON, readInput,
  normalizePhone, isAdmin
} from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';
  const method = request.method;

  if (method === 'OPTIONS') return jsonOut({}, 204);

  // ---- PÚBLICO: lookup ----
  if (method === 'GET' && action === 'lookup') {
    const phone = normalizePhone(url.searchParams.get('phone') || '');
    if (phone.length < 8) return jsonOut({ found: false });
    const clients = await readJSON(env, 'clients', {});
    if (!clients[phone]) return jsonOut({ found: false });
    const c = clients[phone];
    return jsonOut({
      found: true,
      client: {
        phone: c.phone || phone,
        firstName: c.firstName || '',
        lastName: c.lastName || '',
      },
    });
  }

  // ---- ADMIN: list ----
  if (method === 'GET' && action === 'list') {
    if (!await isAdmin(request, env)) return jsonOut({ error: 'No autorizado' }, 401);
    const clients = await readJSON(env, 'clients', {});
    return jsonOut({ clients: Object.values(clients) });
  }

  // ---- ADMIN: save ----
  if (method === 'POST' && action === 'save') {
    if (!await isAdmin(request, env)) return jsonOut({ error: 'No autorizado' }, 401);
    const in_ = await readInput(request);
    const phone = normalizePhone(in_.phone || '');
    const first = String(in_.firstName || '').trim();
    const last  = String(in_.lastName  || '').trim();
    const ci    = String(in_.cedula    || '').trim();
    const notes = String(in_.notes     || '').trim();
    if (phone.length < 8) return jsonOut({ error: 'Teléfono inválido' }, 400);
    if (!first || !last) return jsonOut({ error: 'Nombre y apellido obligatorios' }, 400);

    const clients = await readJSON(env, 'clients', {});
    const now = new Date().toISOString();
    const existing = clients[phone];
    clients[phone] = {
      phone, firstName: first, lastName: last, cedula: ci, notes,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    await writeJSON(env, 'clients', clients);
    return jsonOut({ ok: true, client: clients[phone] });
  }

  // ---- ADMIN: change-phone ----
  if (method === 'POST' && action === 'change-phone') {
    if (!await isAdmin(request, env)) return jsonOut({ error: 'No autorizado' }, 401);
    const in_ = await readInput(request);
    const oldPhone = normalizePhone(in_.oldPhone || '');
    const newPhone = normalizePhone(in_.newPhone || '');
    if (oldPhone.length < 8 || newPhone.length < 8) return jsonOut({ error: 'Teléfonos inválidos' }, 400);
    if (oldPhone === newPhone) return jsonOut({ error: 'Es el mismo número' }, 400);

    const clients = await readJSON(env, 'clients', {});
    if (!clients[oldPhone]) return jsonOut({ error: 'Cliente no existe' }, 404);
    if (clients[newPhone]) return jsonOut({ error: 'Ese teléfono ya existe' }, 409);

    const client = { ...clients[oldPhone], phone: newPhone, updatedAt: new Date().toISOString() };
    clients[newPhone] = client;
    delete clients[oldPhone];
    await writeJSON(env, 'clients', clients);

    const orders = await readJSON(env, 'orders', {});
    let count = 0;
    for (const id of Object.keys(orders)) {
      if (orders[id].phone === oldPhone) {
        orders[id].phone = newPhone;
        orders[id].updatedAt = new Date().toISOString();
        count++;
      }
    }
    await writeJSON(env, 'orders', orders);
    return jsonOut({ ok: true, ordersUpdated: count, client });
  }

  // ---- ADMIN: delete ----
  if (method === 'POST' && action === 'delete') {
    if (!await isAdmin(request, env)) return jsonOut({ error: 'No autorizado' }, 401);
    const in_ = await readInput(request);
    const phone = normalizePhone(in_.phone || '');
    if (!phone) return jsonOut({ error: 'Teléfono requerido' }, 400);
    const clients = await readJSON(env, 'clients', {});
    if (!clients[phone]) return jsonOut({ error: 'No existe' }, 404);
    delete clients[phone];
    await writeJSON(env, 'clients', clients);
    return jsonOut({ ok: true });
  }

  return jsonOut({ error: 'Acción no válida' }, 400);
}
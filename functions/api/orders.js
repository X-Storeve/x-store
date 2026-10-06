export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const id = crypto.randomUUID();
    const now = Date.now();
    const order = {
      id, createdAt: now, status: 'pending',
      phone: body.phone, gameKey: body.gameKey, gameTitle: body.gameTitle,
      playerId: body.playerId, serverId: body.serverId,
      packages: body.packages, paymentMethod: body.paymentMethod,
      reference: body.reference, bank: body.bank,
      totalUSDT: body.totalUSDT, totalLocal: body.totalLocal,
      currencyCode: body.currencyCode, captureUrl: null
    };
    if (body.capture && body.capture.startsWith('data:image')) {
      const base64 = body.capture.split(',')[1];
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const key = `captures/${id}.jpg`;
      await env.XSTORE_R2.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
      order.captureUrl = `/api/captures/${id}`;
    }
    await env.XSTORE_KV.put(`order:${id}`, JSON.stringify(order));
    const listRaw = await env.XSTORE_KV.get(`orders:${body.phone}`, 'json');
    const list = Array.isArray(listRaw) ? listRaw : [];
    list.unshift(id);
    await env.XSTORE_KV.put(`orders:${body.phone}`, JSON.stringify(list.slice(0, 50)));
    return Response.json({ ok: true, id, captureUrl: order.captureUrl });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'missing id' }, { status: 400 });
  const order = await env.XSTORE_KV.get(`order:${id}`, 'json');
  if (!order) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json({ ok: true, order });
}

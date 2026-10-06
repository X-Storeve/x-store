export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  if (action === 'lookup') {
    const phone = (url.searchParams.get('phone') || '').replace(/\D/g, '');
    if (!phone) return Response.json({ found: false }, { status: 400 });
    const c = await env.XSTORE_KV.get(`client:${phone}`, 'json');
    return Response.json({ found: !!c, client: c || null }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  }
  return Response.json({ error: 'invalid action' }, { status: 400 });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const phone = (body.phone || '').replace(/\D/g, '');
  if (phone.length < 8) return Response.json({ error: 'invalid phone' }, { status: 400 });
  const client = {
    phone,
    firstName: body.firstName || '',
    lastName: body.lastName || '',
    registeredAt: Date.now()
  };
  await env.XSTORE_KV.put(`client:${phone}`, JSON.stringify(client));
  return Response.json({ ok: true, client });
}

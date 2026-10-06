export async function onRequestPost({ request, env }) {
  const auth = request.headers.get('X-Admin-Token');
  if (!env.ADMIN_TOKEN || auth !== env.ADMIN_TOKEN) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await request.json();
  if (body.config) await env.XSTORE_KV.put('config', JSON.stringify(body.config));
  if (body.bancos) await env.XSTORE_KV.put('bancos', JSON.stringify(body.bancos));
  return Response.json({ ok: true });
}
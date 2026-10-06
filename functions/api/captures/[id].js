export async function onRequestGet({ params, env }) {
  const obj = await env.XSTORE_R2.get(`captures/${params.id}.jpg`);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400'
    }
  });
}

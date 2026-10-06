export async function onRequestGet({ env }) {
  const bancos = await env.XSTORE_KV.get('bancos', 'json');
  return Response.json(
    { bancos: bancos || [] },
    { headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } }
  );
}

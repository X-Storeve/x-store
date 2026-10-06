// functions/api/capture.js
// GET /api/capture?id=ord-123   → sirve la imagen desde R2
import { readJSON } from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) return new Response('Missing id', { status: 400 });

  let order = null;
  const idx = await readJSON(env, 'orders:index', null);
  if (idx) {
    order = await readJSON(env, `order:${id}`, null);
  } else {
    const orders = await readJSON(env, 'orders', {});
    order = orders[id];
  }

  if (!order || !order.captureKey) {
    return new Response('Capture not found', { status: 404 });
  }

  const obj = await env.XSTORE_R2.get(order.captureKey);
  if (!obj) return new Response('Object not found in R2', { status: 404 });

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
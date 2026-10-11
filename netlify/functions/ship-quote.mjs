/* GET /api/ship-quote?carrier=colissimo&country=FR → { carrier, leg, total } (prix du trajet et total A/R) */
import { quote, json } from './_lib.mjs';
export default async req => {
  const u = new URL(req.url);
  try { const { carrier, leg, total } = await quote(u.searchParams.get('carrier'), (u.searchParams.get('country') || 'FR').toUpperCase().slice(0, 2)); return json({ carrier, leg, total }); }
  catch (e) { return json({ error: e.message }, 400); }
};
export const config = { path: '/api/ship-quote' };

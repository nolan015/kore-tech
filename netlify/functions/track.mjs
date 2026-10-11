/* GET /api/track?id=KT-XXXXXXXX (ou numéro de suivi du colis) → état du ticket. Aucune donnée personnelle renvoyée. */
import { store, json, ID_RE } from './_lib.mjs';
export default async req => {
  const q = (new URL(req.url).searchParams.get('id') || '').trim().toUpperCase().slice(0, 40), s = store();
  const id = ID_RE.test(q) ? q : (q ? await s.get('trk:' + q) : null);
  const t = id && await s.get(id, { type: 'json' });
  if (!t || !t.paid) return json({ error: 'Introuvable' }, 404);
  return json({ id: t.id, device: t.device, step: t.step, history: t.history, carrier: t.carrier, outbound: t.outboundUrl, returnUrl: t.returnUrl, returnTracking: t.returnTracking });
};
export const config = { path: '/api/track' };

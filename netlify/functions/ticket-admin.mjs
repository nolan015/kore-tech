/* API d'administration des tickets (jeton Bearer ADMIN_TOKEN).
   GET  /api/ticket-admin                    → liste des tickets payés
   POST /api/ticket-admin {id, step}         → met à jour le statut (1 à 5) et prévient le client (étapes 2, 4, 5)
   Étape 5 : crée automatiquement le colis RETOUR (atelier → client, payé par le client au checkout) et enregistre le lien de suivi.
   Variante manuelle : POST {id, step:5, returnTracking, returnUrl}. */
import { timingSafeEqual } from 'node:crypto';
import { store, json, ID_RE, ATELIER, createParcel, mail, SITE } from './_lib.mjs';

const authorized = req => {
  const a = Buffer.from((req.headers.get('authorization') || '').replace(/^Bearer /, '')), b = Buffer.from(process.env.ADMIN_TOKEN || '');
  return b.length >= 24 && a.length === b.length && timingSafeEqual(a, b);
};
const MAILS = { 2: ['Votre appareil est arrivé à l\'atelier', 'Nous avons bien reçu votre appareil, le diagnostic et la réparation vont commencer.'], 4: ['Votre réparation est terminée', 'La réparation et les tests sont terminés. Votre appareil sera réexpédié très prochainement.'], 5: ['Votre appareil est réexpédié', 'Votre appareil est en route vers vous.'] };

export default async req => {
  if (!authorized(req)) return json({ error: 'Non autorisé' }, 401);
  const s = store();
  if (req.method === 'GET') {
    const out = [];
    for (const b of (await s.list()).blobs) { if (!ID_RE.test(b.key)) continue; const t = await s.get(b.key, { type: 'json' }); if (t?.paid) out.push(t); }
    return json(out.sort((a, b) => b.created - a.created));
  }
  const { id, step, returnTracking, returnUrl } = await req.json().catch(() => ({}));
  const t = ID_RE.test(id || '') && await s.get(id, { type: 'json' });
  if (!t || !t.paid || !Number.isInteger(step) || step < 1 || step > 5) return json({ error: 'Requête invalide' }, 400);
  try {
    if (step === 5 && !t.returnUrl) {
      if (/^https:\/\//.test(returnUrl || '')) Object.assign(t, { returnUrl, returnTracking: String(returnTracking || '').slice(0, 40) });
      else { const p = await createParcel({ from: ATELIER(), to: t.customer, methodId: t.methodId, ref: id + '-R' }); Object.assign(t, { returnUrl: p.url, returnTracking: p.tracking, returnParcelId: p.id }); }
    }
    t.step = step; t.history.push({ step, t: Date.now() });
    await s.setJSON(id, t);
    if (MAILS[step]) mail({ to: t.customer.email, subject: `${MAILS[step][0]} – ${id}`, html: `<p>Bonjour ${t.customer.name},</p><p>${MAILS[step][1]}</p><p>Suivi : <a href="${SITE()}/#/suivi/${id}">${SITE()}/#/suivi/${id}</a>${step === 5 && t.returnUrl ? `<br>Colis retour : <a href="${t.returnUrl}">${t.returnTracking || 'suivre'}</a>` : ''}</p><p>Kore Tech</p>` }).catch(e => console.error('mail', e.message));
    return json(t);
  } catch (e) { console.error(e); return json({ error: e.message }, 500); }
};
export const config = { path: '/api/ticket-admin' };

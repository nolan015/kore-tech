/* POST /api/stripe-webhook (événement checkout.session.completed)
   Paiement confirmé → génération de l'étiquette ALLER (client → atelier) → e-mail au client avec l'étiquette en PDF.
   Aucune étiquette n'est créée avant le paiement : rien n'est avancé. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { store, json, ATELIER, createParcel, downloadLabel, mail, SITE } from './_lib.mjs';

function verify(raw, header, secret) {
  const p = Object.fromEntries((header || '').split(',').map(x => x.split('=')));
  const exp = Buffer.from(createHmac('sha256', secret).update(`${p.t}.${raw}`).digest('hex')), got = Buffer.from(p.v1 || '');
  return exp.length === got.length && timingSafeEqual(exp, got) && Math.abs(Date.now() / 1000 - p.t) < 300;
}

export default async req => {
  const raw = await req.text();
  if (!verify(raw, req.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET)) return json({ error: 'Signature invalide' }, 400);
  const ev = JSON.parse(raw);
  if (ev.type !== 'checkout.session.completed' || ev.data.object.payment_status !== 'paid') return json({ ok: true });
  const s = store(), id = ev.data.object.metadata?.ticket, t = id && await s.get(id, { type: 'json' });
  if (!t) return json({ error: 'Ticket inconnu' }, 404);
  if (t.labelSent) return json({ ok: true }); /* idempotence : Stripe peut renvoyer l'événement */
  try {
    const parcel = await createParcel({ from: t.customer, to: ATELIER(), methodId: t.methodId, ref: id });
    const pdf = await downloadLabel(parcel.labelUrl);
    Object.assign(t, { paid: true, step: 1, outboundTracking: parcel.tracking, outboundUrl: parcel.url, outboundParcelId: parcel.id, labelSent: true, history: [{ step: 1, t: Date.now() }] });
    await s.setJSON(id, t);
    if (parcel.tracking) await s.set('trk:' + String(parcel.tracking).toUpperCase(), id);
    await mail({
      to: t.customer.email, subject: `Votre étiquette d'envoi – commande ${id}`,
      html: `<p>Bonjour ${t.customer.name},</p><p>Merci pour votre paiement. Vous trouverez votre <b>étiquette d'envoi</b> en pièce jointe : imprimez-la, collez-la sur le colis et déposez-le chez le transporteur (${t.carrier}).</p>
      <p>Consignes d'emballage : <a href="${SITE()}/#/consignes">${SITE()}/#/consignes</a></p>
      <p>Suivez votre réparation avec le numéro <b>${id}</b> : <a href="${SITE()}/#/suivi/${id}">${SITE()}/#/suivi/${id}</a></p><p>Kore Tech</p>`,
      attachments: [{ filename: `etiquette-${id}.pdf`, content: pdf }]
    });
    return json({ ok: true });
  } catch (e) { console.error('webhook', e); return json({ error: 'Traitement échoué' }, 500); } /* 500 : Stripe réessaie automatiquement */
};
export const config = { path: '/api/stripe-webhook' };

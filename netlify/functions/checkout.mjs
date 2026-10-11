/* POST /api/checkout → crée le ticket + une session Stripe Checkout (réparation + port A/R) et renvoie { url }.
   Le port est recalculé ICI : on ne fait jamais confiance au prix envoyé par le navigateur. */
import { store, quote, json, newId, SITE } from './_lib.mjs';

const cents = n => Math.round(n * 100);
const clean = (s, n = 120) => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, n);

export default async req => {
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);
  try {
    const b = await req.json(), c = b.customer || {};
    const customer = { name: clean(c.name), email: clean(c.email), phone: clean(c.phone, 20), address: clean(c.address), postal: clean(c.postal, 5), city: clean(c.city, 60), country: 'FR' };
    if (!customer.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email) || !/^\d{5}$/.test(customer.postal) || !customer.address || !customer.city) return json({ error: 'Coordonnées incomplètes' }, 400);
    /* TODO production : recalculer le prix de la réparation côté serveur à partir de votre catalogue (modèle + panne + qualité). */
    const amount = Number(b.amount); if (!(amount > 0 && amount <= 5000)) return json({ error: 'Montant invalide' }, 400);
    const ship = await quote(b.carrier, 'FR');
    const id = newId(), item = clean(b.item, 100) || 'Réparation';
    await store().setJSON(id, { id, paid: false, step: 1, created: Date.now(), device: clean(b.det, 60) || item, item, customer, carrier: b.carrier, methodId: ship.methodId, amountRepair: amount, shipTotal: ship.total, history: [] });

    const p = new URLSearchParams({
      mode: 'payment', success_url: `${SITE()}/#/suivi/${id}`, cancel_url: `${SITE()}/#/`, customer_email: customer.email, client_reference_id: id,
      'metadata[ticket]': id, 'payment_intent_data[metadata][ticket]': id,
      'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'eur', 'line_items[0][price_data][unit_amount]': String(cents(amount)), 'line_items[0][price_data][product_data][name]': item,
      'line_items[1][quantity]': '1', 'line_items[1][price_data][currency]': 'eur', 'line_items[1][price_data][unit_amount]': String(cents(ship.total)), 'line_items[1][price_data][product_data][name]': `Frais de port aller-retour (${b.carrier})`
    });
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY, 'content-type': 'application/x-www-form-urlencoded' }, body: p });
    const s = await r.json(); if (!r.ok) throw new Error(s.error?.message || 'Stripe');
    return json({ url: s.url, id });
  } catch (e) { console.error(e); return json({ error: 'Paiement indisponible, réessayez.' }, 500); }
};
export const config = { path: '/api/checkout' };

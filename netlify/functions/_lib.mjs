/* Utilitaires partagés : stockage des tickets, Sendcloud, e-mail, devis de transport. */
import { getStore } from '@netlify/blobs';
import { randomBytes } from 'node:crypto';

export const store = () => getStore('tickets');
export const SITE = () => process.env.SITE_URL || process.env.URL;
export const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
export const CARRIERS = { colissimo: 'Colissimo', mondial_relay: 'Mondial Relay', chronopost: 'Chronopost' };
/* Identifiant de commande non devinable : KT- + 8 caractères (alphabet sans I, L, O, 0, 1) */
export const ID_RE = /^KT-[A-HJKMNP-Z2-9]{8}$/;
export const newId = () => 'KT-' + [...randomBytes(8)].map(b => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('');

/* Adresse de l'atelier (destinataire de l'étiquette aller, expéditeur du retour) */
export const ATELIER = () => ({ name: process.env.ATELIER_NAME, address: process.env.ATELIER_ADDRESS, postal: process.env.ATELIER_POSTAL, city: process.env.ATELIER_CITY, country: 'FR', phone: process.env.ATELIER_PHONE, email: process.env.ATELIER_EMAIL });

/* ---- Sendcloud (API v2, authentification Basic clé publique : clé secrète) ---- */
const auth = () => 'Basic ' + Buffer.from(`${process.env.SENDCLOUD_PUBLIC}:${process.env.SENDCLOUD_SECRET}`).toString('base64');
export const fetchAuth = async (url, opt = {}) => {
  const r = await fetch(url, { ...opt, headers: { authorization: auth(), 'content-type': 'application/json', ...opt.headers } });
  if (!r.ok) throw new Error(`Sendcloud ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r;
};
const sc = (path, opt) => fetchAuth('https://panel.sendcloud.sc/api/v2' + path, opt);

/* Tarifs de secours (€ TTC par trajet) si Sendcloud ne répond pas ou n'est pas encore configuré : à ajuster */
const FALLBACK = { colissimo: 8.5, mondial_relay: 5.5, chronopost: 14.5 };

/* Devis aller-retour : (tarif trajet × 2) × (1 + SHIP_MARKUP) + SHIP_FIXED.
   Le markup / frais fixes couvrent notamment les frais de paiement : le port reste 100 % à la charge du client. */
export async function quote(carrier, country = 'FR', weight = 1) {
  if (!CARRIERS[carrier]) throw new Error('Transporteur inconnu');
  let leg = FALLBACK[carrier], methodId = null;
  if (process.env.SENDCLOUD_PUBLIC) {
    try {
      const q = `/shipping_methods?to_country=${country}` + (process.env.SC_SENDER_ID ? `&sender_address=${process.env.SC_SENDER_ID}` : '');
      const flt = (process.env['METHOD_' + carrier.toUpperCase()] || '').toLowerCase(); /* ex. METHOD_MONDIAL_RELAY="point relais" */
      const best = ((await (await sc(q)).json()).shipping_methods || [])
        .filter(m => m.carrier === carrier && +m.min_weight <= weight && weight <= +m.max_weight && m.name.toLowerCase().includes(flt))
        .map(m => ({ id: m.id, price: +(m.countries || []).find(c => c.iso_2 === country)?.price })).filter(m => m.price > 0)
        .sort((a, b) => a.price - b.price)[0];
      if (best) { leg = best.price; methodId = best.id; }
    } catch (e) { console.error('quote', e.message); }
  }
  const total = Math.round((leg * 2 * (1 + +(process.env.SHIP_MARKUP ?? .03)) + +(process.env.SHIP_FIXED ?? .3)) * 100) / 100;
  return { carrier, leg, total, methodId };
}

/* Crée un colis Sendcloud et son étiquette PDF (format A6). 
   NB : les champs from_* (expéditeur) doivent être confirmés dans la doc Sendcloud ; alternative : API Returns. */
export async function createParcel({ from, to, methodId, ref, weight = 1 }) {
  if (!methodId) throw new Error('Méthode d\'expédition Sendcloud introuvable (vérifiez la configuration des transporteurs)');
  const parcel = {
    name: to.name, address: to.address, city: to.city, postal_code: to.postal, country: to.country || 'FR', telephone: to.phone || '', email: to.email || '',
    from_name: from.name, from_address_1: from.address, from_city: from.city, from_postal_code: from.postal, from_country: from.country || 'FR', from_telephone: from.phone || '', from_email: from.email || '',
    weight: String(weight), order_number: ref, request_label: true, shipment: { id: methodId }
  };
  const p = (await (await sc('/parcels', { method: 'POST', body: JSON.stringify({ parcel }) })).json()).parcel;
  return { id: p.id, tracking: p.tracking_number, url: p.tracking_url, labelUrl: p.label?.label_printer };
}
export const downloadLabel = async url => Buffer.from(await (await fetchAuth(url)).arrayBuffer()).toString('base64');

/* ---- E-mail (Resend) ---- */
export async function mail({ to, subject, html, attachments }) {
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ from: process.env.MAIL_FROM, to, subject, html, attachments }) });
  if (!r.ok) throw new Error('Resend ' + r.status);
}

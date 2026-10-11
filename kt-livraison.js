/*! Kore Tech – Module Livraison A/R, Suivi de réparation, Consignes d'envoi.
   Autonome : aucune dépendance, n'altère ni le DOM ni le routeur du site (modales dans #ktl-root).
   Intégration : <script src="/kt-livraison.js" defer></script> avant </body>.
   API publique : KTLivraison.openCheckout({item,amount,det}) · openTracking(id) · openGuide()
   Routes : #/suivi  #/suivi/KT-XXXXXXXX  #/consignes */
(() => {
  const API = (window.KT_API_BASE || '') + '/api';
  const $ = (s, r = document) => r.querySelector(s);
  const eur = n => Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => (/^https:\/\//.test(u || '') ? esc(u) : '');
  const CARRIERS = {
    mondial_relay: { n: 'Mondial Relay', d: 'Dépôt en point relais · 3 à 5 jours' },
    colissimo: { n: 'Colissimo', d: 'Bureau de poste ou point Pickup · 2 à 3 jours' },
    chronopost: { n: 'Chronopost', d: 'Express · livraison le lendemain' }
  };
  const STEPS = ['Colis en attente d\'envoi par le client', 'Appareil reçu à l\'atelier', 'Réparation & tests en cours', 'Réparation terminée', 'Colis réexpédié au client'];

  /* ---------- Styles (préfixe ktl-, hérite des variables du site si présentes) ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .ktl-fab{position:fixed;left:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:40;border:0;cursor:pointer;background:var(--acc,#1F5BFF);color:#fff;font:700 14px Manrope,system-ui,sans-serif;padding:12px 18px;border-radius:99px;box-shadow:0 8px 24px -8px rgba(31,91,255,.6)}
  .ktl-bg{position:fixed;inset:0;background:rgba(5,10,25,.6);display:grid;place-items:center;padding:16px;z-index:70}
  .ktl-box{background:var(--surf,#fff);color:var(--ink,#0D1424);border:1px solid var(--line,#E1E4EB);border-radius:16px;padding:22px;width:100%;max-width:560px;max-height:92vh;overflow:auto;font:400 15px/1.5 Manrope,system-ui,sans-serif}
  .ktl-box h2{font:700 1.4rem 'Bricolage Grotesque',Manrope,sans-serif;margin:0 0 6px}.ktl-box p{margin:0}.ktl-mut{color:var(--mut,#5B6478)}
  .ktl-x{float:right;border:0;background:none;font-size:1.4rem;cursor:pointer;color:inherit;min-width:44px;min-height:44px}
  .ktl-box input[type=text],.ktl-box input[type=email],.ktl-box input[type=tel]{width:100%;min-height:44px;padding:10px 12px;border:1px solid var(--line,#E1E4EB);border-radius:10px;background:var(--bg,#fff);color:inherit;font:inherit;margin:4px 0 10px}
  .ktl-box label{font-weight:600;font-size:.85rem}.ktl-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .ktl-opt{display:flex;gap:10px;align-items:center;border:1px solid var(--line,#E1E4EB);border-radius:12px;padding:12px;margin:8px 0;cursor:pointer;font-weight:400}
  .ktl-opt:has(input:checked){border:2px solid var(--acc,#1F5BFF)}.ktl-opt b{display:block}.ktl-opt .p{margin-left:auto;font-weight:800;white-space:nowrap}
  .ktl-sum{border-top:1px solid var(--line,#E1E4EB);margin-top:12px;padding-top:10px}.ktl-sum div{display:flex;justify-content:space-between;padding:3px 0}.ktl-sum .t{font-weight:800;font-size:1.2rem}
  .ktl-btn{display:inline-flex;justify-content:center;align-items:center;gap:8px;min-height:46px;padding:0 20px;border-radius:11px;border:1px solid var(--line,#E1E4EB);background:var(--surf,#fff);color:inherit;font:700 15px inherit;cursor:pointer}
  .ktl-btn.p{background:var(--acc,#1F5BFF);border-color:var(--acc,#1F5BFF);color:#fff;width:100%;margin-top:12px}.ktl-btn:disabled{opacity:.5;cursor:wait}
  .ktl-link{background:none;border:0;padding:0;color:var(--acc,#1F5BFF);font:600 .85rem inherit;cursor:pointer;text-decoration:underline}
  .ktl-err{color:var(--bad,#D33);font-size:.88rem;margin-top:8px;min-height:1.2em}
  .ktl-tl{list-style:none;margin:18px 0 0;padding:0}.ktl-tl li{display:flex;gap:14px;position:relative;padding-bottom:20px}
  .ktl-tl li:not(:last-child):before{content:"";position:absolute;left:15px;top:32px;bottom:0;width:2px;background:var(--line,#E1E4EB)}.ktl-tl li.done:not(:last-child):before{background:var(--ok,#0E9F6E)}
  .ktl-tl .dot{flex:none;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-weight:800;background:var(--line,#E1E4EB);color:var(--mut,#5B6478)}
  .ktl-tl .done .dot{background:var(--ok,#0E9F6E);color:#fff}.ktl-tl .cur .dot{background:var(--acc,#1F5BFF);color:#fff;box-shadow:0 0 0 5px rgba(31,91,255,.2)}
  .ktl-tl small{display:block;color:var(--mut,#5B6478)}.ktl-tl a{color:var(--acc,#1F5BFF);font-weight:600}.ktl-tl li:not(.done):not(.cur) b{color:var(--mut,#5B6478)}
  .ktl-gd{display:grid;gap:12px;margin-top:14px}.ktl-gd>div{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line,#E1E4EB);border-radius:12px;padding:12px}.ktl-gd svg{flex:none;width:36px;height:36px;color:var(--acc,#1F5BFF);fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}`;
  document.head.append(css);

  /* ---------- Modale générique ---------- */
  let root, timer, lastFocus;
  const close = () => { clearInterval(timer); if (root) root.innerHTML = ''; if (/^#\/(suivi|consignes)/.test(location.hash)) history.replaceState(null, '', '#/'); lastFocus && lastFocus.focus && lastFocus.focus(); };
  function open(html) {
    if (!root) { root = document.createElement('div'); root.id = 'ktl-root'; document.body.append(root); }
    lastFocus = document.activeElement; clearInterval(timer);
    root.innerHTML = `<div class="ktl-bg"><div class="ktl-box" role="dialog" aria-modal="true"><button class="ktl-x" aria-label="Fermer">×</button>${html}</div></div>`;
    root.querySelector('.ktl-x').onclick = close;
    root.querySelector('.ktl-bg').onclick = e => { if (e.target.classList.contains('ktl-bg')) close(); };
    const f = root.querySelector('input,button.ktl-btn'); f && f.focus();
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && root && root.firstChild) close(); });

  /* ---------- 3. Consignes d'envoi ---------- */
  const ic = p => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  function openGuide() {
    open(`<h2>Consignes d'envoi</h2><p class="ktl-mut">Cinq minutes pour que votre téléphone arrive en parfait état.</p><div class="ktl-gd">
    <div>${ic('<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M9 6h6M12 18h.01"/>')}<p><b>1. Préparez l'appareil</b><br>Sauvegardez vos données. Désactivez « Localiser mon iPhone » ou le compte Google/Samsung, et retirez le code de verrouillage si possible. Retirez la carte SIM et la carte mémoire.</p></div>
    <div>${ic('<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>')}<p><b>2. Emballez solidement</b><br>Enveloppez le téléphone dans du film à bulles, puis placez-le dans une boîte rigide avec 3 cm de calage de chaque côté. N'envoyez ni chargeur ni coque. Une enveloppe souple n'est pas assez protectrice.</p></div>
    <div>${ic('<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/>')}<p><b>3. Imprimez l'étiquette</b><br>Elle vous est envoyée par e-mail après le paiement. Collez-la bien à plat sur le colis, en retirant les anciennes étiquettes. Pas d'imprimante : le transporteur peut l'imprimer avec le QR code.</p></div>
    <div>${ic('<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>')}<p><b>4. Déposez le colis</b><br>Au point relais, bureau de poste ou point Pickup indiqué dans l'e-mail. Gardez le reçu : il prouve le dépôt. Suivez ensuite la réparation avec votre numéro de commande.</p></div></div>
    <button class="ktl-btn p" id="ktl-ok">J'ai compris</button>`);
    $('#ktl-ok').onclick = close;
  }

  /* ---------- 2. Suivi de réparation ---------- */
  const tl = t => `<ol class="ktl-tl">${STEPS.map((s, i) => {
    const n = i + 1, st = (n < t.step || t.step === 5) ? 'done' : n === t.step ? 'cur' : '';
    const h = [...(t.history || [])].reverse().find(x => x.step === n);
    const link = n === 1 && safeUrl(t.outbound) ? `<a href="${safeUrl(t.outbound)}" target="_blank" rel="noopener">Suivre mon envoi</a>` : n === 5 && safeUrl(t.returnUrl) ? `<a href="${safeUrl(t.returnUrl)}" target="_blank" rel="noopener">Suivre mon colis retour${t.returnTracking ? ' (' + esc(t.returnTracking) + ')' : ''}</a>` : '';
    return `<li class="${st}"><span class="dot">${n <= t.step ? '✓' : n}</span><div><b>${s}</b>${h ? `<small>${new Date(h.t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</small>` : ''}${link}</div></li>`;
  }).join('')}</ol>`;
  async function lookup(id, quiet) {
    const out = $('#ktl-out'), err = $('#ktl-err'); if (!id) return;
    try {
      const r = await fetch(`${API}/track?id=${encodeURIComponent(id.trim())}`);
      if (!r.ok) throw new Error(r.status === 404 ? 'Aucune commande trouvée avec ce numéro.' : 'Service indisponible, réessayez.');
      const t = await r.json(); err.textContent = '';
      out.innerHTML = `<p style="margin-top:14px"><b>${esc(t.id)}</b>${t.device ? ' · ' + esc(t.device) : ''}</p>${tl(t)}<button class="ktl-link" id="ktl-g">Consignes d'envoi</button>`;
      $('#ktl-g').onclick = openGuide;
    } catch (e) { if (!quiet) { out.innerHTML = ''; err.textContent = e.message; } }
  }
  function openTracking(id = '') {
    open(`<h2>Suivre ma réparation</h2><p class="ktl-mut">Saisissez votre numéro de commande (KT-…) ou le numéro de suivi du colis.</p>
    <form id="ktl-f" style="display:flex;gap:8px;margin-top:12px"><input type="text" id="ktl-id" placeholder="KT-XXXXXXXX" value="${esc(id)}" aria-label="Numéro de commande" style="margin:0" autocomplete="off"><button class="ktl-btn" style="background:var(--acc,#1F5BFF);color:#fff;border-color:var(--acc,#1F5BFF)">Suivre</button></form>
    <p class="ktl-err" id="ktl-err" role="alert"></p><div id="ktl-out"></div>`);
    $('#ktl-f').onsubmit = e => { e.preventDefault(); lookup($('#ktl-id').value); };
    if (id) { lookup(id); timer = setInterval(() => lookup($('#ktl-id').value, true), 30000); }
  }

  /* ---------- 1. Checkout « Livraison A/R » ---------- */
  function openCheckout({ item = 'Réparation', amount = 0, det = '' } = {}) {
    const quotes = {}; let carrier = 'colissimo';
    open(`<h2>Réparation par correspondance</h2><p class="ktl-mut">Les frais de port aller et retour sont à votre charge et inclus dans le total. Votre étiquette d'envoi vous est envoyée par e-mail dès le paiement validé.</p>
    <form id="ktl-co" style="margin-top:12px" novalidate>
      <label>Nom complet<input type="text" name="name" autocomplete="name" required></label>
      <div class="ktl-row"><label>E-mail<input type="email" name="email" autocomplete="email" required></label><label>Téléphone<input type="tel" name="phone" autocomplete="tel" required></label></div>
      <label>Adresse (n° et rue)<input type="text" name="address" autocomplete="street-address" required></label>
      <div class="ktl-row"><label>Code postal<input type="text" name="postal" autocomplete="postal-code" inputmode="numeric" required></label><label>Ville<input type="text" name="city" autocomplete="address-level2" required></label></div>
      <p style="font-weight:600;margin-top:4px">Transporteur (aller + retour)</p>
      ${Object.entries(CARRIERS).map(([k, c]) => `<label class="ktl-opt"><input type="radio" name="carrier" value="${k}" ${k === carrier ? 'checked' : ''}><span><b>${c.n}</b><small class="ktl-mut">${c.d}</small></span><span class="p" data-q="${k}">…</span></label>`).join('')}
      <div class="ktl-sum"><div><span>${esc(item)}</span><span>${eur(amount)}</span></div><div><span>Frais de port A/R</span><span id="ktl-ship">…</span></div><div class="t"><span>Total à payer</span><span id="ktl-tot">…</span></div></div>
      <p class="ktl-err" id="ktl-err" role="alert"></p>
      <button class="ktl-btn p" id="ktl-pay" disabled>Payer et recevoir mon étiquette</button>
      <p style="text-align:center;margin-top:10px"><button type="button" class="ktl-link" id="ktl-g">Comment emballer et déposer mon téléphone ?</button></p></form>`);
    const upd = () => {
      carrier = $('input[name=carrier]:checked').value; const q = quotes[carrier];
      $('#ktl-ship').textContent = q ? eur(q) : '…'; $('#ktl-tot').textContent = q ? eur(amount + q) : '…'; $('#ktl-pay').disabled = !q;
    };
    document.querySelectorAll('input[name=carrier]').forEach(r => r.onchange = upd);
    $('#ktl-g').onclick = openGuide;
    /* Devis des 3 transporteurs : le serveur recalcule le prix à la commande (le prix affiché n'est qu'indicatif). */
    Object.keys(CARRIERS).forEach(k => fetch(`${API}/ship-quote?carrier=${k}&country=FR`).then(r => r.json()).then(j => { quotes[k] = j.total; $(`[data-q=${k}]`).textContent = eur(j.total); upd(); }).catch(() => { $(`[data-q=${k}]`).textContent = 'indisponible'; }));
    $('#ktl-co').onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target), c = Object.fromEntries(f), err = $('#ktl-err');
      if (!c.name.trim() || !c.address.trim() || !c.city.trim()) return err.textContent = 'Merci de compléter votre adresse.';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) return err.textContent = 'E-mail invalide.';
      if (!/^[+\d][\d\s.\-]{7,18}$/.test(c.phone)) return err.textContent = 'Téléphone invalide.';
      if (!/^\d{5}$/.test(c.postal)) return err.textContent = 'Code postal invalide (5 chiffres).';
      $('#ktl-pay').disabled = true; err.textContent = '';
      try {
        const r = await fetch(`${API}/checkout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item, amount, det, carrier: c.carrier, customer: { name: c.name, email: c.email, phone: c.phone, address: c.address, postal: c.postal, city: c.city, country: 'FR' } }) });
        const j = await r.json(); if (!r.ok || !j.url) throw new Error(j.error || 'Paiement indisponible');
        location.href = j.url;
      } catch (x) { err.textContent = x.message; $('#ktl-pay').disabled = false; }
    };
  }

  /* ---------- Intégration au site existant (sans modifier son code) ---------- */
  /* Le bouton « Commander par correspondance » de l'estimation ouvre ce checkout à la place du formulaire simple. */
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-act="book"][data-mail="1"]'); if (!b) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const p = $('.price'), card = p && p.closest('.card'), g = s => ((card && $(s, card)) || {}).textContent || '';
    const amount = parseFloat((p ? p.textContent : '').replace(/[^\d,]/g, '').replace(',', '.')) || 0;
    openCheckout({ item: (g('.pill').trim() + ' – ' + g('h3').trim()).replace(/^ – /, '') || 'Réparation', amount, det: g('.pill').trim() });
  }, true);
  const route = () => { const m = location.hash.match(/^#\/suivi(?:\/([A-Z0-9-]+))?/i); if (m) openTracking(m[1] || ''); else if (/^#\/consignes/.test(location.hash)) openGuide(); };
  addEventListener('hashchange', route);
  if (!document.currentScript || document.currentScript.dataset.fab !== 'off') {
    const fab = document.createElement('button'); fab.className = 'ktl-fab'; fab.textContent = 'Suivre ma réparation'; fab.onclick = () => openTracking(); document.body.append(fab);
  }
  window.KTLivraison = { openCheckout, openTracking, openGuide };
  route();
})();

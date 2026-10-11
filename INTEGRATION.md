# Kore Tech – Module Livraison A/R, Suivi, Consignes

## Fichiers
| Fichier | Rôle |
|---|---|
| `kt-livraison.js` | Front autonome : checkout « Livraison A/R », widget de suivi (5 étapes), modale « Consignes d'envoi » |
| `netlify/functions/ship-quote.mjs` | Devis port aller-retour par transporteur |
| `netlify/functions/checkout.mjs` | Crée le ticket + la session Stripe (réparation + port A/R) |
| `netlify/functions/stripe-webhook.mjs` | Paiement confirmé → étiquette aller (Sendcloud) → e-mail au client |
| `netlify/functions/track.mjs` | Lecture publique du statut (par n° de commande ou n° de suivi) |
| `netlify/functions/ticket-admin.mjs` | API de mise à jour des statuts (+ colis retour automatique à l'étape 5) |
| `admin-suivi.html` | Mini dashboard pour changer les statuts |
| `.env.example`, `netlify.toml`, `package.json` | Configuration |

## Intégration (site existant intact)
1. **Déploiement** : les fonctions exigent un déploiement par Git ou `netlify deploy --prod` (le glisser-déposer simple ne suffit pas). Copiez les fichiers à la racine du site, à côté de votre `index.html`, puis `npm install`.
2. **Une seule ligne dans `index.html`**, avant `</body>` :
   ```html
   <script src="/kt-livraison.js" defer></script>
   ```
   Ce script ouvre le checkout A/R quand le client clique sur « Commander par correspondance » (sans modifier votre code), ajoute le bouton « Suivre ma réparation » (désactivable : `data-fab="off"`) et gère les liens `#/suivi`, `#/suivi/KT-XXXXXXXX` et `#/consignes`.
3. **Variables d'environnement** (Netlify > Site configuration) : voir `.env.example`.
4. **Stripe** : Developers > Webhooks > ajouter `https://kore-tech.netlify.app/api/stripe-webhook`, événement `checkout.session.completed`, copier la clé `whsec_…` dans `STRIPE_WEBHOOK_SECRET`.
5. **Sendcloud** : créer l'intégration « Sendcloud API » (clés publique et secrète), activer Colissimo, Mondial Relay et Chronopost, configurer votre adresse d'expédition.
6. **E-mail** : compte Resend avec votre domaine vérifié (`MAIL_FROM`).
7. **Mise à jour des statuts** : ouvrez `/admin-suivi.html`, saisissez `ADMIN_TOKEN`, choisissez le statut. Ou par API :
   ```bash
   curl -X POST https://kore-tech.netlify.app/api/ticket-admin \
     -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
     -d '{"id":"KT-ABCD2345","step":3}'
   ```
   `step` 1 à 5. À l'étape 5, le colis retour est créé, le lien de suivi retour s'affiche chez le client et il reçoit un e-mail. Imprimez ensuite l'étiquette retour depuis Sendcloud (Expéditions).

## Flux
Client choisit le transporteur → total = réparation + port A/R → paiement Stripe → webhook → étiquette aller générée à partir de ce paiement → e-mail avec PDF → client dépose le colis → vous passez les statuts 2, 3, 4, 5.

## Points à vérifier avant la mise en ligne
- **Champs Sendcloud** : j'ai utilisé l'API v2 (`POST /api/v2/parcels`, `request_label`). Les champs `from_*` (expéditeur = client) et les codes `carrier` (`colissimo`, `mondial_relay`, `chronopost`) sont à confirmer dans votre compte ; l'API v2 est en mode maintenance, l'API v3 est la cible à terme. Alternative : l'API Returns de Sendcloud pour l'étiquette aller.
- **Sécurité des prix** : la réparation est un montant envoyé par le navigateur (borné à 5 000 €). En production, recalculez-le côté serveur à partir de votre catalogue (`TODO` dans `checkout.mjs`).
- **Trésorerie** : Stripe verse les fonds après quelques jours, Sendcloud facture les étiquettes selon votre contrat. Vérifiez les délais pour ne rien avancer.
- **Tests** : Stripe en mode test, puis annulez les étiquettes de test dans Sendcloud.
- **Données** : les tickets sont stockés dans Netlify Blobs, indépendamment du back-office actuel (qui reste local au navigateur).

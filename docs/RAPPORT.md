# Rapport de changements et de vérifications — module Finances

Date : 27 octobre 2026 · Dépôt : `l5-dot/sama-facture` · Branche : `arena/4db2b11a-sama-facture`

## 1. Point de départ

Le dépôt ne contenait qu'un `README.md` de 14 octets et un commit initial
(`a357535`). Aucune application, aucun schéma Supabase, aucune migration, aucun
test n'existait. La consigne « ne pas repartir de zéro, inspecter l'existant » a
donc été appliquée en constatant l'absence de code : l'application de facturation
de base (factures, clients, produits, paiements, rôles, RLS) a été écrite dans ce
même dépôt comme socle du module Finances, puis le module Finances a été construit
par-dessus.

La référence produit (https://saas-invoicing-web-a-vw44.bolt.host) a fourni le
vocabulaire et les usages : FCFA/XOF, NINEA, Wave et Orange Money, partage
WhatsApp, PDF avec logo, données isolées par entreprise, suivi des paiements.

## 2. Ce qui a été livré

### 2.1 Application

- **React 19 + TypeScript strict + Vite 7 + Tailwind 4**, routage `react-router-dom`.
- 11 écrans : Tableau de bord, **Finances**, **Mes achats**, **Mes dépenses**,
  Factures, Clients, Produits, Rapports, Paramètres, Connexion, 404.
- Sidebar « Pilotage » avec entrées `Finances`, `Mes achats`, `Mes dépenses`, et
  second bloc « Ventes » (`Factures`, `Clients`, `Produits`), cohérente avec la
  charte existante (vert `#0f5132`, cartes, badges, typographie).
- Deux modes : **démonstration** (localStorage, aucune clé) et **Supabase**
  (auth e-mail/mot de passe, RLS réelle). Un seul jeu d'écrans, via l'interface
  `SamaRepository`.

### 2.2 Module Finances

Page `/finances` :

- 8 indicateurs : CA facturé HT, montant encaissé, reste à recevoir, total des
  achats, total des dépenses, trésorerie nette, marge brute, résultat estimé.
- Bandeau de confiance : *Données insuffisantes* / *Estimation partielle* /
  *Estimation complète*, plus la mention « Non certifié — outil de gestion ».
- Avertissements : brouillons et factures annulées exclus du CA (nombre + montant).
- Filtres de période : mois, trimestre, année, personnalisée (début/fin),
  navigation période précédente/suivante, libellé en français.
- Graphiques SVG maison (aucune dépendance ajoutée), uniquement là où ils
  apportent une information : évolution mensuelle CA net / encaissements / charges,
  résultat estimé mois par mois (accompagné d'une mise en garde explicite),
  répartition des dépenses par catégorie et répartition des achats par nature.
- **Historique des opérations** : factures confirmées, avoirs, paiements, achats,
  dépenses, avec deux colonnes distinctes « impact résultat » et « trésorerie »,
  recherche, filtre par type, pagination « afficher plus », export CSV.
- Bloc « Formules et limites » : chaque formule est écrite en clair, avec les
  limites (COGS estimé, investissement exclu du résultat, estimation non certifiée).
- **Recoupement serveur** : les totaux calculés dans le navigateur sont comparés
  au RPC `finance_summary` (tolérance 1 FCFA) ; en cas d'écart, l'interface
  affiche « Écart détecté » au lieu de masquer la différence.

Page `/finances/achats` :

- CRUD complet : fournisseur (facultatif), référence facture fournisseur, date,
  description, catégorie, quantité, prix unitaire, total calculé, montant payé,
  restant dû calculé, mode de paiement, notes, indicateur « coût des
  marchandises » / « investissement ».
- Filtres période, catégorie, statut de paiement (payé, partiel, impayé),
  recherche, export CSV, suppression protégée par confirmation et par rôle.

Page `/finances/depenses` :

- CRUD complet : montant, date, catégorie (transport, loyer, salaires,
  électricité/internet, marketing, frais bancaires, autres), description,
  référence, notes ; mode paiement non dupliqué puisqu'une dépense est une sortie
  immédiate ; même jeu de filtres et d'exports.
- Séparation stricte avec les achats : tables distinctes, catégories distinctes,
  aucun montant d'achat n'est repris dans les dépenses (testé).

### 2.3 Moteur de calcul (`src/lib/finance.ts`)

- Montants en **centimes entiers** (`money.ts`), donc aucune dérive d'arrondi.
- CA confirmé = factures `sent | partial | paid` de type `invoice`, avoirs
  (`credit_note`) soustraits, brouillons et annulées exclus.
- Distinction explicite entre :
  - *encaissé sur les factures de la période* (Σ `amount_paid` des factures de la
    période),
  - *trésorerie encaissée* (Σ paiements dont la date tombe dans la période).
  Ces deux montants ne sont jamais additionnés.
- TVA calculée après remise, au prorata des lignes, arrondie par ligne comme en SQL.
- Achats : payés / dus, ventilation marchandises, matières premières,
  fournitures, transport, équipement (capex), autre.
- `margeBrute = CA net HT − COGS` seulement si le COGS est disponible, sinon `null`
  et libellé « Données insuffisantes ».
- `resultatEstime = CA net HT − COGS − achats d'exploitation − dépenses` ;
  le capex est exclu et affiché séparément.
- `tresorerieNette = encaissements − (achats payés + dépenses)` — jamais présentée
  comme un bénéfice.

### 2.4 Base de données

Migration `20261027120000_initial_schema.sql` :

- Enums : `org_role` (owner/admin/comptable/vendeur), `client_type`,
  `invoice_kind`, `invoice_status`, `discount_type`, `tax_mode`, `payment_method`,
  `purchase_status`, `expense_status`.
- Tables : `organizations`, `organization_members`, `clients`, `products`,
  `invoices`, `invoice_items`, `payments`, `document_counters`.
- Colonnes générées : `invoice_items.line_subtotal_ht`, `invoices.amount_due`.
- Helpers `security definer` : `is_org_member`, `has_org_role`, `org_role_of`,
  `can_write_finances`, `can_manage_org`.
- Triggers : numérotation par organisation, `recalculate_invoice` (totaux
  recalculés côté serveur, remise plafonnée, TVA proratisée), immuabilité des
  factures émises et de leurs lignes, garde des paiements (plafond = restant dû,
  interdiction sur brouillon/annulée/avoir), protection du dernier propriétaire.
- RLS activée sur toutes les tables + `revoke`/`grant` par colonne : les totaux de
  facture ne sont pas modifiables par les clients.

Migration `20261027120100_finance_module.sql` :

- Enums `purchase_category`, `expense_category`.
- Tables `purchases` (colonnes générées `total_amount`, `amount_due`,
  `is_cogs`, `is_capex`) et `expenses`.
- Triggers `purchases_validate`, `expenses_validate` (montants > 0, payé ≤ total,
  dates valides, cohérence catégorie/COGS/capex) et triggers d'immutabilité de
  `organization_id`.
- Vue `v_finance_transactions` (union normale des opérations confirmées).
- Fonction `finance_summary(uuid, date, date)` : agrégats SQL, garde
  `is_org_member`, retourne aussi `cogs_available` et `partial_estimate`.

Rollbacks : `supabase/rollbacks/*.down.sql` (suppression en ordre inverse de
dépendance, requêtes de sauvegarde documentées). Aucune politique RLS n'est
désactivée ni supprimée par les migrations ; les rollbacks suppriment les tables
qu'elles ont créées.

### 2.5 Sécurité

- RLS stricte partout, `security invoker` pour les fonctions exposées, garde
  explicite dans `finance_summary`.
- Rôles : écriture financière limitée à owner/admin/comptable ; factures
  owner/admin/vendeur ; suppression owner/admin ; lecture pour tous les membres.
- `document_counters` sans aucun privilège pour les clients.
- Contrôles serveur : CHECK, triggers, `numeric(14,2)`, totaux recalculés,
  `amount_paid ≤ total`.
- Le frontend n'utilise que la clé `anon` ; la clé `service_role` n'apparaît nulle
  part (`.env.example` le rappelle).

## 3. Vérifications exécutées

```bash
npm run typecheck   # OK, aucune erreur (TS strict, noUnusedLocals)
npm run build       # OK (vite build, chunks vendor séparés)
npm test            # 181 tests / 12 fichiers, tous verts
```

| Suite | Tests | Résultat |
| --- | --- | --- |
| `tests/money.test.ts` | 12 | ✅ |
| `tests/period.test.ts` | 15 | ✅ |
| `tests/finance.test.ts` | 35 | ✅ |
| `tests/validation.test.ts` | 17 | ✅ |
| `tests/permissions.test.ts` | 7 | ✅ |
| `tests/demo-repository.test.ts` | 28 | ✅ |
| `tests/db/schema.test.ts` | 9 | ✅ |
| `tests/db/invoice-lifecycle.test.ts` | 20 | ✅ |
| `tests/db/finance-summary.test.ts` | 12 | ✅ |
| `tests/db/rls.test.ts` | 13 | ✅ |
| `tests/ui/finances.test.tsx` | 8 | ✅ |
| `tests/ui/finances-errors.test.tsx` | 5 | ✅ |

Les tests SQL s'exécutent sur **PostgreSQL embarqué (PGlite)**, rôle par rôle
(`authenticated`, `anon`, superutilisateur), avec les deux migrations appliquées.
PGlite n'embarque pas le schéma Supabase : le harnais crée un `auth.uid()` minimal
et une table `auth.users` factice pour que le trigger de création d'organisation
puisse fonctionner. Les politiques testées sont celles livrées.

### 3.1 Exemple chiffré vérifié en base (octobre 2026)

| Indicateur | Valeur attendue | Vérifié |
| --- | --- | --- |
| CA net HT | 128 000 | ✅ |
| TVA | 13 680 | ✅ |
| TTC | 141 680 | ✅ |
| Avoirs | 8 000 | ✅ |
| Encaissé sur factures de la période | 45 000 | ✅ |
| Restant à recevoir | 104 680 | ✅ |
| Trésorerie encaissée | 85 000 | ✅ |
| Achats (total / payés / dus) | 355 000 / 175 000 / 180 000 | ✅ |
| dont COGS / exploitation / équipement | 90 000 / 15 000 / 250 000 | ✅ |
| Dépenses | 225 000 | ✅ |
| Sorties de trésorerie | 400 000 | ✅ |
| Trésorerie nette | −315 000 | ✅ |
| Marge brute | 38 000 (29,69 %) | ✅ |
| Résultat estimé | −202 000 (−157,81 %) | ✅ |
| Brouillons / annulées exclues | 24 000 / 3 000 | ✅ |
| Lignes du journal | 12 | ✅ |

Scénarios couverts : paiements partiels et complets, facture émise en septembre
payée en octobre, avoir, brouillon, annulée, achats impayés et partiellement
payés, dépense hors période, organisation frontière au 31/10–01/11, période
personnalisée étroite, appel hors organisation, appel anonyme.

### 3.2 Vérifications manuelles

- `npm run dev` : `GET /` → 200, `GET /finances` → 200, `GET /src/main.tsx` → 200.
- Rendu vérifié par les tests d'interface (jsdom) : indicateurs, périodes,
  historique, formulaires, erreurs réseau, états vides, marquage desktop (`table`)
  et mobile (cartes), navigation accessible (`aria-current`, lien d'évitement).
- Mode démonstration testé de bout en bout : création d'achat, correction d'un
  montant payé supérieur au total, ajout de dépense, refus d'un montant nul,
  passage en lecture seule pour le rôle vendeur.

## 4. Écarts et décisions

- **Application de base écrite ici** : le dépôt ne contenait aucun code (voir
  §1). Le socle facturation est donc une divergence assumée par rapport à la
  formulation « ne pas repartir de zéro », imposée par l'état réel du dépôt.
- **COGS estimé par catégorie d'achat**, faute de sorties de stock : la marge
  brute est indicative et explicitement signalée comme telle ; jamais présentée
  comme comptable.
- **Graphique de résultat mensuel encadré** : il est affiché, mais sous le titre
  « Résultat estimé par mois » avec la mention « hors investissements » et un
  rappel que stocks, amortissements et charges à payer ne sont pas intégrés.
- **Deux notions d'encaissement** conservées côte à côte, jamais fusionnées.
- **Confiance** : `insufficient` sans activité, `partial` si le COGS ou les
  dépenses manquent, `complete` sinon.
- **Chunking** : `react-vendor` et `supabase` séparés pour rester sous le seuil
  d'alerte et améliorer le cache.

## 5. Limites connues

- Estimation de gestion, pas de comptabilité certifiée ; pas de déclaration TVA
  ni de liasse fiscale.
- Pas de gestion de stock ni de coût unitaire réel par vente.
- Le mode démo est local au navigateur (pas de partage entre appareils).
- Les tests SQL valident le schéma et la RLS sous PGlite, pas le déploiement
  Supabase lui-même (le harnais compense l'absence du schéma `auth`).

## 6. Fichiers principaux ajoutés

```
src/lib/finance.ts, money.ts, period.ts, permissions.ts, validation.ts, invoices.ts
src/lib/data/{types,index}.ts, demo/{db,repository}.ts, supabase/{client,repository}.ts
src/context/AppContext.tsx
src/components/{ui,charts,PeriodFilter,Layout,StatCard,ConfirmDialog,
                PurchaseFormModal,ExpenseFormModal,InvoiceFormModal,PaymentModal}.tsx
src/pages/{Dashboard,Finances,Purchases,Expenses,Invoices,Clients,Products,
           Reports,Settings,Login,NotFound}Page.tsx
supabase/migrations/20261027120000_initial_schema.sql
supabase/migrations/20261027120100_finance_module.sql
supabase/rollbacks/20261027120000_initial_schema.down.sql
supabase/rollbacks/20261027120100_finance_module.down.sql
tests/ … (12 fichiers, 181 tests)
README.md, docs/RAPPORT.md
```

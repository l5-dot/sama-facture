# Sama Facture

Application de facturation et de pilotage financier pour les petites entreprises
sénégalaises : factures, avoirs, encaissements (Wave, Orange Money, espèces…),
achats, dépenses et résultat estimé. Interface en français, montants en **FCFA (XOF)**.

Le module **Finances** répond à une question simple : *« ce que j'ai facturé, ce que
j'ai réellement encaissé, ce que j'ai acheté et dépensé — et ce qu'il me reste »*,
sans jamais confondre chiffre d'affaires, trésorerie et bénéfice.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Démarrage rapide](#démarrage-rapide)
- [Mode démonstration et mode Supabase](#mode-démonstration-et-mode-supabase)
- [Règles de calcul financier](#règles-de-calcul-financier)
- [Sécurité et multi-tenant](#sécurité-et-multi-tenant)
- [Base de données et migrations](#base-de-données-et-migrations)
- [Tests et vérifications](#tests-et-vérifications)
- [Structure du projet](#structure-du-projet)

## Fonctionnalités

| Domaine | Détail |
| --- | --- |
| Facturation | Factures et avoirs, brouillon → émise → partiellement payée → payée, annulation contrôlée, numérotation `FACT-0001` / `AV-0001` par organisation, remises (montant ou %) et TVA par ligne, **partage WhatsApp et impression PDF** |
| Clients & produits | Fiches clients (téléphone, WhatsApp, NINEA, adresse), catalogue produits avec prix et coût |
| Achats | Fournisseur facultatif, référence facture fournisseur, catégorie (marchandises, matières premières, fournitures, équipement, transport, autre), quantité, prix unitaire, total, montant payé, restant dû, mode de paiement, notes |
| Dépenses | Transport, loyer, salaires, électricité/internet, marketing, frais bancaires, autres — sans jamais recompter un achat |
| Finances | CA facturé, encaissé, restant à recevoir, achats, dépenses, trésorerie nette, marge brute, résultat estimé, historique des opérations, périodes mois / trimestre / année / personnalisée, export CSV |
| Rapports | Synthèse par période, répartition des dépenses, export CSV (séparateur `;`, virgule décimale, BOM UTF-8 pour Excel FR) |
| Paramètres | Organisation, devise, membres et rôles, réinitialisation des données de démonstration |

### Ce que le module Finances affiche

1. **Chiffre d'affaires facturé (HT)** : factures *émises, partiellement payées ou
   payées*, avoirs déduits. Les brouillons et les annulées sont **exclus** et
   signalés par un avertissement.
2. **Montant encaissé** : paiements reçus *sur la période* (trésorerie) et, en
   second, la part déjà réglée des factures *de la période*.
3. **Reste à recevoir** : `total TTC − montant payé` des factures confirmées.
4. **Total des achats** : payés / restant dû, avec ventilation marchandises,
   fournitures, équipement (investissement).
5. **Total des dépenses** : charges d'exploitation de la période.
6. **Trésorerie nette** = encaissements − (achats payés + dépenses).
7. **Marge brute** = CA net HT − coût des marchandises vendues (achats
   « marchandises » / « matières premières »), ou `null` si le coût est inconnu.
8. **Bénéfice estimé** (résultat estimé) = CA net HT − coût des marchandises − achats
   d'exploitation − dépenses. Les investissements (équipement) sont exclus et
   affichés séparément.
9. **Historique des opérations** : factures émises, avoirs, paiements, achats et
   dépenses, triés par date, avec impact résultat et impact trésorerie distincts.

> Le résultat affiché est une **estimation de gestion**, jamais un résultat
> comptable certifié. L'interface l'indique explicitement et précise le niveau de
> confiance : *Données insuffisantes*, *Estimation partielle* ou *Estimation complète*.

## Démarrage rapide

Prérequis : Node.js ≥ 20.

```bash
npm install
npm run dev        # http://localhost:5173
```

Sans variables d'environnement, l'application démarre en **mode démonstration** :
un jeu de données réaliste (deux organisations, cinq mois d'activité) est chargé
dans le navigateur. Aucune clé, aucun backend n'est nécessaire.

```bash
npm run typecheck  # TypeScript strict
npm test           # 208 tests (unitaires, dépôt, SQL/RLS, parcours, interface)
npm run build      # build de production
```

## Mode démonstration et mode Supabase

| | Démonstration | Supabase |
| --- | --- | --- |
| Configuration | aucune | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` |
| Données | `localStorage` (clé `sama-facture-demo-v1`) | PostgreSQL + RLS |
| Rôles | simulés depuis le menu « rôle simulé » | lus dans `organization_members` |
| RPC de contrôle | `finance_summary` simulé | `finance_summary()` réel |

Copiez `.env.example` vers `.env.local`, renseignez **uniquement** l'URL du projet
et la clé publique `anon` / `publishable`. La clé `service_role` ne doit jamais
être présente dans le frontend : elle contourne la RLS.

Les écrans ne parlent jamais directement à Supabase : ils passent par l'interface
`SamaRepository` (`src/lib/data/types.ts`), implémentée deux fois (démo et
Supabase). Le mode Supabase est donc le même code d'interface que la démo.

## Règles de calcul financier

Toutes les formules sont documentées dans l'en-tête de `src/lib/finance.ts` et
rappelées dans l'interface (bloc « Formules et limites » de la page Finances).

- Les montants sont calculés en **centimes entiers** (`src/lib/money.ts`) puis
  affichés en FCFA : aucun cumul en flottant, aucun arrondi cumulatif.
- Une facture confirmée est une facture de type `invoice` au statut `sent`,
  `partial` ou `paid`. Les avoirs (`credit_note`) sont des factures négatives et
  **se soustraient** du CA.
- La TVA est calculée **après remise**, au prorata de chaque ligne ; la remise
  globale est plafonnée au sous-total.
- Les totaux des factures sont recalculés **côté base** (`recalculate_invoice`) :
  les montants envoyés par le navigateur sont ignorés ; l'`UPDATE` concédé aux
  clients porte uniquement sur les colonnes métier, jamais sur les totaux, le
  numéro, le type ni le lien à l'organisation.
- Un paiement ne peut jamais dépasser le restant dû ; le statut *partiel* /
  *payé* est déduit des paiements, jamais saisi à la main.
- Une facture émise est **immuable** : seule une annulation (si aucun paiement)
  ou un avoir permet de la corriger.
- Achats et dépenses sont deux tables distinctes : une dépense ne peut pas
  recopier un achat, et les catégories sont contraintes par des enums.

### Exemple chiffré (tests)

Facture de 10 × 8 000 FCFA + une ligne de 3 000 FCFA, remise 5 %, TVA 18 % :

| Élément | Montant |
| --- | --- |
| Sous-total HT | 83 000 |
| Remise 5 % | 4 150 |
| CA net HT | 78 850 |
| TVA 18 % | 13 680 (arrondi par ligne) |
| Total TTC | 92 530 |

## Sécurité et multi-tenant

- Chaque table financière porte `organization_id` (clé étrangère obligatoire,
  immuable après création par trigger).
- RLS activée **partout**, sans exception, avec des politiques par rôle
  applicatif : `owner`, `admin`, `comptable`, `vendeur`.
  - Écriture financière (achats, dépenses, paiements) : owner, admin, comptable.
  - Factures : owner, admin, vendeur.
  - Suppression d'un enregistrement financier et modification de l'organisation :
    owner, admin.
  - Lecture : tout membre de l'organisation.
- Les agrégats financiers passent par `finance_summary(uuid, date, date)`
  (`security invoker` + garde `is_org_member`) : un appelant hors organisation
  reçoit `Accès refusé`.
- `document_counters` n'accorde **aucun** privilège : la numérotation est
  uniquement gérée par trigger.
- Les journaux d'export et d'erreurs ne contiennent jamais de secret ; aucune clé
  d'API n'est stockée côté client. Le script `npm run audit:supabase` refuse de
  démarrer si la clé fournie ressemble à une clé `service_role`.
- Rien ne fait confiance au navigateur : contrôles SQL (CHECK), triggers de
  validation, politiques RLS, et revérification des totaux à l'affichage
  (`reconcileWithServer`, tolérance 1 FCFA).

## Base de données et migrations

| Fichier | Contenu |
| --- | --- |
| `supabase/migrations/20261027120000_initial_schema.sql` | Enums, organisations, membres, clients, produits, factures, lignes, paiements, compteurs, helpers de rôles, triggers, RLS |
| `supabase/migrations/20261027120100_finance_module.sql` | Enums achats/dépenses, tables `purchases` et `expenses`, triggers de validation, vue `v_finance_transactions`, fonction `finance_summary` |
| `supabase/rollbacks/20261027120000_initial_schema.down.sql` | Retour arrière complet de la migration initiale |
| `supabase/rollbacks/20261027120100_finance_module.down.sql` | Retour arrière du module Finances (avec requêtes de sauvegarde en commentaire) |

Application :

```bash
supabase db push          # ou psql -f supabase/migrations/<fichier>.sql
psql -f supabase/rollbacks/20261027120100_finance_module.down.sql   # rollback
```

Les deux migrations sont **additives et rejouables sur une base vide** ; les
rollbacks suppriment dans l'ordre inverse de dépendance (vue, fonction, tables,
triggers, enums) sans toucher aux objets de la migration initiale.

## Tests et vérifications

```bash
npm test             # 208 tests, 15 fichiers
npm run test:db      # tests SQL sur PostgreSQL embarqué (PGlite)
npm run typecheck
npm run build
npm run audit:supabase   # audit lecture seule d'un projet Supabase réel
```

| Fichier | Ce qui est vérifié |
| --- | --- |
| `tests/money.test.ts` | Arrondis, calculs en centimes, formatage FCFA/XOF |
| `tests/period.test.ts` | Mois, trimestre, année, période personnalisée, bornes |
| `tests/finance.test.ts` (35) | CA, avoirs, brouillons/annulées, paiements partiels, trésorerie, marge, résultat, confiance, période vide |
| `tests/validation.test.ts` | Validation des formulaires et des dates |
| `tests/permissions.test.ts` | Matrice des rôles |
| `tests/demo-repository.test.ts` (28) | CRUD démo, immuabilité, numérotation, paiements, isolation, permissions |
| `tests/db/schema.test.ts` (9) | Schéma, enums, contraintes, types numériques, index uniques |
| `tests/db/invoice-lifecycle.test.ts` (20) | Totaux serveur, numérotation, bornes, immuabilité, transitions de statut, avoirs, suppression de brouillon, protections d'organisation |
| `tests/db/finance-summary.test.ts` (12) | Agrégats d'octobre, exclusion brouillons/annulées, période personnalisée, isolation, garde d'accès |
| `tests/db/rls.test.ts` (13) | Isolation multi-tenant, refus d'insertion inter-organisations, permissions par rôle, compteurs, anonyme |
| `tests/db/parcours-complet.test.ts` (9) | Parcours réel : facture → encaissement partiel → solde → achat 300 000 → transport 50 000 → indicateurs ; l'argent en caisse n'est jamais assimilé au bénéfice |
| `tests/audit-supabase.test.ts` (6) | Logique de l'audit d'intégration Supabase (client simulé) : détection de table manquante, isolation, clé interdite |
| `tests/ui/finances.test.tsx` (9) | Indicateurs, périodes vides, permissions, formulaires achat/dépense, erreurs de saisie, partage facture |
| `tests/share.test.ts` (11) | Numéro WhatsApp international, message de partage, document imprimable, échappement HTML |
| `tests/ui/finances-errors.test.tsx` (5) | Erreurs réseau, reprise, états vides, rendu mobile + desktop, accessibilité |

Le détail des changements et des vérifications figure dans
[`docs/RAPPORT.md`](docs/RAPPORT.md). La procédure d'intégration à un projet
Supabase existant, sans perte de données, est décrite dans
[`docs/INTEGRATION-SUPABASE.md`](docs/INTEGRATION-SUPABASE.md).

## Structure du projet

```
src/
  App.tsx                 routes (lazy) et garde d'authentification
  context/AppContext.tsx  session, organisation active, données, permissions, notifications
  components/             UI (cartes, tableaux, graphiques SVG, modales, filtres de période)
  pages/                  Dashboard, Finances, Achats, Dépenses, Factures, Clients,
                          Produits, Rapports, Paramètres, Connexion
  lib/
    finance.ts            moteur de calcul financier (source de vérité UI)
    money.ts              centimes, arrondis, formatage FCFA/XOF
    period.ts             périodes mois/trimestre/année/personnalisée
    permissions.ts        rôles et capacités
    validation.ts         validation des saisies
    invoices.ts           totaux de facture côté client (aperçu)
    data/                 dépôt partagé : démo (localStorage) + Supabase
supabase/
  migrations/             migrations versionnées (aller)
  rollbacks/              retours arrière documentés
scripts/verify-supabase.mjs  audit lecture seule d'un projet Supabase réel
tests/                    unitaires, dépôt, SQL/RLS (PGlite), parcours, interface
docs/RAPPORT.md           rapport de changements et de vérifications
docs/INTEGRATION-SUPABASE.md  branchement sur un projet existant, sans perte
```

## Limites connues

- Le coût des marchandises est **estimé** à partir des achats catégorisés
  « marchandises » / « matières premières » de la période : ce n'est pas un coût
  unitaire par produit vendu (pas de sortie de stock). La marge brute est donc
  indicative et signalée comme telle.
- Pas de gestion de stock, de paie détaillée ni de déclaration fiscale (NINEA,
  TVA à déclarer) : le module produit une estimation de gestion.
- Le mode démonstration stocke les données dans le navigateur : elles sont
  locales à l'appareil et réinitialisables depuis les Paramètres.
- Le test des migrations s'appuie sur PGlite, qui n'embarque pas le schéma
  `auth` de Supabase : les tests créent un `auth.uid()` minimal et une table
  `auth.users` factice. Les politiques RLS testées sont celles du dépôt.

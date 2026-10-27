# Intégrer le module Finances à un projet Supabase existant

Objectif : brancher l'application sur **ton** projet Supabase sans perdre de
données et sans casser ce qui existe déjà. À lire avant tout déploiement.

## 0. Le point de vigilance principal

Ce dépôt contenait **uniquement un README de 14 octets** au commit `a357535`
(aucune application, aucun schéma, aucune migration). Le socle de facturation a
donc été écrit ici : **ce n'est pas une copie de ton application existante**.

Conséquence directe : si tu exploites déjà une version de Sama Facture ailleurs
(autre dépôt, projet Bolt, base Supabase en production), il faut **choisir** :

| Situation | Ce qu'il faut faire |
| --- | --- |
| Tu veux garder ce dépôt comme base de production | Reprendre ce code, mais migrer tes **données** depuis l'ancienne base (étape 4). |
| Tu as un code existant à conserver | Ne pas déployer ce frontend tel quel : les migrations ci-dessous ne couvrent que le schéma de ce dépôt. Il faut porter le module Finances dans ton code (les fichiers `src/lib/finance.ts`, `src/pages/FinancesPage.tsx`, `src/pages/PurchasesPage.tsx`, `src/pages/ExpensesPage.tsx` et les deux migrations sont autonomes). |
| Tu n'as encore aucune donnée de production | Tu peux appliquer les migrations sur un projet neuf (étape 2). |

Dans tous les cas, **ne lance aucune migration sur une base contenant des
données sans avoir fait la sauvegarde de l'étape 1**.

## 1. Sauvegarde (obligatoire avant toute migration)

```bash
# Sauvegarde complète, rôle par rôle, avec les données
pg_dump --no-owner --no-privileges \
  "postgresql://postgres:[MOT_DE_PASSE]@db.[PROJET].supabase.co:5432/postgres" \
  > sauvegarde-$(date +%Y%m%d-%H%M).sql

# Vérification : la sauvegarde doit contenir les données, pas seulement le schéma
grep -c "COPY public\." sauvegarde-*.sql
```

Depuis le tableau de bord Supabase : *Database → Backups → Restore point* permet
aussi de créer un point de restauration avant l'opération.

## 2. Vérifier ce qui existe déjà

```sql
-- Tables présentes
select table_name from information_schema.tables
where table_schema = 'public' order by 1;

-- RLS activée partout ?
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1;

-- Migrations déjà appliquées (si tu utilises le CLI Supabase)
select version, name from supabase_migrations.schema_migrations order by version;
```

Trois cas :

1. **Base vide** → applique les deux migrations dans l'ordre (étape 3).
2. **Base avec un schéma proche** (tables `invoices`, `clients`…) → n'applique
   pas les `create table` à l'aveugle : compare les colonnes avec
   `information_schema.columns`, puis applique seulement les objets manquants
   (module Finances : `20261027120100_finance_module.sql`). Le fichier est écrit
   avec `create table if not exists` pour les nouvelles tables, mais les types
   enumerés et les triggers doivent être vérifiés un par un.
3. **Base inconnue / schéma différent** → ne rien appliquer. Ouvre une branche
   Supabase de test (`supabase branches create`) et fais l'essai dessus.

## 3. Appliquer les migrations

```bash
# Option A — CLI Supabase (recommandé, versionné)
supabase link --project-ref [PROJET]
supabase db push

# Option B — psql, migration par migration
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20261027120000_initial_schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20261027120100_finance_module.sql
```

`-v ON_ERROR_STOP=1` évite d'appliquer une migration à moitié.

Retour arrière (les deux fichiers sont fournis et testés) :

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/rollbacks/20261027120100_finance_module.down.sql
```

> Le rollback du module Finances **supprime les achats et les dépenses**. Les
> requêtes de sauvegarde sont documentées en tête du fichier : exécute-les
> d'abord si les données doivent être conservées.

## 4. Reprendre des données existantes

Les tables financières ont des colonnes générées (`total_amount`, `amount_due`,
`is_cogs`, `is_capex`, `line_tax`…) : **ne les insère pas**.

```sql
-- Exemple : reprendre les achats depuis une ancienne table
insert into public.purchases
  (organization_id, purchase_date, description, category, quantity, unit_price,
   amount_paid, supplier_name, notes)
select organization_id, purchase_date, description,
       case
         when lower(category) like '%marchandise%' then 'marchandises'
         when lower(category) like '%mati%' then 'matieres_premieres'
         when lower(category) like '%fourniture%' then 'fournitures'
         when lower(category) like '%transport%' then 'transport'
         when lower(category) like '%equip%' then 'equipement'
         else 'autre'
       end::public.purchase_category,
       quantity, unit_price, coalesce(amount_paid, 0), supplier_name, notes
from ancienne_table_achats;

-- Contrôle : le total et le restant dû doivent être cohérents
select count(*) filter (where total_amount <> round(quantity * unit_price, 2)) as totaux_incoherents,
       count(*) filter (where amount_due < 0) as trop_payes
from public.purchases;
```

Après reprise, vérifie chaque organisation :

```sql
select organization_id,
       count(*) as achats,
       sum(total_amount) as total,
       sum(amount_due) as du
from public.purchases group by 1 order by 1;
```

## 5. Audit du projet réel (lecture seule)

```bash
SUPABASE_URL="https://[PROJET].supabase.co" \
SUPABASE_ANON_KEY="[CLE_ANON]" \
AUDIT_EMAIL="compte-de-test@exemple.sn" \
AUDIT_PASSWORD="[MOT_DE_PASSE]" \
npm run audit:supabase
```

Le script :

- refuse une clé `service_role` ;
- vérifie que les 11 tables/vues attendues existent ;
- vérifie que `organizations` ne renvoie que les organisations du compte ;
- vérifie que les achats visibles appartiennent bien au périmètre du compte ;
- appelle `finance_summary` sur la période en cours et affiche les agrégats ;
- **n'écrit rien** (aucun `insert`, `update` ou `delete`).

Sortie attendue :

```
[OK  ] Table/vue « purchases » accessible
[OK  ] Isolation de la table organizations
[OK  ] Agrégats finance_summary (10/2026)
11 vérification(s) · 0 échec(s) · 0 avertissement(s)
Audit concluant : le schéma et l'isolation répondent comme attendu.
```

## 6. Parcours de recette, sur ton projet réel

À faire avec un compte réel, sur une organisation de test, puis à supprimer :

1. Créer un client.
2. Créer une facture avec 2 lignes, une remise et de la TVA → vérifier les totaux.
3. Émettre la facture → vérifier le numéro `FACT-0001` et l'immuabilité.
4. Enregistrer un paiement partiel → statut « partiellement payée ».
5. Enregistrer le solde → statut « payée ».
6. Ajouter un achat de marchandises 300 000 FCFA, payé.
7. Ajouter une dépense de transport 50 000 FCFA.
8. Ouvrir `/finances` sur la période → CA, encaissements, achats, dépenses,
   trésorerie nette et résultat estimé doivent correspondre au calcul manuel.
9. Vérifier le bandeau « Totaux recoupés avec la base ».
10. Se connecter avec un compte d'une **autre** organisation → aucune donnée de
    la première ne doit apparaître.

Le parcours des étapes 2 à 8 est automatisé dans
`tests/db/parcours-complet.test.ts` (PostgreSQL embarqué) : il donne les valeurs
attendues pour comparaison.

## 7. Déploiement sans écraser les données

- Le frontend ne contient **aucune** commande de migration : déployer le site ne
  touche pas à la base.
- Ne jamais lancer `supabase db reset` sur un projet de production : cette
  commande **efface** la base.
- Ne pas définir `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` vers un projet
  de test en production (et inversement).
- La clé `service_role` ne doit figurer ni dans le frontend, ni dans un fichier
  `.env` versionné, ni dans une variable `VITE_*`.
- Après déploiement, relancer `npm run audit:supabase` sur l'URL publique.

## 8. Ce qui reste à faire avant un usage commercial

| Sujet | État | Suite |
| --- | --- | --- |
| Coût des marchandises | estimé par catégorie d'achat | ajouter un suivi de stock (entrées/sorties) pour un coût réel par vente |
| Résultat | estimation de gestion | ne pas s'en servir pour une liasse fiscale |
| TVA / NINEA | TVA calculée, NINEA stocké | ajouter les déclarations si nécessaire |
| PDF / WhatsApp | non inclus dans ce dépôt | à rebrancher si l'application existante les proposait |
| Factures récurrentes, relances | non inclus | à planifier après validation du module |

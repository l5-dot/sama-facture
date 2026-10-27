/**
 * Audit d'intégration Supabase — logique pure, sans réseau, pour être testable.
 *
 * Le script `scripts/verify-supabase.mjs` charge ce module et lui passe un client
 * Supabase authentifié. L'audit est strictement en **lecture seule** : aucune
 * insertion, modification ou suppression n'est effectuée, et aucune migration
 * n'est jouée. Il répond à trois questions :
 *
 *   1. Le schéma attendu est-il bien déployé sur le projet ?
 *   2. Chaque organisation ne voit-elle que ses propres données (RLS) ?
 *   3. Les agrégats `finance_summary` sont-ils calculables et cohérents ?
 */

/** Tables et vues que les migrations doivent avoir créées. */
export const EXPECTED_TABLES = [
  'organizations',
  'organization_members',
  'clients',
  'products',
  'invoices',
  'invoice_items',
  'payments',
  'document_counters',
  'purchases',
  'expenses',
  'v_finance_transactions',
];

const PGRST_MISSING = ['42P01', 'PGRST205', 'PGRST204'];

function monthBounds(today) {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end, label: `${String(month + 1).padStart(2, '0')}/${year}` };
}

function isMissing(error) {
  if (!error) return false;
  if (error.code && PGRST_MISSING.includes(error.code)) return true;
  return /does not exist|not find the table|schema cache|could not find/i.test(error.message);
}

/**
 * Exécute l'audit sur un client déjà authentifié.
 *
 * `selectOwnRows` interroge une table en filtrant sur l'organisation active.
 * `selectAll` interroge la même table **sans filtre** : c'est ce qui permet de
 * détecter une fuite entre organisations (RLS absente).
 */
export async function runAudit(client, options = {}) {
  const checks = [];
  const tables = options.expectedTables ?? [...EXPECTED_TABLES];
  const period = monthBounds(options.today ?? new Date());

  // 1. Schéma -----------------------------------------------------------------
  for (const table of tables) {
    const { error } = await client.selectRows(table, 'id').then(
      (result) => ({ data: null, error: result.error }),
      (error) => ({ data: null, error: { message: error.message } }),
    );
    if (!error) {
      checks.push({
        id: `table:${table}`,
        label: `Table/vue « ${table} » accessible`,
        status: 'ok',
        detail: 'Lecture autorisée avec la clé anon et une session authentifiée.',
      });
    } else if (isMissing(error)) {
      checks.push({
        id: `table:${table}`,
        label: `Table/vue « ${table} » accessible`,
        status: 'fail',
        detail: `Objet absent du schéma déployé : ${error.message}. Appliquez les migrations avant de déployer le frontend.`,
      });
    } else {
      // Une erreur de permission est normale pour `document_counters` : c'est
      // même le comportement attendu pour un client.
      checks.push({
        id: `table:${table}`,
        label: `Table/vue « ${table} » accessible`,
        status: table === 'document_counters' ? 'ok' : 'warn',
        detail:
          table === 'document_counters'
            ? 'Accès refusé comme prévu : la numérotation reste gérée par trigger.'
            : `Réponse inattendue : ${error.message}`,
      });
    }
  }

  // 2. Périmètre des organisations -------------------------------------------
  const orgs = await client.listOrganizations();
  if (orgs.error) {
    checks.push({
      id: 'orgs:list',
      label: 'Liste des organisations du compte',
      status: 'fail',
      detail: `Impossible de lister les organisations : ${orgs.error.message}`,
    });
    return finalize(checks);
  }

  const organizationIds = (orgs.data ?? [])
    .map((row) => String(row.organization_id ?? row.id ?? ''))
    .filter(Boolean);

  checks.push({
    id: 'orgs:list',
    label: 'Liste des organisations du compte',
    status: organizationIds.length > 0 ? 'ok' : 'warn',
    detail:
      organizationIds.length > 0
        ? `${organizationIds.length} organisation(s) visible(s) pour cet utilisateur.`
        : 'Aucune organisation rattachée à ce compte : vérifiez la table organization_members.',
  });

  // 3. Annuaire des organisations (fuite éventuelle) --------------------------
  const directory = await client.selectRows('organizations', 'id');
  if (!directory.error) {
    const total = directory.data?.length ?? 0;
    checks.push({
      id: 'orgs:isolation',
      label: 'Isolation de la table organizations',
      status: total <= organizationIds.length ? 'ok' : 'fail',
      detail:
        total <= organizationIds.length
          ? `Aucune organisation tierce visible (${total} ligne(s)).`
          : `${total} organisations visibles alors que le compte n'en compte que ${organizationIds.length} : la RLS laisse fuiter des lignes. Ne déployez pas en l'état.`,
    });
  }

  // 4. Agrégats financiers ----------------------------------------------------
  if (organizationIds.length === 0) {
    checks.push({
      id: 'finance:summary',
      label: 'Agrégats finance_summary',
      status: 'warn',
      detail: 'Non testé : aucune organisation disponible pour cet utilisateur.',
    });
  }

  for (const organizationId of organizationIds) {
    const result = await client.summary(organizationId, period.start, period.end);
    if (result.error) {
      checks.push({
        id: `finance:summary:${organizationId}`,
        label: `Agrégats finance_summary (${period.label})`,
        status: isMissing(result.error) ? 'fail' : 'warn',
        detail: isMissing(result.error)
          ? 'Fonction finance_summary absente : la migration du module Finances n’est pas appliquée.'
          : `Erreur pendant le calcul : ${result.error.message}`,
      });
      continue;
    }
    const row = result.data?.[0];
    const numeric = (key) => Number(row?.[key] ?? 0);
    const coherent =
      Boolean(row) &&
      Number.isFinite(numeric('invoiced_ht')) &&
      numeric('cash_out') >= 0 &&
      numeric('expenses_total') >= 0;
    checks.push({
      id: `finance:summary:${organizationId}`,
      label: `Agrégats finance_summary (${period.label})`,
      status: coherent ? 'ok' : 'warn',
      detail: coherent
        ? `CA net ${numeric('invoiced_ht')} · encaissé ${numeric('cash_in')} · achats ${numeric('purchases_total')} · dépenses ${numeric('expenses_total')} · résultat estimé ${numeric('estimated_result')}.`
        : 'La fonction répond mais les valeurs sont inexploitables : vérifiez la signature retournée.',
    });
  }

  // 5. Lecture croisée : achats visibles hors du périmètre du compte ----------
  {
    const allowed = new Set(organizationIds);
    const { data, error } = await client.selectRows('purchases', 'organization_id');
    if (!error) {
      const foreign = (data ?? []).filter((row) => !allowed.has(row.organization_id));
      checks.push({
        id: 'purchases:isolation',
        label: 'Isolation des achats entre organisations',
        status: foreign.length === 0 ? 'ok' : 'fail',
        detail:
          foreign.length === 0
            ? 'Aucune ligne d’une organisation tierce visible.'
            : `${foreign.length} achat(s) appartenant à une autre organisation sont visibles.`,
      });
    }
  }

  return finalize(checks);
}

function finalize(checks) {
  return { checks, hasFailure: checks.some((check) => check.status === 'fail') };
}

/** Refuse une clé qui ressemble à un secret serveur (service_role). */
export function assertPublicKey(key) {
  const value = key.trim();
  if (!value) throw new Error('Clé publique manquante.');
  if (value.startsWith('sb_secret_') || value.includes('service_role')) {
    throw new Error(
      'Clé service_role détectée. Elle contourne la RLS : utilisez uniquement la clé anon/publishable.',
    );
  }
  if (value.length < 20) throw new Error('Clé publique invalide (trop courte).');
}

export function formatReport(report) {
  const icon = { ok: 'OK  ', warn: 'ATTN', fail: 'ECHEC' };
  const lines = report.checks.map(
    (check) => `[${icon[check.status]}] ${check.label}\n         ${check.detail}`,
  );
  const failures = report.checks.filter((check) => check.status === 'fail').length;
  const warnings = report.checks.filter((check) => check.status === 'warn').length;
  lines.push(
    '',
    `${report.checks.length} vérification(s) · ${failures} échec(s) · ${warnings} avertissement(s)`,
  );
  if (report.hasFailure) {
    lines.push(
      'Audit en échec : ne déployez pas cette version sur ce projet avant correction.',
    );
  } else {
    lines.push('Audit concluant : le schéma et l’isolation répondent comme attendu.');
  }
  return lines.join('\n');
}

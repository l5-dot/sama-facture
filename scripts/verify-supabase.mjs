#!/usr/bin/env node
/**
 * Audit d'intégration d'un projet Supabase réel — **lecture seule**.
 *
 * Usage :
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
 *   AUDIT_EMAIL=... AUDIT_PASSWORD=... npm run audit:supabase
 *
 * Le script se connecte avec un compte réel (jamais avec la clé service_role),
 * vérifie que le schéma attendu est déployé, que chaque organisation ne voit que
 * ses données et que `finance_summary` répond. Il n'écrit rien : aucune donnée
 * n'est créée, modifiée ou supprimée, aucune migration n'est appliquée.
 */

import { createClient } from '@supabase/supabase-js';
import { assertPublicKey, formatReport, runAudit } from './audit-core.mjs';

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
const email = process.env.AUDIT_EMAIL;
const password = process.env.AUDIT_PASSWORD;

function stop(message) {
  console.error(`\n${message}\n`);
  process.exit(2);
}

if (!url) stop('SUPABASE_URL manquante.');
if (!anonKey) stop('SUPABASE_ANON_KEY manquante (clé anon/publishable uniquement).');
if (!email || !password) {
  stop(
    'AUDIT_EMAIL et AUDIT_PASSWORD sont requis : l’audit se fait avec un compte réel,\n' +
      'car la RLS doit être évaluée comme le ferait l’application.',
  );
}
try {
  assertPublicKey(anonKey);
} catch (error) {
  stop(error instanceof Error ? error.message : String(error));
}

const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
if (signInError) stop(`Connexion impossible : ${signInError.message}`);

const client = {
  async selectRows(table, columns) {
    const { data, error } = await supabase.from(table).select(columns).limit(500);
    return { data, error };
  },
  async summary(organizationId, start, end) {
    const { data, error } = await supabase.rpc('finance_summary', {
      p_organization_id: organizationId,
      p_start: start,
      p_end: end,
    });
    return { data: Array.isArray(data) ? data : data ? [data] : [], error };
  },
  async listOrganizations() {
    const { data, error } = await supabase
      .from('organization_members')
      .select('organization_id, role');
    return { data, error };
  },
};

console.log(`\nAudit Supabase — ${url}`);
console.log(`Compte : ${email} · lecture seule\n`);

const report = await runAudit(client);
console.log(formatReport(report));

await supabase.auth.signOut();
process.exit(report.hasFailure ? 1 : 0);

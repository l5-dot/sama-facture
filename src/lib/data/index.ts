import { DemoRepository } from './demo/repository';
import { isSupabaseConfigured } from './supabase/client';
import { SupabaseRepository } from './supabase/repository';
import type { SamaRepository } from './types';

export const repositoryMode: 'demo' | 'supabase' = isSupabaseConfigured ? 'supabase' : 'demo';

let instance: SamaRepository | null = null;

/**
 * Instance unique du dépôt.
 *
 * Sans variables d'environnement Supabase, l'application démarre en mode
 * démonstration (données locales) : cela permet d'explorer le module Finances
 * immédiatement, sans clé et sans backend.
 */
export function getRepository(): SamaRepository {
  if (!instance) {
    instance = isSupabaseConfigured ? new SupabaseRepository() : new DemoRepository();
  }
  return instance;
}

/** Réservé aux tests : force une nouvelle instance. */
export function resetRepositoryInstance(): void {
  instance = null;
}

export * from './types';

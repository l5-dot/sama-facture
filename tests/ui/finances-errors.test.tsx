/**
 * Tests d'interface : erreurs réseau, accessibilité et rendu mobile / desktop.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppContent } from '../../src/App';
import { AppProvider } from '../../src/context/AppContext';
import { getRepository, resetRepositoryInstance, RepositoryError } from '../../src/lib/data';
import { DemoRepository } from '../../src/lib/data/demo/repository';
import { resetDemoState } from '../../src/lib/data/demo/db';

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  resetRepositoryInstance();
  resetDemoState();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('erreurs réseau', () => {
  it('affiche un message et permet de réessayer quand le journal échoue', async () => {
    const user = userEvent.setup();
    const repo = getRepository() as DemoRepository;
    const spy = vi
      .spyOn(repo, 'listJournal')
      .mockRejectedValueOnce(new RepositoryError('network', 'Connexion au serveur impossible.'));

    renderApp('/finances');

    expect(await screen.findByText('Journal indisponible')).toBeInTheDocument();
    expect(screen.getByText('Connexion au serveur impossible.')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Réessayer' })[0]);
    await waitFor(() => {
      expect(screen.queryByText('Journal indisponible')).not.toBeInTheDocument();
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText('AV-0001').length).toBeGreaterThan(0);
  });

  it('affiche une erreur globale quand les données de l’organisation ne chargent pas', async () => {
    const user = userEvent.setup();
    const repo = getRepository() as DemoRepository;
    vi.spyOn(repo, 'listInvoices').mockRejectedValue(
      new RepositoryError('network', 'Le serveur ne répond pas.'),
    );

    renderApp('/finances');

    expect(await screen.findByText('Impossible de charger les données')).toBeInTheDocument();
    expect(screen.getByText('Le serveur ne répond pas.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Impossible de charger les données')).toBeInTheDocument();
  });

  it('propose un état vide explicite quand la base ne contient aucune donnée financière', async () => {
    const repo = getRepository() as DemoRepository;
    vi.spyOn(repo, 'listJournal').mockResolvedValue([]);
    vi.spyOn(repo, 'listPurchases').mockResolvedValue([]);
    vi.spyOn(repo, 'listExpenses').mockResolvedValue([]);

    renderApp('/finances/achats');
    expect(await screen.findByText('Aucun achat sur cette période')).toBeInTheDocument();
  });
});

describe('rendu mobile et desktop', () => {
  it('rend un tableau (desktop) et des cartes (mobile) pour l’historique', async () => {
    renderApp('/finances');
    await screen.findByRole('heading', { name: 'Finances', level: 1 });

    const table = await screen.findByRole('table');
    expect(table.parentElement).toHaveClass('hidden', 'md:block');
    // La version mobile est présente dans le DOM avec la même donnée.
    expect(screen.getAllByText('AV-0001').length).toBeGreaterThan(1);
  });

  it('garde une navigation accessible et un lien d’évitement', async () => {
    renderApp('/finances');
    await screen.findByRole('heading', { name: 'Finances', level: 1 });

    expect(screen.getByRole('link', { name: /Aller au contenu/ })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: /Navigation principale/i });
    expect(within(nav).getByRole('link', { name: 'Finances' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Mes achats' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Mes dépenses' })).toBeInTheDocument();
  });
});

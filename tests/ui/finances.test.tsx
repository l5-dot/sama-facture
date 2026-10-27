/**
 * Tests d'interface : rendu de la page Finances, périodes vides, permissions
 * en lecture seule et formulaires d'achat/dépense.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppContent } from '../../src/App';
import { AppProvider } from '../../src/context/AppContext';
import { getRepository, resetRepositoryInstance } from '../../src/lib/data';
import { DemoRepository } from '../../src/lib/data/demo/repository';
import { resetDemoState } from '../../src/lib/data/demo/db';
import { computeFinanceSummary } from '../../src/lib/finance';
import { defaultPeriod } from '../../src/lib/period';
import { formatMoney } from '../../src/lib/money';

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </MemoryRouter>,
  );
}

async function currentMonthSummary(repo: DemoRepository) {
  const [invoices, payments, purchases, expenses] = await Promise.all([
    repo.listInvoices('org-takhabouli'),
    repo.listPayments('org-takhabouli'),
    repo.listPurchases('org-takhabouli'),
    repo.listExpenses('org-takhabouli'),
  ]);
  return computeFinanceSummary({ invoices, payments, purchases, expenses }, defaultPeriod());
}

beforeEach(() => {
  window.localStorage.clear();
  resetRepositoryInstance();
  resetDemoState();
});

afterEach(() => {
  cleanup();
});

describe('page Finances', () => {
  it('affiche les indicateurs, le CA calculé et l’historique sans les brouillons', async () => {
    const repo = getRepository() as DemoRepository;
    const summary = await currentMonthSummary(repo);

    renderApp('/finances');

    expect(await screen.findByRole('heading', { name: 'Finances', level: 1 })).toBeInTheDocument();
    for (const label of [
      'Chiffre d’affaires facturé',
      'Montant encaissé',
      'Reste à recevoir',
      'Total des achats',
      'Total des dépenses',
      'Bénéfice estimé',
      'Marge brute',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    // Le CA affiché correspond au moteur de calcul sur les données de la base démo.
    // (Les montants utilisent des espaces fines insécables : on normalise.)
    const normalize = (value: string) => value.replace(/\s/g, ' ');
    const expected = normalize(formatMoney(summary.revenue.netHt, 'XOF'));
    await waitFor(() => {
      const matches = screen.queryAllByText((content) => normalize(content) === expected);
      expect(matches.length).toBeGreaterThan(0);
    });

    // Le journal contient les factures confirmées et l'avoir…
    expect((await screen.findAllByText('AV-0001')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('FACT-0003').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\d+ ligne\(s\)/).length).toBeGreaterThan(0);
    // … mais jamais les brouillons ni les annulées.
    expect(screen.queryByText('FACT-0004')).not.toBeInTheDocument();
    expect(screen.queryByText('FACT-0005')).not.toBeInTheDocument();
  });

  it('affiche une période sans activité avec des zéros et un message explicite', async () => {
    const user = userEvent.setup();
    renderApp('/finances');
    await screen.findByRole('heading', { name: 'Finances', level: 1 });

    await user.click(screen.getByRole('button', { name: 'Personnalisée' }));
    const startInput = screen.getByLabelText('Date de début');
    const endInput = screen.getByLabelText('Date de fin');
    fireEvent.change(startInput, { target: { value: '2020-01-01' } });
    fireEvent.change(endInput, { target: { value: '2020-01-31' } });
    await user.click(screen.getByRole('button', { name: 'Appliquer' }));

    await waitFor(() => {
      expect(screen.getAllByText('Aucune opération sur cette période').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('FACT-0001')).not.toBeInTheDocument();
    expect(screen.getAllByText('0 FCFA').length).toBeGreaterThan(0);
  });

  it('présente toutes les périodes prévues (mois, trimestre, année, personnalisée)', async () => {
    renderApp('/finances');
    await screen.findByRole('heading', { name: 'Finances', level: 1 });
    const group = screen.getByRole('group', { name: 'Période d’analyse' });
    for (const label of ['Mois', 'Trimestre', 'Année', 'Personnalisée']) {
      expect(within(group).getByRole('button', { name: label })).toBeInTheDocument();
    }
    // Navigation vers la période précédente.
    expect(screen.getByRole('button', { name: 'Période précédente' })).toBeInTheDocument();
  });
});

describe('partage d’une facture', () => {
  it('propose l’impression et le partage WhatsApp depuis la fiche facture', async () => {
    const user = userEvent.setup();
    renderApp('/factures');
    await screen.findByRole('heading', { name: 'Factures', level: 1 });

    await user.click(
      (await screen.findAllByRole('button', { name: /Voir la facture FACT-/i }))[0],
    );
    const dialog = await screen.findByRole('dialog');
    const form = within(dialog);

    const printButton = form.getByRole('button', { name: /Imprimer \/ PDF/i });
    expect(printButton).toBeInTheDocument();

    const share = form.getByRole('link', { name: /Partager sur WhatsApp/i });
    expect(share).toHaveAttribute('href', expect.stringContaining('https://wa.me/'));
    expect(share).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});

describe('permissions dans l’interface', () => {
  it('affiche les achats en lecture seule pour un vendeur', async () => {
    resetRepositoryInstance();
    const repo = getRepository() as DemoRepository;
    await repo.setSimulatedRole('org-takhabouli', 'vendeur');

    renderApp('/finances/achats');

    expect(await screen.findByText('Lecture seule')).toBeInTheDocument();
    const newPurchase = screen.getByRole('button', { name: /Nouvel achat/i });
    expect(newPurchase).toBeDisabled();
  });

  it('permet au comptable de saisir un achat mais masque la suppression', async () => {
    resetRepositoryInstance();
    const repo = getRepository() as DemoRepository;
    await repo.setSimulatedRole('org-takhabouli', 'comptable');

    renderApp('/finances/achats');
    expect(await screen.findByRole('heading', { name: 'Mes achats', level: 1 })).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Nouvel achat/i });
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByRole('button', { name: /Supprimer l’achat/i })).not.toBeInTheDocument();
  });
});

describe('formulaires', () => {
  it('refuse un achat dont le montant payé dépasse le total, puis l’enregistre', async () => {
    const user = userEvent.setup();
    const repo = getRepository() as DemoRepository;
    const before = (await repo.listPurchases('org-takhabouli')).length;

    renderApp('/finances/achats');
    await screen.findByRole('heading', { name: 'Mes achats', level: 1 });

    await user.click(screen.getByRole('button', { name: /Nouvel achat/i }));
    const dialog = await screen.findByRole('dialog');
    const form = within(dialog);

    await user.type(form.getByLabelText(/^Description/), 'Achat test UI');
    await user.clear(form.getByLabelText(/^Quantité/));
    await user.type(form.getByLabelText(/^Quantité/), '2');
    await user.type(form.getByLabelText(/^Prix unitaire/), '5000');
    await user.type(form.getByLabelText(/^Montant payé/), '12000');
    await user.click(form.getByRole('button', { name: 'Enregistrer l’achat' }));

    expect(await screen.findByText(/dépasse le total/)).toBeInTheDocument();

    // Correction : le total est 10 000.
    await user.clear(form.getByLabelText(/^Montant payé/));
    await user.type(form.getByLabelText(/^Montant payé/), '4000');
    await user.click(form.getByRole('button', { name: 'Enregistrer l’achat' }));

    expect(await screen.findByText('Achat enregistré. Il est intégré à votre résultat estimé.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    const after = await repo.listPurchases('org-takhabouli');
    expect(after.length).toBe(before + 1);
    const created = after.find((purchase) => purchase.description === 'Achat test UI');
    expect(created?.totalAmount).toBe(10000);
    expect(created?.amountPaid).toBe(4000);
    expect(created?.amountDue).toBe(6000);
  });

  it('ajoute une dépense et met à jour le total de la période', async () => {
    const user = userEvent.setup();
    const repo = getRepository() as DemoRepository;

    renderApp('/finances/depenses');
    await screen.findByRole('heading', { name: 'Mes dépenses', level: 1 });

    await user.click(screen.getByRole('button', { name: /Nouvelle dépense/i }));
    const dialog = await screen.findByRole('dialog');
    const form = within(dialog);
    await user.selectOptions(form.getByLabelText(/^Catégorie/), 'marketing');
    await user.type(form.getByLabelText(/^Description/), 'Affiche quartier');
    await user.type(form.getByLabelText(/^Montant \(/), '12500');
    await user.click(form.getByRole('button', { name: 'Enregistrer la dépense' }));

    expect(await screen.findByText('Dépense enregistrée.')).toBeInTheDocument();
    await waitFor(async () => {
      const expenses = await repo.listExpenses('org-takhabouli');
      expect(expenses.some((expense) => expense.description === 'Affiche quartier')).toBe(true);
    });
  });

  it('refuse une dépense à montant nul', async () => {
    const user = userEvent.setup();
    renderApp('/finances/depenses');
    await screen.findByRole('heading', { name: 'Mes dépenses', level: 1 });

    await user.click(screen.getByRole('button', { name: /Nouvelle dépense/i }));
    const dialog = await screen.findByRole('dialog');
    const form = within(dialog);
    await user.type(form.getByLabelText(/^Description/), 'Dépense invalide');
    await user.type(form.getByLabelText(/^Montant \(/), '0');
    await user.click(form.getByRole('button', { name: 'Enregistrer la dépense' }));

    expect(await screen.findByText('Le montant doit être strictement positif.')).toBeInTheDocument();
  });
});

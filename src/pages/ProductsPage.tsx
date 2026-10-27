import { useMemo, useState } from 'react';
import { Package, Pencil, Plus, Search } from 'lucide-react';
import { useApp, messageFromError } from '../context/AppContext';
import { useDocumentTitle } from '../lib/hooks';
import { formatMoney, formatPercent, ratio } from '../lib/money';
import { canManageInvoices } from '../lib/permissions';
import type { Product } from '../lib/types';
import type { ProductInput } from '../lib/data/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Money,
  SectionHeading,
  Textarea,
} from '../components/ui';

function ProductFormModal({
  open,
  product,
  currency,
  onClose,
  onSubmit,
}: {
  open: boolean;
  product: Product | null;
  currency: string;
  onClose: () => void;
  onSubmit: (input: ProductInput) => Promise<void>;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [unit, setUnit] = useState(product?.unit ?? 'unité');
  const [unitPrice, setUnitPrice] = useState(String(product?.unitPrice ?? ''));
  const [costPrice, setCostPrice] = useState(product?.costPrice !== null && product?.costPrice !== undefined ? String(product.costPrice) : '');
  const [taxRate, setTaxRate] = useState(String(product?.taxRate ?? '0'));
  const [trackStock, setTrackStock] = useState(product?.trackStock ?? false);
  const [stockQuantity, setStockQuantity] = useState(String(product?.stockQuantity ?? '0'));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      setError('Le nom du produit est obligatoire.');
      return;
    }
    if (Number(unitPrice) < 0 || Number.isNaN(Number(unitPrice))) {
      setError('Le prix unitaire est invalide.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        id: product?.id,
        name: name.trim(),
        description: description.trim() || null,
        sku: sku.trim() || null,
        unit: unit.trim() || 'unité',
        unitPrice: Number(unitPrice || 0),
        costPrice: costPrice.trim() === '' ? null : Number(costPrice),
        taxRate: Number(taxRate || 0),
        trackStock,
        stockQuantity: Number(stockQuantity || 0),
      });
      onClose();
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? 'Modifier le produit' : 'Nouveau produit'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} loading={submitting}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {error && (
          <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
            {error}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom" htmlFor="product-name" required>
            <Input id="product-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} />
          </Field>
          <Field label="Référence (SKU)" htmlFor="product-sku">
            <Input id="product-sku" value={sku} onChange={(event) => setSku(event.target.value)} maxLength={60} />
          </Field>
          <Field label={`Prix de vente (${currency})`} htmlFor="product-price" required>
            <Input
              id="product-price"
              type="number"
              min="0"
              step="0.01"
              value={unitPrice}
              onChange={(event) => setUnitPrice(event.target.value)}
            />
          </Field>
          <Field label={`Coût d’achat (${currency})`} htmlFor="product-cost" hint="Indicatif : le COGS utilisé en finance vient des achats saisis.">
            <Input
              id="product-cost"
              type="number"
              min="0"
              step="0.01"
              value={costPrice}
              onChange={(event) => setCostPrice(event.target.value)}
            />
          </Field>
          <Field label="Unité" htmlFor="product-unit">
            <Input id="product-unit" value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={30} />
          </Field>
          <Field label="TVA (%)" htmlFor="product-tax">
            <Input
              id="product-tax"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={taxRate}
              onChange={(event) => setTaxRate(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Description" htmlFor="product-description">
          <Textarea
            id="product-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
          />
        </Field>
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 p-3">
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={trackStock}
              onChange={(event) => setTrackStock(event.target.checked)}
              className="size-4 rounded border-sand-300 text-brand-600"
            />
            Suivre le stock
          </label>
          <div className="w-32">
            <Field label="Stock actuel" htmlFor="product-stock">
              <Input
                id="product-stock"
                type="number"
                step="0.001"
                value={stockQuantity}
                onChange={(event) => setStockQuantity(event.target.value)}
                disabled={!trackStock}
              />
            </Field>
          </div>
          <p className="text-[11px] text-ink-500">
            Le stock est informatif : il n’est pas utilisé dans le calcul du résultat.
          </p>
        </div>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

export default function ProductsPage() {
  useDocumentTitle('Produits');
  const { data, dataLoading, activeOrg, currency, role, repo, refreshData, notify } = useApp();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formKey, setFormKey] = useState(0);

  const canWrite = canManageInvoices(role);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.products.filter((product) =>
      !needle
        ? true
        : [product.name, product.sku, product.description]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(needle),
    );
  }, [data.products, search]);

  const submit = async (input: ProductInput) => {
    if (!activeOrg) throw new Error('Aucune organisation active.');
    await repo.saveProduct(activeOrg.organization.id, input);
    notify('success', input.id ? 'Produit mis à jour.' : 'Produit créé.');
    await refreshData();
  };

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Ventes"
        title="Produits & services"
        description="Catalogue utilisé pour préremplir vos lignes de facture. Le coût d’achat indicatif ne remplace pas les achats saisis dans le module Finances."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormKey((value) => value + 1);
              setFormOpen(true);
            }}
            icon={<Plus className="size-4" />}
            disabled={!canWrite}
          >
            Nouveau produit
          </Button>
        }
      />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher un produit…"
          aria-label="Rechercher un produit"
          className="field pl-9"
        />
      </div>

      <Card>
        {dataLoading && data.products.length === 0 ? (
          <p className="p-6 text-sm text-ink-500">Chargement du catalogue…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Package className="size-5" />}
            title={data.products.length === 0 ? 'Aucun produit' : 'Aucun résultat'}
            description={
              data.products.length === 0
                ? 'Créez vos produits et services pour facturer plus vite.'
                : 'Modifiez votre recherche.'
            }
          />
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Catalogue des produits et services</caption>
              <thead>
                <tr className="border-b border-sand-200 bg-sand-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
                  <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">Produit</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Unité</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Prix de vente</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Coût indicatif</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Marge</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">TVA</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium sm:px-5">Stock</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium sm:px-5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => {
                  const margin =
                    product.costPrice !== null ? ratio(product.unitPrice - product.costPrice, product.unitPrice) : null;
                  return (
                    <tr key={product.id} className="border-b border-sand-100 last:border-0 hover:bg-sand-50/60">
                      <td className="px-4 py-2.5 sm:px-5">
                        <p className="text-sm font-medium text-ink-900">{product.name}</p>
                        <p className="text-[11px] text-ink-500">{product.sku ?? product.description ?? '—'}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-ink-500">{product.unit}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <Money value={product.unitPrice} currency={currency} className="font-medium" />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-ink-500">
                        {product.costPrice !== null ? formatMoney(product.costPrice, currency) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs">
                        {margin !== null ? formatPercent(margin) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-ink-500">{product.taxRate} %</td>
                      <td className="px-4 py-2.5 text-right">
                        {product.trackStock ? (
                          <Badge tone={product.stockQuantity > 0 ? 'brand' : 'warning'}>
                            {product.stockQuantity} {product.unit}
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-ink-300">non suivi</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right sm:px-5">
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(product);
                              setFormKey((value) => value + 1);
                              setFormOpen(true);
                            }}
                            className="rounded-lg p-1.5 text-ink-500 hover:bg-sand-100 hover:text-ink-900"
                            aria-label={`Modifier ${product.name}`}
                          >
                            <Pencil className="size-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ProductFormModal
        key={`${editing?.id ?? 'new'}-${formKey}`}
        open={formOpen}
        product={editing}
        currency={currency}
        onClose={() => setFormOpen(false)}
        onSubmit={submit}
      />
    </div>
  );
}

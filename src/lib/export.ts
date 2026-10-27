/**
 * Export CSV du journal financier (compatible Excel FR : séparateur « ; »,
 * BOM UTF-8 et décimales à virgule).
 */

import type { FinanceJournalRow } from './types';

function csvCell(value: string | number): string {
  const text = String(value).replace(/"/g, '""');
  return /[";\n]/.test(text) ? `"${text}"` : text;
}

function numberCell(value: number): string {
  return value === 0 ? '0' : value.toFixed(2).replace('.', ',');
}

export function journalToCsv(rows: FinanceJournalRow[]): string {
  const header = [
    'Date',
    'Type',
    'Référence',
    'Tiers',
    'Catégorie',
    'Impact résultat HT',
    'TVA',
    'Montant TTC',
    'Encaissement',
    'Décaissement',
  ];
  const lines = rows.map((row) =>
    [
      row.occurredOn,
      row.source,
      row.reference,
      row.counterparty,
      row.category,
      numberCell(row.amountHt),
      numberCell(row.amountTax),
      numberCell(row.amountTtc),
      numberCell(row.cashIn),
      numberCell(row.cashOut),
    ]
      .map(csvCell)
      .join(';'),
  );
  return `\uFEFF${header.join(';')}\n${lines.join('\n')}\n`;
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

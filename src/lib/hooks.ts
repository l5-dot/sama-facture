import { useEffect } from 'react';

/** Titre de l'onglet, utile pour l'accessibilité et l'historique. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · Sama Facture`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

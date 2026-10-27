import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useDocumentTitle } from '../lib/hooks';
import { Button, EmptyState } from '../components/ui';

export default function NotFoundPage() {
  useDocumentTitle('Page introuvable');
  return (
    <div className="card">
      <EmptyState
        icon={<Compass className="size-5" />}
        title="Page introuvable"
        description="Cette adresse n’existe pas ou a été déplacée."
        action={
          <Link to="/">
            <Button size="sm">Retour au tableau de bord</Button>
          </Link>
        }
      />
    </div>
  );
}

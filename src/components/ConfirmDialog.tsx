import { AlertTriangle } from 'lucide-react';
import { Button, Modal } from './ui';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmer',
  onConfirm,
  onClose,
  loading = false,
  danger = true,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  loading?: boolean;
  danger?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => void onConfirm()} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-danger-50 text-danger-500">
          <AlertTriangle className="size-5" />
        </span>
        <p className="text-sm leading-relaxed text-ink-700">{description}</p>
      </div>
    </Modal>
  );
}

import type { SessionDto } from '@rastro/shared';
import { ConfirmDialog, ErrorMessage } from '../../shared/ui';
import { useDeleteSession } from './api';

interface DeleteSessionDialogProps {
  session: SessionDto | null;
  onClose: () => void;
  onDeleted?: () => void;
}

/** Confirma y elimina una sesión con sus eventos y su video. */
export function DeleteSessionDialog({ session, onClose, onDeleted }: DeleteSessionDialogProps) {
  const remove = useDeleteSession();
  return (
    <ConfirmDialog
      open={session !== null}
      title="¿Eliminar la sesión?"
      danger
      confirmLabel="Eliminar"
      loading={remove.isPending}
      description={
        <>
          <p>
            Se borrarán <strong>{session?.objective.sessionName}</strong>, sus eventos y su video. No se puede deshacer.
          </p>
          <ErrorMessage error={remove.error} />
        </>
      }
      onCancel={() => {
        remove.reset();
        onClose();
      }}
      onConfirm={() => {
        if (!session) return;
        remove.mutate(session.id, {
          onSuccess: () => {
            onClose();
            onDeleted?.();
          },
        });
      }}
    />
  );
}

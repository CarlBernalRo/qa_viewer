import type { SessionDto } from '@rastro/shared';
import { useEffect, useState } from 'react';
import { sessionDurationMs } from '../../../shared/lib/format';
import { useReviewMutations } from '../../sessions/api';
import type { MarkerDraft } from './MarkerForm';

/**
 * Marcar un momento mientras se graba. El momento se toma al tocar "Marcar", no al
 * guardar: aunque escribir la nota tarde unos segundos, la marca apunta a lo que se vio.
 */
export function useMarkNow(session: SessionDto) {
  const { addMarker } = useReviewMutations(session.id);
  const [markingAt, setMarkingAt] = useState<number | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (lastSavedAt === null) return;
    const timer = setTimeout(() => setLastSavedAt(null), 3000);
    return () => clearTimeout(timer);
  }, [lastSavedAt]);

  return {
    marking: markingAt !== null,
    markingAt,
    lastSavedAt,
    pending: addMarker.isPending,
    error: addMarker.error,
    start: () => {
      addMarker.reset();
      setMarkingAt(sessionDurationMs(session.startedAt, undefined, Date.now()));
    },
    cancel: () => setMarkingAt(null),
    submit: (draft: MarkerDraft) => {
      if (markingAt === null) return;
      const t = markingAt;
      addMarker.mutate(
        { ...draft, t },
        {
          onSuccess: () => {
            setMarkingAt(null);
            setLastSavedAt(t);
          },
        },
      );
    },
  };
}

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../shared/api/queryKeys';
import styles from './ConnectionBanner.module.css';

/** Aviso fijo mientras no hay conexión en vivo con el backend. */
export function ConnectionBanner() {
  const { data: connected } = useQuery<boolean | null>({
    queryKey: queryKeys.liveConnection,
    queryFn: () => null,
    enabled: false,
    initialData: null,
  });
  if (connected !== false) return null;
  return (
    <div role="status" className={styles.banner}>
      <span className={styles.dot} aria-hidden="true" />
      Se perdió la conexión con el motor de captura. Reintentando…
    </div>
  );
}

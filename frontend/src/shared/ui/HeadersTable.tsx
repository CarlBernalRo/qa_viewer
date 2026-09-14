import styles from './HeadersTable.module.css';

/** Headers HTTP como tabla nombre → valor, plegable. */
export function HeadersTable({ title, headers }: { title: string; headers: Record<string, string> }) {
  const entries = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return null;
  return (
    <details className={styles.details}>
      <summary className={styles.summary}>
        {title} <span className={styles.count}>{entries.length}</span>
      </summary>
      <dl className={styles.table}>
        {entries.map(([name, value]) => (
          <div key={name} className={styles.row}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

import { ErrorMessage } from '../../shared/ui';
import type { useSessionReport } from '../sessions/api';
import styles from './ReportNotice.module.css';

/** Estado del informe PDF: generándose, guardado (con abrir / mostrar en carpeta) o con error. */
export function ReportNotice({ report }: { report: ReturnType<typeof useSessionReport> }) {
  const { exportReport, openReport } = report;
  if (exportReport.isIdle) return null;

  const close = () => {
    exportReport.reset();
    openReport.reset();
  };

  return (
    <div className={styles.notice} role="status">
      {exportReport.isPending && <span className={styles.text}>Generando el informe PDF…</span>}
      {exportReport.isError && (
        <div className={styles.text}>
          <ErrorMessage error={exportReport.error} />
        </div>
      )}
      {exportReport.data && (
        <>
          <span className={styles.text}>
            <strong>Informe guardado</strong> ({exportReport.data.findings}{' '}
            {exportReport.data.findings === 1 ? 'hallazgo' : 'hallazgos'}) en{' '}
            <span className="mono">{exportReport.data.path}</span>
          </span>
          <button
            type="button"
            className={styles.primary}
            disabled={openReport.isPending}
            onClick={() => openReport.mutate(false)}
          >
            Abrir PDF
          </button>
          <button
            type="button"
            className={styles.action}
            disabled={openReport.isPending}
            onClick={() => openReport.mutate(true)}
          >
            Mostrar en carpeta
          </button>
        </>
      )}
      {!exportReport.isPending && (
        <button type="button" className={styles.close} aria-label="Cerrar aviso" onClick={close}>
          ×
        </button>
      )}
      {openReport.error && (
        <div className={styles.full}>
          <ErrorMessage error={openReport.error} />
        </div>
      )}
    </div>
  );
}

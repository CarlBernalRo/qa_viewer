import { ApiRequestError } from '../api/ApiClient';
import styles from './ErrorMessage.module.css';

/** Muestra un error de la API (o cualquier error) con un mensaje claro para el usuario. */
export function ErrorMessage({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof ApiRequestError || error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
  return (
    <div className={styles.error} role="alert">
      {message}
    </div>
  );
}

import { Button } from '../shared/ui/Button';
import styles from './SplashScreen.module.css';

interface SplashScreenProps {
  message: string;
  error?: string;
}

export function SplashScreen({ message, error }: SplashScreenProps) {
  return (
    <main className={styles.splash}>
      <div className={styles.brand}>
        <span className={styles.dot} aria-hidden="true" />
        Rastro
      </div>
      <p className={styles.message}>{message}</p>
      {error && (
        <>
          <pre className={styles.error}>{error}</pre>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reintentar
          </Button>
        </>
      )}
    </main>
  );
}

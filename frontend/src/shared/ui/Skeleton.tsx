import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../lib/cx';
import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  radius?: CSSProperties['borderRadius'];
  className?: string;
}

/** Bloque gris animado que ocupa el lugar del contenido mientras carga. */
export function Skeleton({ width = '100%', height = 14, radius = 4, className }: SkeletonProps) {
  return <span className={cx(styles.skeleton, className)} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

/** Contenedor que anuncia "Cargando…" a lectores de pantalla y muestra los bloques. */
export function SkeletonGroup({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx(styles.group, className)} aria-busy="true" role="status">
      <span className={styles.srOnly}>{label}</span>
      {children}
    </div>
  );
}

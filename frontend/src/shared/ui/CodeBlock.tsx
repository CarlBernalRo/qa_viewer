import styles from './CodeBlock.module.css';

/** Muestra un cuerpo de texto; si es JSON válido, lo formatea. */
export function CodeBlock({ content, maxHeight = 260 }: { content: string; maxHeight?: number }) {
  let text = content;
  try {
    text = JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    // No es JSON: se muestra tal cual.
  }
  return (
    <pre className={styles.code} style={{ maxHeight }}>
      {text}
    </pre>
  );
}

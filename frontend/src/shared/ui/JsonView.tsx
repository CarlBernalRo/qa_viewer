import { useState } from 'react';
import { cx } from '../lib/cx';
import styles from './JsonView.module.css';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function Primitive({ value }: { value: Exclude<Json, Json[] | { [key: string]: Json }> }) {
  if (value === null) return <span className={styles.null}>null</span>;
  if (typeof value === 'string') return <span className={styles.string}>"{value}"</span>;
  if (typeof value === 'number') return <span className={styles.number}>{value}</span>;
  return <span className={styles.boolean}>{String(value)}</span>;
}

function Key({ name }: { name: string | number | undefined }) {
  if (name === undefined) return null;
  return typeof name === 'number' ? (
    <span className={styles.index}>{name}: </span>
  ) : (
    <span className={styles.key}>"{name}": </span>
  );
}

function Node({ name, value, depth, expandDepth }: { name?: string | number; value: Json; depth: number; expandDepth: number }) {
  const [open, setOpen] = useState(depth < expandDepth);
  const isArray = Array.isArray(value);
  if (value === null || typeof value !== 'object') {
    return (
      <div className={styles.line}>
        <Key name={name} />
        <Primitive value={value} />
      </div>
    );
  }
  const entries: Array<[string | number, Json]> = isArray
    ? value.map((item, index) => [index, item])
    : Object.entries(value);
  const [openChar, closeChar] = isArray ? ['[', ']'] : ['{', '}'];
  const summary = isArray ? `${entries.length} elementos` : `${entries.length} claves`;

  return (
    <div className={styles.node}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={cx(styles.caret, open && styles.caretOpen)} aria-hidden="true">
          ▸
        </span>
        <Key name={name} />
        <span className={styles.punct}>{openChar}</span>
        {!open && (
          <>
            <span className={styles.summary}> {summary} </span>
            <span className={styles.punct}>{closeChar}</span>
          </>
        )}
      </button>
      {open && (
        <>
          <div className={styles.children}>
            {entries.map(([key, child]) => (
              <Node key={String(key)} name={key} value={child} depth={depth + 1} expandDepth={expandDepth} />
            ))}
          </div>
          <div className={styles.punct}>{closeChar}</div>
        </>
      )}
    </div>
  );
}

/** Árbol de JSON legible: colores por tipo y nodos que se pliegan. */
export function JsonView({ value, expandDepth = 2 }: { value: unknown; expandDepth?: number }) {
  return (
    <div className={styles.tree}>
      <Node value={value as Json} depth={0} expandDepth={expandDepth} />
    </div>
  );
}

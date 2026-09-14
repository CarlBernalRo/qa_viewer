import { useMemo, useState } from 'react';
import { CodeBlock } from './CodeBlock';
import { IconCopy } from './icons';
import { JsonView } from './JsonView';
import { SegmentedControl } from './SegmentedControl';
import styles from './BodyView.module.css';

function tryParse(content: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(content) };
  } catch {
    return { ok: false };
  }
}

/** Muestra un cuerpo (request, respuesta, frame): árbol si es JSON, texto si no. */
export function BodyView({ content, title }: { content: string; title: string }) {
  const parsed = useMemo(() => tryParse(content), [content]);
  const [mode, setMode] = useState<'tree' | 'raw'>('tree');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={styles.body}>
      <div className={styles.toolbar}>
        <span className="cap">{title}</span>
        <div className={styles.tools}>
          {parsed.ok && (
            <SegmentedControl<'tree' | 'raw'>
              ariaLabel={`Formato de ${title}`}
              options={[
                { value: 'tree', label: 'Árbol' },
                { value: 'raw', label: 'Texto' },
              ]}
              value={mode}
              onChange={setMode}
            />
          )}
          <button type="button" className={styles.copy} onClick={() => void copy()} aria-label={`Copiar ${title}`}>
            <IconCopy width={14} height={14} />
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </div>
      {parsed.ok && mode === 'tree' ? <JsonView value={parsed.value} /> : <CodeBlock content={content} />}
    </div>
  );
}

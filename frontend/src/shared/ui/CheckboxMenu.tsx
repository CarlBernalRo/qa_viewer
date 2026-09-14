import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';
import styles from './DropdownMenu.module.css';
import { usePopoverPosition } from './usePopoverPosition';

export interface CheckboxOption<T extends string> {
  value: T;
  label: string;
  checked: boolean;
  color?: string;
  count?: number;
}

interface CheckboxMenuProps<T extends string> {
  label: ReactNode;
  options: CheckboxOption<T>[];
  onToggle: (value: T) => void;
  onSelectAll: () => void;
}

/** Desplegable con casillas: queda abierto mientras se marcan opciones. Se dibuja en <body>. */
export function CheckboxMenu<T extends string>({ label, options, onToggle, onSelectAll }: CheckboxMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const position = usePopoverPosition(open, triggerRef, menuRef, 'start');

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const allChecked = options.every((option) => option.checked);

  return (
    <div className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
        <span className={cx(styles.caret, open && styles.caretOpen)} aria-hidden="true">
          ▾
        </span>
      </button>
      {open &&
        createPortal(
          <div ref={menuRef} id={menuId} className={styles.menu} style={position}>
            {options.map((option) => (
              <label key={option.value} className={styles.checkItem}>
                <input type="checkbox" checked={option.checked} onChange={() => onToggle(option.value)} />
                {option.color && <span className={styles.swatch} style={{ background: option.color }} aria-hidden="true" />}
                <span className={styles.checkLabel}>{option.label}</span>
                {option.count !== undefined && <span className={styles.checkCount}>{option.count}</span>}
              </label>
            ))}
            <div className={styles.menuFooter}>
              <button type="button" className={styles.linkButton} onClick={onSelectAll} disabled={allChecked}>
                Mostrar todos
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

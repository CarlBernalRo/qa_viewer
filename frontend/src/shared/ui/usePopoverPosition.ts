import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

const GAP = 6;
const EDGE = 12;

/**
 * Posición fija (relativa a la ventana) para un menú que se dibuja en <body>:
 * ninguna tarjeta con overflow lo recorta. Se abre hacia arriba si abajo no entra,
 * no se sale por los costados y, si es muy largo, limita su alto para hacer scroll.
 */
export function usePopoverPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  popoverRef: RefObject<HTMLElement | null>,
  align: 'start' | 'end' = 'start',
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ top: -9999, left: -9999 });

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) return;
    const rect = anchor.getBoundingClientRect();
    const width = popover.offsetWidth;
    const height = popover.scrollHeight;
    const spaceBelow = window.innerHeight - rect.bottom - GAP - EDGE;
    const spaceAbove = rect.top - GAP - EDGE;
    const below = height <= spaceBelow || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(120, below ? spaceBelow : spaceAbove);
    const shown = Math.min(height, maxHeight);
    const preferredLeft = align === 'end' ? rect.right - width : rect.left;
    setStyle({
      top: below ? rect.bottom + GAP : rect.top - GAP - shown,
      left: Math.min(Math.max(EDGE, preferredLeft), window.innerWidth - width - EDGE),
      maxHeight,
    });
  }, [anchorRef, popoverRef, align]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  return style;
}

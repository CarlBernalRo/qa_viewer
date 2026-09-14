import { useCallback, useState } from 'react';

/** Mide el ancho de un elemento y lo actualiza cuando cambia (ventana, paneles, etc.). */
export function useElementWidth<T extends HTMLElement>(): [(node: T | null) => void | (() => void), number] {
  const [width, setWidth] = useState(0);
  const ref = useCallback((node: T | null) => {
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

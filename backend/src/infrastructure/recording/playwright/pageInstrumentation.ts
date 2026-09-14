/**
 * Se ejecuta DENTRO de la página grabada (Playwright serializa el código de esta
 * función). Por eso debe ser autocontenida: no puede usar nada del módulo.
 *
 * Emite acciones del usuario (con selector y rectángulo, para los overlays) y
 * métricas de rendimiento hacia el backend mediante `window.__rastroEmit`.
 */
export function pageInstrumentation(options: { actions: boolean; performance: boolean }): void {
  const w = window as unknown as {
    __rastroEmit?: (payload: unknown) => Promise<void>;
    __rastroInstalled?: boolean;
  };
  if (window.top !== window || w.__rastroInstalled) return;
  w.__rastroInstalled = true;

  const send = (payload: unknown): void => {
    try {
      void w.__rastroEmit?.(payload).catch(() => undefined);
    } catch {
      // La conexión con el grabador ya no existe.
    }
  };

  if (options.actions) {
    const clip = (text: string, max: number): string =>
      text.length > max ? `${text.slice(0, max)}…` : text;
    const escapeCss = (value: string): string =>
      window.CSS && typeof CSS.escape === 'function' ? CSS.escape(value) : value.replace(/[^\w-]/g, '\\$&');
    const quote = (value: string): string => value.replace(/"/g, '\\"');

    const selectorOf = (el: Element): string => {
      if (el.id) return `#${escapeCss(el.id)}`;
      for (const attr of ['data-testid', 'data-test', 'data-qa', 'data-cy']) {
        const value = el.getAttribute(attr);
        if (value) return `[${attr}="${quote(value)}"]`;
      }
      const name = el.getAttribute('name');
      if (name && /^(input|select|textarea|button)$/i.test(el.tagName)) {
        return `${el.tagName.toLowerCase()}[name="${quote(name)}"]`;
      }
      const parts: string[] = [];
      let node: Element | null = el;
      while (node && node !== document.body && parts.length < 4) {
        if (node.id) {
          parts.unshift(`#${escapeCss(node.id)}`);
          break;
        }
        let part = node.tagName.toLowerCase();
        const parent: Element | null = node.parentElement;
        if (parent) {
          const tag = node.tagName;
          const siblings = Array.from(parent.children).filter((child) => child.tagName === tag);
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
        parts.unshift(part);
        node = parent;
      }
      return parts.join(' > ');
    };

    const labelOf = (el: Element): string | undefined => {
      const text =
        el.getAttribute('aria-label') ||
        ((el as HTMLElement).innerText || '').trim() ||
        el.getAttribute('placeholder') ||
        el.getAttribute('title') ||
        el.getAttribute('name') ||
        '';
      return text ? clip(text.replace(/\s+/g, ' '), 80) : undefined;
    };

    const valueOf = (el: Element): string | undefined => {
      if (el instanceof HTMLInputElement) {
        if (el.type === 'password') return '[oculto]';
        if (el.type === 'checkbox' || el.type === 'radio') return String(el.checked);
        return clip(el.value, 200);
      }
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return clip(el.value, 200);
      return undefined;
    };

    const targetOf = (event: Event): Element | null => {
      const target = event.composedPath()[0];
      return target instanceof Element ? target : null;
    };

    const emitAction = (action: string, el: Element, extra: Record<string, unknown> = {}): void => {
      const rect = el.getBoundingClientRect();
      const label = labelOf(el);
      send({
        type: 'action',
        action,
        selector: selectorOf(el),
        ...(label ? { label } : {}),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        },
        viewport: { w: window.innerWidth, h: window.innerHeight },
        ...extra,
      });
    };

    const INTERACTIVE = 'a,button,[role="button"],input,select,textarea,label,summary';
    document.addEventListener(
      'click',
      (event) => {
        const el = targetOf(event);
        if (el) emitAction('click', el.closest(INTERACTIVE) ?? el);
      },
      true,
    );

    const inputTimers = new WeakMap<Element, number>();
    document.addEventListener(
      'input',
      (event) => {
        const el = targetOf(event);
        if (!el) return;
        const previous = inputTimers.get(el);
        if (previous) window.clearTimeout(previous);
        const timer = window.setTimeout(() => {
          const value = valueOf(el);
          emitAction('input', el, value !== undefined ? { value } : {});
        }, 600);
        inputTimers.set(el, timer);
      },
      true,
    );

    document.addEventListener(
      'change',
      (event) => {
        const el = targetOf(event);
        const isChoice =
          el instanceof HTMLSelectElement ||
          (el instanceof HTMLInputElement && /checkbox|radio|file/.test(el.type));
        if (el && isChoice) {
          const value = valueOf(el);
          emitAction('change', el, value !== undefined ? { value } : {});
        }
      },
      true,
    );

    document.addEventListener(
      'submit',
      (event) => {
        const el = targetOf(event);
        if (el) emitAction('submit', el);
      },
      true,
    );

    document.addEventListener(
      'keydown',
      (event) => {
        if (!['Enter', 'Escape', 'Tab'].includes(event.key)) return;
        const el = targetOf(event);
        if (el) emitAction('keydown', el, { key: event.key });
      },
      true,
    );
  }

  if (options.performance && 'PerformanceObserver' in window) {
    const observe = (
      type: string,
      onEntries: (entries: PerformanceEntry[]) => void,
      extra: Record<string, unknown> = {},
    ): void => {
      try {
        new PerformanceObserver((list) => onEntries(list.getEntries())).observe({
          type,
          buffered: true,
          ...extra,
        } as PerformanceObserverInit);
      } catch {
        // El navegador no soporta este tipo de entrada.
      }
    };

    observe('largest-contentful-paint', (entries) => {
      const last = entries[entries.length - 1];
      if (last) send({ type: 'vital', name: 'LCP', value: Math.round(last.startTime) });
    });

    let cls = 0;
    observe('layout-shift', (entries) => {
      for (const entry of entries as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>) {
        if (!entry.hadRecentInput && entry.value) cls += entry.value;
      }
      send({ type: 'vital', name: 'CLS', value: Math.round(cls * 1000) / 1000 });
    });

    let inp = 0;
    observe(
      'event',
      (entries) => {
        for (const entry of entries as Array<PerformanceEntry & { interactionId?: number }>) {
          if (entry.interactionId && entry.duration > inp) {
            inp = entry.duration;
            send({ type: 'vital', name: 'INP', value: Math.round(inp) });
          }
        }
      },
      { durationThreshold: 40 },
    );

    observe('longtask', (entries) => {
      for (const entry of entries) {
        send({ type: 'vital', name: 'long-task', value: Math.round(entry.duration) });
      }
    });
  }
}

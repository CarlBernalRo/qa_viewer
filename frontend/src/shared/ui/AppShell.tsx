import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { cx } from '../lib/cx';
import { usePersistentState } from '../lib/usePersistentState';
import styles from './AppShell.module.css';
import {
  IconAgents,
  IconChevronLeft,
  IconChevronRight,
  IconCompare,
  IconEnvironments,
  IconProjects,
  IconSearch,
  IconSessions,
  IconSettings,
} from './icons';

interface AppShellProps {
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

const NAV = [
  { to: '/', label: 'Sesiones', end: true, icon: IconSessions },
  { to: '/hallazgos', label: 'Hallazgos', end: false, icon: IconSearch },
  { to: '/agentes', label: 'Agentes', end: false, icon: IconAgents },
  { to: '/proyectos', label: 'Proyectos', end: false, icon: IconProjects },
  { to: '/configuracion', label: 'Ajustes', end: false, icon: IconSettings },
];

// Etapa 4 de la visión de producto: comparar el mismo flujo entre ambientes o
// contra una sesión base. Tienen definición, pero no modelo de datos todavía.
const NAV_SOON = [
  { label: 'Ambientes', icon: IconEnvironments, soon: 'El mismo flujo grabado en DEV, QA, STG y PROD: qué cambió en tráfico, errores y pantallas. Etapa 4.' },
  { label: 'Comparaciones', icon: IconCompare, soon: 'Regresión contra una sesión base: tráfico nuevo, errores nuevos, cambios visuales. Etapa 4.' },
];

export function AppShell({ breadcrumb, actions, children }: AppShellProps) {
  // El menú arranca oculto; la preferencia se recuerda entre aperturas.
  const [collapsed, setCollapsed] = usePersistentState('rastro.sidebar.collapsed', true);

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button
          type="button"
          className={styles.menuToggle}
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expandir menú' : 'Ocultar menú'}
          aria-expanded={!collapsed}
          aria-controls="rastro-sidebar"
          title={collapsed ? 'Expandir menú' : 'Ocultar menú'}
        >
          {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>
        <div className={styles.brand}>
          <span className={styles.dot} aria-hidden="true" />
          Rastro
        </div>
        <div className={styles.breadcrumb}>{breadcrumb}</div>
        <div className={styles.actions}>{actions}</div>
      </header>
      <div className={styles.body}>
        <nav id="rastro-sidebar" className={cx(styles.nav, collapsed && styles.navCollapsed)} aria-label="Principal">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={({ isActive }) => cx(styles.navItem, isActive && styles.navActive)}
            >
              <item.icon />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
          <div className={styles.navDivider} role="separator" aria-hidden="true" />
          {NAV_SOON.map((item) => (
            <span
              key={item.label}
              className={cx(styles.navItem, styles.navSoon)}
              title={collapsed ? `${item.label} · ${item.soon}` : item.soon}
              aria-disabled="true"
            >
              <item.icon />
              {!collapsed && <span>{item.label}</span>}
            </span>
          ))}
          {!collapsed && (
            <div className={styles.navFooter}>
              <span className="cap">Etapa 3</span>
              <span>Agentes de IA</span>
            </div>
          )}
        </nav>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { cx } from '../lib/cx';
import { usePersistentState } from '../lib/usePersistentState';
import styles from './AppShell.module.css';
import { IconChevronLeft, IconChevronRight, IconSessions } from './icons';

interface AppShellProps {
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

// "Nueva sesión" vive como botón en la pantalla de sesiones, no en el menú.
const NAV = [{ to: '/', label: 'Sesiones', end: false, icon: IconSessions }];

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
          {!collapsed && (
            <div className={styles.navFooter}>
              <span className="cap">Etapa 1</span>
              <span>Grabación sin agentes</span>
            </div>
          )}
        </nav>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}

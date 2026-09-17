import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('muestra la navegación real y deja los ítems de etapa 4 sin enlace', () => {
    render(
      <MemoryRouter>
        <AppShell>contenido</AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Sesiones' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Hallazgos' })).toHaveAttribute('href', '/hallazgos');
    expect(screen.getByRole('link', { name: 'Agentes' })).toHaveAttribute('href', '/agentes');

    // Ambientes/Comparaciones/Ajustes del proyecto: visibles (por su title) pero sin navegación real.
    expect(screen.queryByRole('link', { name: /Ambientes/ })).not.toBeInTheDocument();
    expect(screen.getByTitle(/Ambientes ·/)).toBeInTheDocument();
  });

  it('renderiza el contenido de la página', () => {
    render(
      <MemoryRouter>
        <AppShell>contenido de prueba</AppShell>
      </MemoryRouter>,
    );
    expect(screen.getByText('contenido de prueba')).toBeInTheDocument();
  });
});

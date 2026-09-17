import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RosterAvatar } from './RosterAvatar';

describe('RosterAvatar', () => {
  it('dibuja ojos redondos como dos círculos animados', () => {
    const { container } = render(
      <RosterAvatar color="#123456" name="Funcional" eyeShape="round" animation="blink" gesture="tilt" />,
    );
    expect(container.querySelectorAll('circle[fill="#123456"]')).toHaveLength(3); // antena + 2 ojos
    expect(container.querySelectorAll('circle[style]')).toHaveLength(2); // los 2 ojos, animados
    expect(container.querySelector('svg')).toHaveAttribute('aria-label', 'Agente Funcional');
  });

  it('dibuja un visor como una sola barra animada', () => {
    const { container } = render(
      <RosterAvatar color="#123456" name="QA Lead" eyeShape="visor" animation="pulse" gesture="nod" />,
    );
    expect(container.querySelectorAll('rect[style]')).toHaveLength(1);
  });

  it('sin animar (agente todavía no implementado), los ojos quedan quietos', () => {
    const { container } = render(
      <RosterAvatar color="#123456" name="Carga" eyeShape="square" animation="pulse" gesture="turn" animate={false} />,
    );
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
    // La forma cuadrada sigue dibujándose, solo que sin animación.
    expect(container.querySelectorAll('rect[fill="#123456"]').length).toBeGreaterThanOrEqual(2);
  });
});

import { describe, expect, it } from 'vitest';
import { INITIAL_FORM, toCreateInput, validateCapture, validateObjective, type NewSessionForm } from './model';

const filled: NewSessionForm = {
  ...INITIAL_FORM,
  sessionName: 'Pago con tarjeta',
  statement: 'Comprobar que un cliente pueda pagar con tarjeta.',
  criteria: ['Un pago aprobado crea un pedido.', '  ', 'Si el cobro falla, se ve un error.'],
  startUrl: 'https://qa.mercadito.test/checkout',
};

describe('modelo de nueva sesión', () => {
  it('pide nombre, objetivo y al menos un criterio', () => {
    const errors = validateObjective(INITIAL_FORM);
    expect(errors.sessionName).toBeDefined();
    expect(errors.statement).toBeDefined();
    expect(errors.criteria).toBeDefined();
  });

  it('numera los criterios e ignora los vacíos', () => {
    const input = toCreateInput(filled);
    expect(input.objective.criteria.map((criterion) => criterion.id)).toEqual(['CA1', 'CA2']);
  });

  it('rechaza una URL que no es http(s)', () => {
    expect(validateCapture({ ...filled, startUrl: 'ftp://qa.test' }).startUrl).toBeDefined();
    expect(validateCapture(filled)).toEqual({});
  });
});

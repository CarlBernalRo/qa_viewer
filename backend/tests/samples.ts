import type { CreateSessionInput } from '@rastro/shared';

export function sampleInput(overrides: Partial<CreateSessionInput['capture']> = {}): CreateSessionInput {
  return {
    objective: {
      sessionName: 'Pago con tarjeta · v2.14.0',
      statement: 'Comprobar que un cliente pueda pagar con tarjeta y ver su pedido.',
      testType: 'funcional',
      criteria: [
        { id: 'CA1', text: 'Un pago aprobado crea un pedido en estado Pagado.' },
        { id: 'CA2', text: 'Si el cobro falla, el usuario ve un error.' },
      ],
      scope: { include: ['/checkout/*'], exclude: ['/api/recommendations'] },
    },
    capture: {
      startUrl: 'https://qa.mercadito.test/checkout',
      environment: 'QA',
      channels: ['actions', 'network', 'websocket', 'console', 'performance', 'video'],
      redaction: { presets: ['card-numbers', 'tokens-cookies', 'emails'], customPatterns: [] },
      analysisMode: 'none',
      ...overrides,
    },
  };
}

import { describe, expect, it } from 'vitest';
import { REDACTED, Redactor } from './Redactor.js';

const all = new Redactor({
  presets: ['card-numbers', 'tokens-cookies', 'emails', 'national-ids'],
  customPatterns: [],
});

describe('Redactor', () => {
  it('oculta números de tarjeta válidos (Luhn) y deja otros números', () => {
    expect(all.redactText('tarjeta 4242 4242 4242 4242')).toBe(`tarjeta ${REDACTED}`);
    expect(all.redactText('pedido 1234567890123456')).toBe('pedido 1234567890123456');
  });

  it('oculta emails y DNI con puntos', () => {
    expect(all.redactText('qa@mercadito.test / 30.123.456')).toBe(`${REDACTED} / ${REDACTED}`);
  });

  it('oculta headers de autenticación y cookies', () => {
    const headers = all.redactHeaders({ Authorization: 'Bearer abc', Accept: 'application/json' });
    expect(headers).toEqual({ Authorization: REDACTED, Accept: 'application/json' });
  });

  it('oculta parámetros sensibles de la URL', () => {
    const url = all.redactUrl('https://qa.test/checkout?access_token=eyJ&step=3');
    expect(url).toContain(`access_token=${encodeURIComponent(REDACTED)}`);
    expect(url).toContain('step=3');
  });

  it('oculta claves sensibles dentro de JSON anidado', () => {
    const body = all.redactBody(JSON.stringify({ card: { cvv: '123', holder: 'Ana' }, password: 'x' }));
    expect(JSON.parse(body)).toEqual({ card: { cvv: REDACTED, holder: 'Ana' }, password: REDACTED });
  });

  it('sin presets no oculta nada', () => {
    const none = new Redactor({ presets: [], customPatterns: [] });
    expect(none.redactText('qa@mercadito.test 4242424242424242')).toBe('qa@mercadito.test 4242424242424242');
  });

  it('aplica patrones propios e ignora los inválidos', () => {
    const custom = new Redactor({ presets: [], customPatterns: ['ORD-\\d+', '([invalido'] });
    expect(custom.redactText('pedido ORD-8821')).toBe(`pedido ${REDACTED}`);
  });

  it('oculta los datos de un evento de request completo', () => {
    const event = all.redactEvent({
      kind: 'http-request',
      pageId: 'p1',
      requestId: 'r1',
      method: 'POST',
      url: 'https://qa.test/api/orders?token=abc',
      resourceType: 'Fetch',
      headers: { cookie: 'sid=1' },
      postData: JSON.stringify({ cardNumber: '4242424242424242', amount: 10 }),
    });
    expect(event.kind === 'http-request' && event.headers.cookie).toBe(REDACTED);
    expect(event.kind === 'http-request' && JSON.parse(event.postData ?? '{}').cardNumber).toBe(REDACTED);
  });
});

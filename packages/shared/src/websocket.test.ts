import { describe, expect, it } from 'vitest';
import { decodeWsPayload } from './websocket.js';

describe('decodeWsPayload', () => {
  it('reconoce la apertura de Engine.IO con sus datos', () => {
    const decoded = decodeWsPayload('0{"sid":"abc","pingInterval":25000}');
    expect(decoded).toMatchObject({ protocol: 'engine.io', label: 'Engine.IO · conexión abierta' });
    expect(decoded.json).toEqual({ sid: 'abc', pingInterval: 25000 });
  });

  it('reconoce ping y pong', () => {
    expect(decodeWsPayload('2').label).toBe('Engine.IO · ping');
    expect(decodeWsPayload('3probe').label).toBe('Engine.IO · pong');
  });

  it('extrae el nombre del evento de Socket.IO', () => {
    const decoded = decodeWsPayload('42["order.status",{"status":"failed"}]');
    expect(decoded.label).toBe('Socket.IO · evento "order.status"');
    expect(decoded.json).toEqual(['order.status', { status: 'failed' }]);
  });

  it('marca como error el connect_error de Socket.IO', () => {
    const decoded = decodeWsPayload('44{"message":"not authorized","data":{"status_code":"jwt_token_invalid"}}');
    expect(decoded.isError).toBe(true);
    expect(decoded.label).toBe('Socket.IO · error de conexión: not authorized');
  });

  it('muestra el namespace de Socket.IO', () => {
    expect(decodeWsPayload('40/chat,{"sid":"x"}').label).toBe('Socket.IO · conectar en /chat');
  });

  it('entiende SIP y no trata el desafío 401 como error', () => {
    expect(decodeWsPayload('REGISTER sip:pbx.test SIP/2.0\r\nVia: x').label).toBe('SIP REGISTER');
    expect(decodeWsPayload('SIP/2.0 401 Unauthorized\r\nVia: x')).toMatchObject({ label: 'SIP 401 Unauthorized', isError: false });
    expect(decodeWsPayload('SIP/2.0 503 Service Unavailable').isError).toBe(true);
  });

  it('resume JSON común y deja el texto como está', () => {
    expect(decodeWsPayload('{"type":"cart.updated","items":3}').label).toBe('type: cart.updated');
    expect(decodeWsPayload('hola mundo')).toMatchObject({ protocol: 'text', label: 'hola mundo' });
  });
});

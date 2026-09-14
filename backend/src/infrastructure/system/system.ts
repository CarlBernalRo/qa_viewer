import { randomUUID } from 'node:crypto';
import type { Clock, IdGenerator } from '../../domain/ports.js';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export const SESSION_ID_PATTERN =
  /^ses_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class CryptoIdGenerator implements IdGenerator {
  sessionId(): string {
    return `ses_${randomUUID()}`;
  }

  eventId(): string {
    return randomUUID();
  }
}

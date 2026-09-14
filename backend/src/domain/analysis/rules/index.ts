import type { Rule } from '../rule.js';
import { ACCESSIBILITY_RULES } from './accessibility.js';
import { FRONTEND_RULES } from './frontend.js';
import { NETWORK_RULES } from './network.js';
import { PERFORMANCE_RULES } from './performance.js';
import { REALTIME_RULES } from './realtime.js';
import { SECURITY_RULES } from './security.js';

/** Todas las reglas fijas, en el orden del catálogo. */
export const ALL_RULES: readonly Rule[] = [
  ...NETWORK_RULES,
  ...SECURITY_RULES,
  ...ACCESSIBILITY_RULES,
  ...FRONTEND_RULES,
  ...REALTIME_RULES,
  ...PERFORMANCE_RULES,
];

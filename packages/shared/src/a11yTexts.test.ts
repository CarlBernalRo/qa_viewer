import { describe, expect, it } from 'vitest';
import { a11yRuleText } from './a11yTexts.js';

describe('a11yRuleText', () => {
  it('traduce las reglas que axe-core no trae en español, aunque la sesión se haya grabado en inglés', () => {
    expect(
      a11yRuleText({
        id: 'select-name',
        help: 'Select element must have an accessible name',
        description: 'Ensure select element has an accessible name',
      }).help,
    ).toBe('Los elementos select deben tener un nombre accesible');
  });

  it('deja el texto de axe en las demás reglas, sin restos de plantilla', () => {
    expect(
      a11yRuleText({ id: 'button-name', help: 'Los botones deben tener texto discernible{{~}}', description: 'Garantiza…' }),
    ).toEqual({ help: 'Los botones deben tener texto discernible', description: 'Garantiza…' });
  });
});

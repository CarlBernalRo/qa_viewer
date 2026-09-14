import type { TestType } from '@rastro/shared';
import { TEST_TYPE_DESCRIPTIONS, TEST_TYPE_LABELS } from '../../shared/lib/labels';
import { Field, Panel, Select, TagInput, TextArea, TextInput } from '../../shared/ui';
import { CriteriaEditor } from './CriteriaEditor';
import type { FieldErrors, NewSessionForm } from './model';
import styles from './NewSession.module.css';

interface StepProps {
  form: NewSessionForm;
  errors: FieldErrors;
  update: <K extends keyof NewSessionForm>(key: K, value: NewSessionForm[K]) => void;
}

export function ObjectiveStep({ form, errors, update }: StepProps) {
  return (
    <div className={styles.columns}>
      <div className={styles.form}>
        <div className={styles.intro}>
          <h1 className={styles.title}>¿Qué vas a comprobar en esta sesión?</h1>
          <p className={styles.lede}>El objetivo queda guardado con la grabación y guía su revisión.</p>
        </div>

        <div className={styles.row2}>
          <Field
            label="Nombre de la sesión"
            error={errors.sessionName}
            info="Cómo vas a reconocer esta grabación en la lista. Incluye el flujo y, si aplica, la versión: “Login con Google · v2.3”."
          >
            {(id, describedBy) => (
              <TextInput
                id={id}
                value={form.sessionName}
                placeholder="Pago con tarjeta · v2.14.0"
                onChange={(event) => update('sessionName', event.target.value)}
                invalid={Boolean(errors.sessionName)}
                aria-describedby={describedBy}
              />
            )}
          </Field>
          <Field
            label="Tipo de prueba"
            hint={TEST_TYPE_DESCRIPTIONS[form.testType]}
            info="Clasifica la sesión para encontrarla y reportarla después. No cambia qué se graba."
          >
            {(id, describedBy) => (
              <Select
                id={id}
                value={form.testType}
                aria-describedby={describedBy}
                onChange={(event) => update('testType', event.target.value as TestType)}
              >
                {Object.entries(TEST_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <Field
          label="Objetivo"
          hint="Una frase verificable: qué debe pasar para dar la prueba por buena."
          error={errors.statement}
          info="Escríbelo como un resultado que se puede comprobar, no como una tarea. Bien: “Un usuario con credenciales válidas entra y ve su panel”. Mal: “Probar el login”."
        >
          {(id, describedBy) => (
            <TextArea
              id={id}
              value={form.statement}
              placeholder="Comprobar que un cliente pueda pagar con tarjeta y que el pedido quede visible en Mis pedidos."
              onChange={(event) => update('statement', event.target.value)}
              invalid={Boolean(errors.statement)}
              aria-describedby={describedBy}
            />
          )}
        </Field>

        <Field
          label="Criterios de aceptación"
          error={errors.criteria}
          info="Condiciones concretas que se verifican una por una. Cada una recibe un id (CA1, CA2…) para nombrarla en el reporte. Ej.: “Con clave incorrecta aparece un mensaje que dice qué falló”."
        >
          {(id, describedBy) => (
            <CriteriaEditor
              id={id}
              criteria={form.criteria}
              onChange={(criteria) => update('criteria', criteria)}
              invalid={Boolean(errors.criteria)}
              describedBy={describedBy}
            />
          )}
        </Field>

        <div className={styles.row2}>
          <Field
            label="Dentro del alcance"
            optional
            hint="Escribe y pulsa Enter para agregar."
            info="Partes de la aplicación que importan en esta prueba: rutas como /login o /checkout/*, o endpoints como /api/auth/*. El * funciona como comodín. Hoy queda como referencia en la sesión; en la etapa 2 los agentes se enfocarán en esto."
          >
            {(id, describedBy) => (
              <TagInput
                id={id}
                values={form.include}
                onChange={(values) => update('include', values)}
                placeholder="/checkout/*"
                describedBy={describedBy}
              />
            )}
          </Field>
          <Field
            label="Fuera del alcance"
            optional
            info="Lo que no importa en esta prueba y puede distraer: analítica, recomendaciones, chat de soporte. Se sigue grabando igual; sirve para separarlo al revisar."
          >
            {(id) => (
              <TagInput
                id={id}
                values={form.exclude}
                onChange={(values) => update('exclude', values)}
                placeholder="/api/recommendations"
                variant="dashed"
              />
            )}
          </Field>
        </div>

        <div className={styles.row2}>
          <Field
            label="Datos de prueba"
            optional
            info="Usuarios, tarjetas de prueba o montos que usaste, para poder repetir la prueba. No escribas contraseñas reales."
          >
            {(id) => (
              <TextInput
                id={id}
                value={form.testData}
                placeholder="Tarjeta aprobada ····4242 · usuario qa.comprador"
                onChange={(event) => update('testData', event.target.value)}
              />
            )}
          </Field>
          <Field
            label="Historia o caso vinculado"
            optional
            info="El ticket de Jira, Azure DevOps u otra herramienta que describe lo que estás probando. Ej.: MERC-412."
          >
            {(id) => (
              <TextInput
                id={id}
                value={form.linkedIssue}
                placeholder="MERC-412"
                onChange={(event) => update('linkedIssue', event.target.value)}
              />
            )}
          </Field>
        </div>
      </div>

      <aside className={styles.aside}>
        <Panel title="Cómo se usa el objetivo">
          <ul className={styles.notes}>
            <li>Queda guardado junto a la grabación, para saber qué se quiso comprobar.</li>
            <li>Los criterios se numeran solos: CA1, CA2…</li>
            <li>El alcance separa lo que importa de lo que no, para revisar más rápido.</li>
            <li>En la etapa 2, los agentes evaluarán cada criterio con evidencia.</li>
          </ul>
        </Panel>
      </aside>
    </div>
  );
}

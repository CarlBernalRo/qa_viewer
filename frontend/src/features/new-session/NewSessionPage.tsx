import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useApi } from '../../app/providers/BackendProvider';
import { queryKeys } from '../../shared/api/queryKeys';
import { AppShell, Button, ErrorMessage, Stepper } from '../../shared/ui';
import { CaptureStep } from './CaptureStep';
import { INITIAL_FORM, toCreateInput, validateCapture, validateObjective, type FieldErrors, type NewSessionForm } from './model';
import styles from './NewSession.module.css';
import { ObjectiveStep } from './ObjectiveStep';

const STEPS = ['Objetivo', 'Captura', 'Grabar'] as const;

export function NewSessionPage() {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<NewSessionForm>(INITIAL_FORM);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});

  const update = <K extends keyof NewSessionForm>(key: K, value: NewSessionForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = useMutation({
    mutationFn: async (record: boolean) => {
      const session = await api.createSession(toCreateInput(form));
      if (record) await api.startRecording(session.id);
      return session;
    },
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
      navigate(`/sessions/${session.id}`);
    },
  });

  const goToCapture = () => {
    const found = validateObjective(form);
    setErrors(found);
    if (Object.keys(found).length === 0) setStep(1);
  };

  const finish = (record: boolean) => {
    const found = validateCapture(form);
    setErrors(found);
    if (Object.keys(found).length === 0) submit.mutate(record);
  };

  return (
    <AppShell
      breadcrumb={
        <>
          <Link to="/">Sesiones</Link>
          <span>/</span>
          <span className={styles.crumbCurrent}>Nueva sesión</span>
        </>
      }
    >
      <div className={styles.page}>
        <Stepper steps={STEPS} current={step} />

        {step === 0 ? (
          <ObjectiveStepWithActions form={form} errors={errors} update={update} onNext={goToCapture} />
        ) : (
          <>
            <CaptureStep form={form} errors={errors} update={update} />
            <ErrorMessage error={submit.error} />
            <div className={styles.actions}>
              <Button variant="record" size="lg" loading={submit.isPending && submit.variables === true} onClick={() => finish(true)}>
                Abrir navegador y grabar
              </Button>
              <Button size="lg" disabled={submit.isPending} onClick={() => finish(false)}>
                Guardar sin grabar
              </Button>
              <Button variant="ghost" size="lg" disabled={submit.isPending} onClick={() => setStep(0)}>
                Volver al objetivo
              </Button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function ObjectiveStepWithActions(props: Parameters<typeof ObjectiveStep>[0] & { onNext: () => void }) {
  const { onNext, ...stepProps } = props;
  return (
    <>
      <ObjectiveStep {...stepProps} />
      <div className={styles.actions}>
        <Button variant="primary" size="lg" onClick={onNext}>
          Continuar a la captura
        </Button>
      </div>
    </>
  );
}

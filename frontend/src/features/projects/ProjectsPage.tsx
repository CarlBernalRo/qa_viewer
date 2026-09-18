import type { ProjectDto } from '@rastro/shared';
import { useState } from 'react';
import {
  AppShell,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorMessage,
  Field,
  Panel,
  Skeleton,
  SkeletonGroup,
  TagInput,
  TextInput,
} from '../../shared/ui';
import { useCreateProject, useDeleteProject, useProjects, useUpdateProject } from './api';
import styles from './ProjectsPage.module.css';

function CreateProjectForm() {
  const [name, setName] = useState('');
  const create = useCreateProject();
  return (
    <form
      className={styles.createForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        create.mutate(
          { name: name.trim() },
          {
            onSuccess: () => setName(''),
          },
        );
      }}
    >
      <Field label="Nombre del proyecto">
        {(id) => (
          <TextInput
            id={id}
            value={name}
            placeholder="Empresa A"
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>
      <Button type="submit" variant="primary" loading={create.isPending} disabled={!name.trim()}>
        Crear proyecto
      </Button>
      <ErrorMessage error={create.error} />
    </form>
  );
}

function ProjectRow({ project }: { project: ProjectDto }) {
  const update = useUpdateProject();
  const remove = useDeleteProject();
  const [name, setName] = useState(project.name);
  // Estado local, no `project.apps`: dos ediciones seguidas no deben pisarse mientras la primera todavía no volvió del server.
  const [apps, setApps] = useState(project.apps);
  const [confirming, setConfirming] = useState(false);

  return (
    <li className={styles.row}>
      <div className={styles.rowHead}>
        <TextInput
          className={styles.nameInput}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            const trimmed = name.trim();
            if (trimmed && trimmed !== project.name) update.mutate({ id: project.id, name: trimmed });
            else setName(project.name);
          }}
        />
        <Button variant="ghost" onClick={() => setConfirming(true)}>
          Eliminar
        </Button>
      </div>
      <Field label="Apps" hint="Escribe y pulsa Enter para agregar (SIS, LMS, CRM…).">
        {() => (
          <TagInput
            values={apps}
            onChange={(next) => {
              setApps(next);
              update.mutate({ id: project.id, apps: next });
            }}
            placeholder="Agregar app…"
          />
        )}
      </Field>
      <ErrorMessage error={update.error} />
      <ConfirmDialog
        open={confirming}
        title="¿Eliminar el proyecto?"
        danger
        confirmLabel="Eliminar"
        loading={remove.isPending}
        description={
          <>
            <p>
              Se borrará <strong>{project.name}</strong>. Si tiene sesiones asignadas, no se puede eliminar.
            </p>
            <ErrorMessage error={remove.error} />
          </>
        }
        onCancel={() => {
          remove.reset();
          setConfirming(false);
        }}
        onConfirm={() => remove.mutate(project.id, { onSuccess: () => setConfirming(false) })}
      />
    </li>
  );
}

export function ProjectsPage() {
  const projects = useProjects();

  return (
    <AppShell breadcrumb={<span className={styles.crumb}>Proyectos</span>}>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Proyectos</h1>
          <p className={styles.lede}>
            Agrupa sesiones por cliente o empresa, y sus apps dentro de cada uno (SIS, LMS, CRM…). Se usa para
            filtrar Sesiones y Hallazgos.
          </p>
        </header>

        <Panel title="Nuevo proyecto">
          <CreateProjectForm />
        </Panel>

        <ErrorMessage error={projects.error} />

        <Panel title="Todos los proyectos" padded={false}>
          {projects.isPending ? (
            <SkeletonGroup label="Cargando proyectos…" className={styles.skeleton}>
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className={styles.skeletonRow}>
                  <Skeleton width="40%" height={16} />
                  <Skeleton width="60%" height={14} />
                </div>
              ))}
            </SkeletonGroup>
          ) : projects.data && projects.data.length > 0 ? (
            <ul className={styles.list}>
              {projects.data.map((project) => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Todavía no hay proyectos"
              description="Crea uno para poder asignarle sesiones y filtrar Sesiones y Hallazgos por él."
            />
          )}
        </Panel>
      </div>
    </AppShell>
  );
}

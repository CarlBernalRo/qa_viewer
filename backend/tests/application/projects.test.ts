import { describe, expect, it } from 'vitest';
import { createUseCases } from '../../src/application/index.js';
import { InvalidStateError, NotFoundError } from '../../src/domain/errors.js';
import { createTestDeps } from '../fakes.js';
import { sampleInput } from '../samples.js';

describe('proyectos', () => {
  it('crea, lista ordenado por nombre y edita nombre y apps', async () => {
    const useCases = createUseCases(createTestDeps());
    await useCases.createProject.execute({ name: 'Empresa B' });
    const a = await useCases.createProject.execute({ name: 'Empresa A' });

    expect((await useCases.listProjects.execute()).map((p) => p.name)).toEqual(['Empresa A', 'Empresa B']);

    const updated = await useCases.updateProject.execute(a.id, { apps: ['SIS', 'LMS'] });
    expect(updated).toMatchObject({ name: 'Empresa A', apps: ['SIS', 'LMS'] });
  });

  it('editar un proyecto que no existe da NotFoundError', async () => {
    const useCases = createUseCases(createTestDeps());
    await expect(useCases.updateProject.execute('nope', { name: 'x' })).rejects.toThrow(NotFoundError);
  });

  it('no deja borrar un proyecto con sesiones asignadas', async () => {
    const useCases = createUseCases(createTestDeps());
    const project = await useCases.createProject.execute({ name: 'Empresa A' });
    await useCases.createSession.execute(sampleInput({ projectId: project.id }));

    await expect(useCases.deleteProject.execute(project.id)).rejects.toThrow(InvalidStateError);
  });

  it('borra un proyecto sin sesiones asignadas', async () => {
    const useCases = createUseCases(createTestDeps());
    const project = await useCases.createProject.execute({ name: 'Empresa A' });
    await useCases.deleteProject.execute(project.id);
    expect(await useCases.listProjects.execute()).toEqual([]);
  });
});

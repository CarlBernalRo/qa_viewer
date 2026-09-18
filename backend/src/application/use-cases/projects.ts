import type { CreateProjectInput, ProjectDto, UpdateProjectInput } from '@rastro/shared';
import { InvalidStateError, NotFoundError } from '../../domain/errors.js';
import type { Clock, IdGenerator, ProjectRepository, SessionRepository } from '../../domain/ports.js';

export class CreateProject {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: CreateProjectInput): Promise<ProjectDto> {
    const project: ProjectDto = {
      id: this.ids.eventId(),
      name: input.name,
      apps: [],
      createdAt: this.clock.now().toISOString(),
    };
    await this.projects.save(project);
    return project;
  }
}

export class ListProjects {
  constructor(private readonly projects: ProjectRepository) {}

  async execute(): Promise<ProjectDto[]> {
    return (await this.projects.list()).sort((a, b) => a.name.localeCompare(b.name));
  }
}

export class UpdateProject {
  constructor(private readonly projects: ProjectRepository) {}

  async execute(id: string, input: UpdateProjectInput): Promise<ProjectDto> {
    const project = await this.projects.findById(id);
    if (!project) throw new NotFoundError('un proyecto', id);
    const updated: ProjectDto = {
      ...project,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.apps !== undefined ? { apps: input.apps } : {}),
    };
    await this.projects.save(updated);
    return updated;
  }
}

export class DeleteProject {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly sessions: SessionRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const project = await this.projects.findById(id);
    if (!project) throw new NotFoundError('un proyecto', id);
    const inUse = (await this.sessions.list()).some((session) => session.toDto().capture.projectId === id);
    if (inUse) throw new InvalidStateError('Este proyecto tiene sesiones asignadas: no se puede eliminar.');
    await this.projects.delete(id);
  }
}

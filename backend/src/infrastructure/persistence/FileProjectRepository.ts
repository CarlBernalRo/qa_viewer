import { readFile } from 'node:fs/promises';
import { projectListSchema, type ProjectDto } from '@rastro/shared';
import type { ProjectRepository } from '../../domain/ports.js';
import { isNotFound, writeFileAtomic } from './fs-utils.js';

/** Todos los proyectos en un solo índice (`projects.json`), no uno por sesión: son pocos y livianos. */
export class FileProjectRepository implements ProjectRepository {
  private writes: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async list(): Promise<ProjectDto[]> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return projectListSchema.parse(JSON.parse(raw)).projects;
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  }

  async findById(id: string): Promise<ProjectDto | null> {
    return (await this.list()).find((project) => project.id === id) ?? null;
  }

  async save(project: ProjectDto): Promise<void> {
    const snapshot = structuredClone(project);
    const next = this.writes
      .catch(() => undefined)
      .then(async () => {
        const projects = (await this.list()).filter((item) => item.id !== snapshot.id);
        const updated = [...projects, snapshot].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        await writeFileAtomic(this.filePath, `${JSON.stringify({ projects: updated }, null, 2)}\n`);
      });
    this.writes = next;
    await next;
  }

  async delete(id: string): Promise<void> {
    const next = this.writes
      .catch(() => undefined)
      .then(async () => {
        const projects = (await this.list()).filter((item) => item.id !== id);
        await writeFileAtomic(this.filePath, `${JSON.stringify({ projects }, null, 2)}\n`);
      });
    this.writes = next;
    await next;
  }
}

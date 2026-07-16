import { buildProjectUrl } from '../scrapers/projects';
import type { ProjectDelta, ProjectLike } from '../shared/types';

export function detectNewTaskProjects(previousProjects: Array<ProjectLike> | null | undefined, currentProjects: Array<ProjectLike> | null | undefined): ProjectDelta[] {
  const previousById = indexProjectsById(previousProjects);
  const previousBySlug = indexProjectsBySlug(previousProjects);
  const deltas: ProjectDelta[] = [];

  for (const project of Array.isArray(currentProjects) ? currentProjects : []) {
    const currentTasks = numberOrZero(project?.tasks);
    if (currentTasks <= 0) {
      continue;
    }

    const slug = String(project?.slug || '').trim();
    const id = stringOrNull(project?.id);
    if (!slug && !id) {
      continue;
    }

    const previous = (id ? previousById.get(id) : null) || previousBySlug.get(slug);
    const previousTasks = numberOrZero(previous?.tasks);
    const addedTasks = currentTasks - previousTasks;

    if (addedTasks <= 0) {
      continue;
    }

    deltas.push({
      slug,
      id,
      name: String(project?.name || 'Unknown project').trim(),
      url: project?.url ? String(project.url) : buildProjectUrl(project?.id),
      previous_tasks: previousTasks,
      current_tasks: currentTasks,
      added_tasks: addedTasks,
    });
  }

  return deltas;
}

export function indexProjectsById(projects: Array<ProjectLike> | null | undefined): Map<string, ProjectLike> {
  const map = new Map<string, ProjectLike>();

  for (const project of Array.isArray(projects) ? projects : []) {
    const id = stringOrNull(project?.id);
    if (!id || map.has(id)) {
      continue;
    }

    map.set(id, project);
  }

  return map;
}

export function indexProjectsBySlug(projects: Array<ProjectLike> | null | undefined): Map<string, ProjectLike> {
  const map = new Map<string, ProjectLike>();

  for (const project of Array.isArray(projects) ? projects : []) {
    const slug = String(project?.slug || '').trim();
    if (!slug || map.has(slug)) {
      continue;
    }

    map.set(slug, project);
  }

  return map;
}

function numberOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringOrNull(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return String(value);
}

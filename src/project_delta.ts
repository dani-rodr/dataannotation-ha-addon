import { buildProjectUrl } from './scrapers/projects';
import type { ProjectDelta, ProjectLike } from './types';

export function detectNewTaskProjects(previousProjects: Array<ProjectLike> | null | undefined, currentProjects: Array<ProjectLike> | null | undefined): ProjectDelta[] {
  const previousBySlug = indexProjectsBySlug(previousProjects);
  const deltas: ProjectDelta[] = [];

  for (const project of Array.isArray(currentProjects) ? currentProjects : []) {
    const currentTasks = numberOrZero(project?.tasks);
    if (currentTasks <= 0) {
      continue;
    }

    const slug = String(project?.slug || '').trim();
    if (!slug) {
      continue;
    }

    const previous = previousBySlug.get(slug);
    const previousTasks = numberOrZero(previous?.tasks);
    const addedTasks = currentTasks - previousTasks;

    if (addedTasks <= 0) {
      continue;
    }

    deltas.push({
      slug,
      id: stringOrNull(project?.id),
      name: String(project?.name || 'Unknown project').trim(),
      url: project?.url ? String(project.url) : buildProjectUrl(project?.id),
      previous_tasks: previousTasks,
      current_tasks: currentTasks,
      added_tasks: addedTasks,
    });
  }

  return deltas;
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

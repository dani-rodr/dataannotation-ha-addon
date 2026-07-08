import type { FilteredProjectsResult, ProjectLike } from './types';

export function parseExcludedProjectPatterns(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(normalizePattern).filter(Boolean);
  }

  return String(value)
    .split(/[\r\n,]+/)
    .map(normalizePattern)
    .filter(Boolean);
}

export function filterExcludedProjects<T extends ProjectLike>(projects: T[] | null | undefined, patterns: unknown): FilteredProjectsResult<T> {
  const normalizedPatterns = parseExcludedProjectPatterns(patterns);
  if (normalizedPatterns.length === 0) {
    return {
      projects: Array.isArray(projects) ? projects : [],
      excludedProjects: [],
    };
  }

  const includedProjects: T[] = [];
  const excludedProjects: T[] = [];

  for (const project of Array.isArray(projects) ? projects : []) {
    if (projectMatchesAnyPattern(project, normalizedPatterns)) {
      excludedProjects.push(project);
    } else {
      includedProjects.push(project);
    }
  }

  return {
    projects: includedProjects,
    excludedProjects,
  };
}

export function projectMatchesAnyPattern(project: ProjectLike | null | undefined, patterns: string[]): boolean {
  const haystack = [project?.name, project?.slug, project?.id, project?.url]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(' \u0000 ');

  return patterns.some((pattern) => haystack.includes(pattern.toLowerCase()));
}

function normalizePattern(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  const text = String(value).trim();
  if (!text || text.startsWith('#')) {
    return '';
  }

  return text;
}

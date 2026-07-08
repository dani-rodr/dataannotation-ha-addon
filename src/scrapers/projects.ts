import crypto from 'crypto';
import type { ProjectLike, ProjectSummary } from '../types';

type RawBadge = {
  kind?: string;
  label?: string;
  [key: string]: unknown;
};

type RawProject = {
  name?: unknown;
  workerSubtitle?: unknown;
  availableTasksFor?: unknown;
  payPerHourInCents?: unknown;
  priorityPayPerHourInCents?: unknown;
  created?: unknown;
  id?: unknown;
  badges?: RawBadge[];
  isCoding?: unknown;
  qualification?: unknown;
  [key: string]: unknown;
};

export function extractProjects(props: unknown): ProjectLike[] {
  const data = props as any;
  const dashboardProjects = Array.isArray(data?.dashboardMerchTargeting?.projects) ? data.dashboardMerchTargeting.projects : [];
  const easyProjects = Array.isArray(data?.dashboardMerchTargeting?.easyProjects) ? data.dashboardMerchTargeting.easyProjects : [];
  const list = [...dashboardProjects, ...easyProjects];
  const seen = new Set<string>();
  const projects: ProjectLike[] = [];

  for (const rawProject of list) {
    const project = normalizeProject(rawProject);
    if (!project || numberOrZero(project.tasks) <= 0) {
      continue;
    }

    if (seen.has(String(project.slug))) {
      continue;
    }

    seen.add(String(project.slug));
    projects.push(project);
  }

  return projects;
}

export function summarizeProjects(projects: ProjectLike[] | null | undefined): ProjectSummary {
  return {
    count: Array.isArray(projects) ? projects.length : 0,
    total_tasks: Array.isArray(projects)
      ? projects.reduce((sum, project) => sum + numberOrZero(project?.tasks), 0)
      : 0,
  };
}

export function normalizeProject(project: RawProject | null | undefined): ProjectLike | null {
  const name = stringOrEmpty(project?.name) || stringOrEmpty(project?.workerSubtitle) || 'Unknown project';
  const tasks = numberOrZero(project?.availableTasksFor);
  const payPerHourInCents = numberOrZero(project?.payPerHourInCents);
  const priorityPayPerHourInCents = numberOrZero(project?.priorityPayPerHourInCents);
  const basePayPerHourInCents = Math.max(0, payPerHourInCents - priorityPayPerHourInCents);
  const created = formatCreated(project?.created);
  const id = stringOrEmpty(project?.id) || null;
  const tags = buildTags(project);

  return {
    id,
    url: buildProjectUrl(id),
    slug: stableSlug(name, id, created),
    name,
    tasks,
    pay: formatCurrencyPerHour(payPerHourInCents),
    base_pay: formatCurrencyPerHour(basePayPerHourInCents),
    priority_pay: formatCurrencyPerHour(priorityPayPerHourInCents),
    tags,
    category: classifyCategory(project),
    created,
  };
}


function buildTags(project: RawProject | null | undefined): string[] {
  const tags: string[] = [];
  for (const badge of Array.isArray(project?.badges) ? project.badges : []) {
    const normalized = normalizeBadgeTag(badge);
    if (normalized) {
      tags.push(normalized);
    }
  }

  if (project?.isCoding && !tags.includes('Coding')) {
    tags.push('Coding');
  }

  if (project?.qualification && !tags.includes('Qualification')) {
    tags.push('Qualification');
  }

  return [...new Set(tags)].filter(Boolean);
}

export function normalizeBadgeTag(badge: RawBadge | null | undefined): string | null {
  if (!badge) {
    return null;
  }

  switch (badge.kind) {
    case 'priority_pay':
      return 'Priority Pay';
    case 'domain_coding':
      return 'Coding';
    case 'qualification':
      return 'Qualification';
    default:
      return badge.label ? String(badge.label) : badge.kind ? String(badge.kind) : null;
  }
}

export function classifyCategory(project: RawProject | null | undefined): 'qualification' | 'coding' | 'project' {
  if (project?.qualification) {
    return 'qualification';
  }
  if (project?.isCoding) {
    return 'coding';
  }
  return 'project';
}

export function formatCreated(value: unknown): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(date).replace(/^([A-Z][a-z]{2})\s0?/, '$1 ');
}

export function formatCurrencyPerHour(valueInCents: number): string {
  return `$${(Number(valueInCents) / 100).toFixed(2)}/hr`;
}

export function buildProjectUrl(id: unknown): string | null {
  const projectId = stringOrEmpty(id);
  if (!projectId) {
    return null;
  }

  return `https://app.dataannotation.tech/workers/projects/${encodeURIComponent(projectId)}`;
}

export function stableSlug(name: string, id: string | null, created: string | null): string {
  const hash = crypto
    .createHash('sha1')
    .update([name, id || '', created || ''].join('|'))
    .digest('hex')
    .slice(0, 12);
  return `project_${hash}`;
}

function stringOrEmpty(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
}

function numberOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

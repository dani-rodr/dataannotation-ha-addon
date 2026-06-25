const crypto = require('crypto');

function extractProjects(props) {
  const list = Array.isArray(props?.reportableProjectsInfo)
    ? props.reportableProjectsInfo
    : Array.isArray(props?.dashboardMerchTargeting?.projects)
      ? props.dashboardMerchTargeting.projects
      : [];

  return list.map(normalizeProject).filter(Boolean);
}

function summarizeProjects(projects) {
  return {
    count: Array.isArray(projects) ? projects.length : 0,
    total_tasks: Array.isArray(projects)
      ? projects.reduce((sum, project) => sum + numberOrZero(project?.tasks), 0)
      : 0,
  };
}

function normalizeProject(project) {
  const name = stringOrEmpty(project?.name) || stringOrEmpty(project?.workerSubtitle) || 'Unknown project';
  const tasks = numberOrZero(project?.availableTasksFor);
  const payPerHourInCents = numberOrZero(project?.payPerHourInCents);
  const priorityPayPerHourInCents = numberOrZero(project?.priorityPayPerHourInCents);
  const basePayPerHourInCents = Math.max(0, payPerHourInCents - priorityPayPerHourInCents);
  const created = formatCreated(project?.created);
  const tags = buildTags(project);

  return {
    slug: stableSlug(name, project?.id, created),
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

function buildTags(project) {
  const tags = [];
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

function normalizeBadgeTag(badge) {
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

function classifyCategory(project) {
  if (project?.qualification) {
    return 'qualification';
  }
  if (project?.isCoding) {
    return 'coding';
  }
  return 'project';
}

function formatCreated(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(date).replace(/^([A-Z][a-z]{2})\s0?/, '$1 ');
}

function formatCurrencyPerHour(valueInCents) {
  return `$${(Number(valueInCents) / 100).toFixed(2)}/hr`;
}

function stableSlug(name, id, created) {
  const hash = crypto
    .createHash('sha1')
    .update([name, id || '', created || ''].join('|'))
    .digest('hex')
    .slice(0, 12);
  return `project_${hash}`;
}

function stringOrEmpty(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

module.exports = {
  extractProjects,
  summarizeProjects,
  normalizeProject,
  formatCreated,
  classifyCategory,
  normalizeBadgeTag,
};

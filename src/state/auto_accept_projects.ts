// @ts-nocheck
const fs = require('node:fs');
const path = require('node:path');

const AUTO_ACCEPT_PROJECT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_AUTO_ACCEPT_PROJECTS = {
  version: 1,
  projects: {},
  updated_at: null,
};

function loadAutoAcceptProjects(filePath, now = new Date()) {
  if (!filePath || !fs.existsSync(filePath)) {
    return cloneAutoAcceptProjects(DEFAULT_AUTO_ACCEPT_PROJECTS);
  }

  try {
    return normalizeAutoAcceptProjects(JSON.parse(fs.readFileSync(filePath, 'utf8')), now);
  } catch {
    return cloneAutoAcceptProjects(DEFAULT_AUTO_ACCEPT_PROJECTS);
  }
}

function saveAutoAcceptProjects(filePath, projects, now = new Date()) {
  if (!filePath) {
    return;
  }

  const normalized = normalizeAutoAcceptProjects(projects, now);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2));
  fs.renameSync(tempPath, filePath);
}

function normalizeAutoAcceptProjects(value, now = new Date()) {
  const payload = value && typeof value === 'object' ? value : {};
  const projects = payload.projects && typeof payload.projects === 'object' ? payload.projects : {};
  const normalizedProjects = {};
  const current = normalizeDate(now) || new Date();

  for (const [projectId, project] of Object.entries(projects)) {
    const normalized = normalizeAutoAcceptProject(projectId, project, current);
    if (!normalized || isProjectExpired(normalized, current)) {
      continue;
    }

    normalizedProjects[normalized.project_id] = normalized;
  }

  return {
    version: 1,
    projects: normalizedProjects,
    updated_at: normalizeIsoDate(payload.updated_at) || null,
  };
}

function normalizeAutoAcceptProject(projectId, project, now = new Date()) {
  if (!project || typeof project !== 'object') {
    return null;
  }

  const normalizedProjectId = normalizeText(project.project_id || projectId);
  if (!normalizedProjectId) {
    return null;
  }

  const current = normalizeDate(now) || new Date();
  return {
    project_id: normalizedProjectId,
    enabled: Boolean(project.enabled),
    last_seen_name: normalizeText(project.last_seen_name),
    last_seen_slug: normalizeText(project.last_seen_slug),
    last_seen_url: normalizeText(project.last_seen_url),
    first_seen_at: normalizeIsoDate(project.first_seen_at) || current.toISOString(),
    last_seen_at: normalizeIsoDate(project.last_seen_at) || current.toISOString(),
  };
}

function upsertAutoAcceptProject(projects, project, enabled = false, now = new Date()) {
  const normalized = normalizeAutoAcceptProjects(projects, now);
  const projectId = resolveAutoAcceptProjectId(project);
  if (!projectId) {
    return normalized;
  }

  const current = normalizeDate(now) || new Date();
  const existing = normalized.projects[projectId] || null;
  normalized.projects[projectId] = {
    project_id: projectId,
    enabled: Boolean(enabled),
    last_seen_name: normalizeText(project?.name) || existing?.last_seen_name || null,
    last_seen_slug: normalizeText(project?.slug) || existing?.last_seen_slug || null,
    last_seen_url: normalizeText(project?.url) || existing?.last_seen_url || null,
    first_seen_at: existing?.first_seen_at || current.toISOString(),
    last_seen_at: current.toISOString(),
  };
  normalized.updated_at = current.toISOString();
  return normalized;
}

function setAutoAcceptProjectEnabled(projects, projectId, enabled, now = new Date()) {
  const normalized = normalizeAutoAcceptProjects(projects, now);
  const resolvedProjectId = normalizeText(projectId);
  if (!resolvedProjectId || !normalized.projects[resolvedProjectId]) {
    return normalized;
  }

  const current = normalizeDate(now) || new Date();
  normalized.projects[resolvedProjectId] = {
    ...normalized.projects[resolvedProjectId],
    enabled: Boolean(enabled),
    last_seen_at: current.toISOString(),
  };
  normalized.updated_at = current.toISOString();
  return normalized;
}

function clearAutoAcceptProjectCache(_projects, now = new Date()) {
  const current = normalizeDate(now) || new Date();
  return {
    version: 1,
    projects: {},
    updated_at: current.toISOString(),
  };
}

function pruneExpiredAutoAcceptProjects(projects, now = new Date()) {
  return normalizeAutoAcceptProjects(projects, now);
}

function resolveAutoAcceptProjectId(project) {
  return normalizeText(project?.id);
}

function listEnabledAutoAcceptProjectIds(projects, now = new Date()) {
  const normalized = normalizeAutoAcceptProjects(projects, now);
  return Object.values(normalized.projects)
    .filter((project) => project.enabled)
    .map((project) => project.project_id);
}

function isProjectExpired(project, now = new Date()) {
  const lastSeenAt = normalizeDate(project?.last_seen_at);
  if (!lastSeenAt) {
    return false;
  }

  return now.getTime() - lastSeenAt.getTime() > AUTO_ACCEPT_PROJECT_RETENTION_MS;
}

function normalizeIsoDate(value) {
  const date = normalizeDate(value);
  return date ? date.toISOString() : null;
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}

function cloneAutoAcceptProjects(value) {
  return normalizeAutoAcceptProjects(JSON.parse(JSON.stringify(value)));
}

module.exports = {
  AUTO_ACCEPT_PROJECT_RETENTION_MS,
  DEFAULT_AUTO_ACCEPT_PROJECTS,
  clearAutoAcceptProjectCache,
  listEnabledAutoAcceptProjectIds,
  loadAutoAcceptProjects,
  normalizeAutoAcceptProjects,
  pruneExpiredAutoAcceptProjects,
  resolveAutoAcceptProjectId,
  saveAutoAcceptProjects,
  setAutoAcceptProjectEnabled,
  upsertAutoAcceptProject,
};

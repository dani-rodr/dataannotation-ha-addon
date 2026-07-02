const { buildProjectUrl } = require('./scrapers/projects');

function detectNewTaskProjects(previousProjects, currentProjects) {
  const previousBySlug = indexProjectsBySlug(previousProjects);
  const deltas = [];

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
      url: project?.url || buildProjectUrl(project?.id),
      previous_tasks: previousTasks,
      current_tasks: currentTasks,
      added_tasks: addedTasks,
    });
  }

  return deltas;
}

function indexProjectsBySlug(projects) {
  const map = new Map();

  for (const project of Array.isArray(projects) ? projects : []) {
    const slug = String(project?.slug || '').trim();
    if (!slug || map.has(slug)) {
      continue;
    }

    map.set(slug, project);
  }

  return map;
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringOrNull(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return String(value);
}

module.exports = {
  detectNewTaskProjects,
  indexProjectsBySlug,
};

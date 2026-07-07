function parseExcludedProjectPatterns(value) {
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

function filterExcludedProjects(projects, patterns) {
  const normalizedPatterns = parseExcludedProjectPatterns(patterns);
  if (normalizedPatterns.length === 0) {
    return {
      projects: Array.isArray(projects) ? projects : [],
      excludedProjects: [],
    };
  }

  const includedProjects = [];
  const excludedProjects = [];

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

function projectMatchesAnyPattern(project, patterns) {
  const haystack = [project?.name, project?.slug, project?.id, project?.url]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(' \u0000 ');

  return patterns.some((pattern) => haystack.includes(pattern.toLowerCase()));
}

function normalizePattern(value) {
  if (value === undefined || value === null) {
    return '';
  }

  const text = String(value).trim();
  if (!text || text.startsWith('#')) {
    return '';
  }

  return text;
}

module.exports = {
  filterExcludedProjects,
  parseExcludedProjectPatterns,
  projectMatchesAnyPattern,
};

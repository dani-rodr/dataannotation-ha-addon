const CLAIM_WORK_SCREEN_METRICS = {
  width: 2560,
  height: 1440,
  deviceScaleFactor: 1,
  mobile: false,
  hasTouch: false,
  screenWidth: 2560,
  screenHeight: 1440,
  positionX: 0,
  positionY: 0,
  dontSetVisibleSize: false,
};

function formatClaimProjectEntityName(name) {
  return `Claim Project - ${shortenProjectName(name, 40)}`;
}

function buildClaimProjectTarget(project) {
  return {
    slug: String(project?.slug || '').trim(),
    name: String(project?.name || '').trim(),
    id: String(project?.id || '').trim(),
  };
}

function shortenProjectName(name, maxLength = 40) {
  const cleaned = normalizeProjectName(name);
  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function normalizeProjectName(name) {
  return String(name || 'Unknown project')
    .replace(/^(?:\[[^\]]+\]\s*)+/, '')
    .replace(/\s+-\s+\d{2}\/\d{2}\/\d{2}\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  CLAIM_WORK_SCREEN_METRICS,
  buildClaimProjectTarget,
  formatClaimProjectEntityName,
  normalizeProjectName,
  shortenProjectName,
};

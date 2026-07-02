function extractTaskStatus(props, pageUrl = null, scrapedAt = new Date().toISOString()) {
  const inProgressTasks = Array.isArray(props?.inProgressTasksInfo) ? props.inProgressTasksInfo : [];

  return {
    in_progress_task: inProgressTasks.length > 0,
    in_progress_task_count: inProgressTasks.length,
    in_progress_tasks: inProgressTasks.map(normalizeInProgressTask).filter(Boolean),
    in_progress_task_source: pageUrl && /\/workers\/projects(?:\/|$)/.test(pageUrl) ? 'projects_page' : 'unknown',
    page_url: pageUrl,
    scraped_at: scrapedAt,
  };
}

function normalizeInProgressTask(task) {
  if (!task || typeof task !== 'object') {
    return null;
  }

  return {
    id: stringOrNull(task.id),
    project_id: stringOrNull(task.projectId),
    project_name: stringOrNull(task.projectName),
    task_id: stringOrNull(task.taskId),
    started_at: stringOrNull(task.startedAt),
    expires_at: stringOrNull(task.expiresAt),
  };
}

function stringOrNull(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return String(value);
}

module.exports = {
  extractTaskStatus,
  normalizeInProgressTask,
};

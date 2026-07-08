const assert = require('node:assert/strict');
const test = require('node:test');

const { extractTaskStatus, normalizeInProgressTask } = require('../../../src/scrapers/task_status');

test('normalizeInProgressTask keeps the live in-progress task fields', () => {
  const task = normalizeInProgressTask({
    id: 'ea744989-2c46-4656-94d7-a4e8f1911438',
    projectId: '8a6110ad-eda0-4903-a977-e9b36e74ff48',
    projectName: 'Boxing',
    taskId: '1fc87344-42f1-4531-9939-0a4a82cf942e',
    startedAt: '2026-07-02T01:17:46.623Z',
    expiresAt: '2026-07-02T09:17:46.623Z',
  });

  assert.deepEqual(task, {
    id: 'ea744989-2c46-4656-94d7-a4e8f1911438',
    project_id: '8a6110ad-eda0-4903-a977-e9b36e74ff48',
    project_name: 'Boxing',
    task_id: '1fc87344-42f1-4531-9939-0a4a82cf942e',
    started_at: '2026-07-02T01:17:46.623Z',
    expires_at: '2026-07-02T09:17:46.623Z',
  });
});

test('extractTaskStatus reports no active task when the array is empty', () => {
  const status = extractTaskStatus({ inProgressTasksInfo: [] }, 'https://app.dataannotation.tech/workers/projects');

  assert.equal(status.in_progress_task, false);
  assert.equal(status.in_progress_task_count, 0);
  assert.deepEqual(status.in_progress_tasks, []);
  assert.equal(status.in_progress_task_source, 'projects_page');
});

test('extractTaskStatus reports an active task from the live payload shape', () => {
  const status = extractTaskStatus(
    {
      inProgressTasksInfo: [
        {
          id: 'ea744989-2c46-4656-94d7-a4e8f1911438',
          projectId: '8a6110ad-eda0-4903-a977-e9b36e74ff48',
          projectName: 'Boxing 🥊 - Create Complex Coding Task Prompts for your Assigned Interaction Mode - 06/30/26',
          taskId: '1fc87344-42f1-4531-9939-0a4a82cf942e',
          startedAt: '2026-07-02T01:17:46.623Z',
          expiresAt: '2026-07-02T09:17:46.623Z',
        },
      ],
    },
    'https://app.dataannotation.tech/workers/projects'
  );

  assert.equal(status.in_progress_task, true);
  assert.equal(status.in_progress_task_count, 1);
  assert.deepEqual(status.in_progress_tasks, [
    {
      id: 'ea744989-2c46-4656-94d7-a4e8f1911438',
      project_id: '8a6110ad-eda0-4903-a977-e9b36e74ff48',
      project_name: 'Boxing 🥊 - Create Complex Coding Task Prompts for your Assigned Interaction Mode - 06/30/26',
      task_id: '1fc87344-42f1-4531-9939-0a4a82cf942e',
      started_at: '2026-07-02T01:17:46.623Z',
      expires_at: '2026-07-02T09:17:46.623Z',
    },
  ]);
});

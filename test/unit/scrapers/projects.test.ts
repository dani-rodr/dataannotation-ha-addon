const test = require('node:test');
const assert = require('node:assert/strict');

const { extractProjects, summarizeProjects } = require('../../../src/scrapers/projects');

test('extractProjects normalizes a DataAnnotation project payload', () => {
  const projects = extractProjects({
    dashboardMerchTargeting: {
      projects: [
        {
          id: '123',
          name: 'Boxing 🥊 - Create Complex Coding Task Prompts for your Assigned Interaction Mode - 06/14/26',
          availableTasksFor: 5,
          payPerHourInCents: 5500,
          priorityPayPerHourInCents: 1500,
          created: '2026-06-11T21:29:35.231Z',
          isCoding: true,
          badges: [
            { kind: 'priority_pay', label: 'Priority Pay $15/hr' },
            { kind: 'domain_coding', label: 'Coding' },
          ],
        },
      ],
    },
  });

  assert.equal(projects.length, 1);
  assert.equal(projects[0].id, '123');
  assert.equal(projects[0].url, 'https://app.dataannotation.tech/workers/projects/123');
  assert.equal(projects[0].tasks, 5);
  assert.equal(projects[0].pay, '$55.00/hr');
  assert.equal(projects[0].base_pay, '$40.00/hr');
  assert.equal(projects[0].priority_pay, '$15.00/hr');
  assert.deepEqual(projects[0].tags, ['Priority Pay', 'Coding']);
  assert.equal(projects[0].category, 'coding');
  assert.equal(projects[0].created, 'Jun 11');
});

test('extractProjects ignores report-time rows and filters zero-task projects', () => {
  const projects = extractProjects({
    reportableProjectsInfo: [
      {
        id: '999',
        name: 'Report Time Row - 06/14/26',
        availableTasksFor: 5,
        payPerHourInCents: 5500,
        priorityPayPerHourInCents: 1500,
        created: '2026-06-11T21:29:35.231Z',
      },
    ],
    dashboardMerchTargeting: {
      projects: [
        {
          id: '123',
          name: 'Boxing 🥊 - Create Complex Coding Task Prompts for your Assigned Interaction Mode - 06/14/26',
          availableTasksFor: 5,
          payPerHourInCents: 5500,
          priorityPayPerHourInCents: 1500,
          created: '2026-06-11T21:29:35.231Z',
          isCoding: true,
          badges: [
            { kind: 'priority_pay', label: 'Priority Pay $15/hr' },
            { kind: 'domain_coding', label: 'Coding' },
          ],
        },
        {
          id: '456',
          name: '[QUALIFICATION] Hidden Zero Task Project',
          availableTasksFor: 0,
          payPerHourInCents: 0,
          priorityPayPerHourInCents: 0,
          created: '2026-06-11T21:29:35.231Z',
        },
      ],
    },
  });

  assert.equal(projects.length, 1);
  assert.equal(projects[0].tasks, 5);
  assert.equal(projects[0].name.startsWith('Boxing'), true);
  assert.equal(typeof projects[0].id, 'string');
  assert.equal(projects[0].url.startsWith('https://app.dataannotation.tech/workers/projects/'), true);
});

test('summarizeProjects totals task counts', () => {
  const summary = summarizeProjects([
    { tasks: 5 },
    { tasks: 2 },
    { tasks: 0 },
  ]);

  assert.equal(summary.count, 3);
  assert.equal(summary.total_tasks, 7);
});

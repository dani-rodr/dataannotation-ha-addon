const assert = require('node:assert/strict');
const test = require('node:test');

const { detectNewTaskProjects } = require('../../../src/projects/project_delta.ts');

test('detectNewTaskProjects detects a brand new project as added tasks', () => {
  const deltas = detectNewTaskProjects([], [
    {
      slug: 'project_a',
      id: 'abc123',
      name: 'Project A',
      tasks: 3,
      url: 'https://app.dataannotation.tech/workers/projects/abc123',
    },
  ]);

  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].slug, 'project_a');
  assert.equal(deltas[0].added_tasks, 3);
  assert.equal(deltas[0].url, 'https://app.dataannotation.tech/workers/projects/abc123');
});

test('detectNewTaskProjects detects task count increases only', () => {
  const deltas = detectNewTaskProjects(
    [
      {
        slug: 'project_a',
        id: 'abc123',
        name: 'Project A',
        tasks: 3,
      },
    ],
    [
      {
        slug: 'project_a',
        id: 'abc123',
        name: 'Project A',
        tasks: 5,
      },
      {
        slug: 'project_b',
        id: 'def456',
        name: 'Project B',
        tasks: 0,
      },
    ]
  );

  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].previous_tasks, 3);
  assert.equal(deltas[0].current_tasks, 5);
  assert.equal(deltas[0].added_tasks, 2);
});

test('detectNewTaskProjects ignores decreases and zero-task projects', () => {
  const deltas = detectNewTaskProjects(
    [
      { slug: 'project_a', tasks: 5 },
      { slug: 'project_b', tasks: 2 },
    ],
    [
      { slug: 'project_a', tasks: 4 },
      { slug: 'project_b', tasks: 0 },
    ]
  );

  assert.deepEqual(deltas, []);
});

test('detectNewTaskProjects matches existing projects by stable id before slug', () => {
  const deltas = detectNewTaskProjects(
    [
      { slug: 'old-slug', id: 'project-123', tasks: 3 },
    ],
    [
      { slug: 'new-slug', id: 'project-123', tasks: 5, name: 'Renamed Project' },
    ]
  );

  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].id, 'project-123');
  assert.equal(deltas[0].previous_tasks, 3);
  assert.equal(deltas[0].added_tasks, 2);
});

const assert = require('node:assert/strict');
const test = require('node:test');

const { filterExcludedProjects, parseExcludedProjectPatterns } = require('../../../src/projects/project_filters.ts');

test('parseExcludedProjectPatterns accepts multiline patterns', () => {
  assert.deepEqual(
    parseExcludedProjectPatterns(`
      [Reference Version]
      Learn to write amazing rationale comments
      # comment
    `),
    ['[Reference Version]', 'Learn to write amazing rationale comments']
  );
});

test('filterExcludedProjects removes matching projects from the list', () => {
  const projects = [
    { name: '[Reference Version] Learn to write amazing rationale comments! [Multilingual]', slug: 'project_a', id: '1', tasks: 2 },
    { name: 'Real Project', slug: 'project_b', id: '2', tasks: 3 },
  ];

  const filtered = filterExcludedProjects(projects, '[Reference Version]\nOther pattern');

  assert.equal(filtered.projects.length, 1);
  assert.equal(filtered.projects[0].name, 'Real Project');
  assert.equal(filtered.excludedProjects.length, 1);
  assert.equal(filtered.excludedProjects[0].slug, 'project_a');
});

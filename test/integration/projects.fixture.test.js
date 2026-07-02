const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { extractProjects } = require('../../src/scrapers/projects');

test('fixture project parsing matches the observed DataAnnotation payload', () => {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/data-props.json'), 'utf8'));
  const projects = extractProjects(fixture);

  assert.equal(projects.length, 1);
  assert.deepEqual(projects[0], {
    id: 'project-123',
    url: 'https://app.dataannotation.tech/workers/projects/project-123',
    slug: projects[0].slug,
    name: 'Boxing 🥊 - Create Complex Coding Task Prompts for your Assigned Interaction Mode - 06/14/26',
    tasks: 5,
    pay: '$55.00/hr',
    base_pay: '$40.00/hr',
    priority_pay: '$15.00/hr',
    tags: ['Priority Pay', 'Coding'],
    category: 'coding',
    created: 'Jun 11',
  });
});

test('fixture projects satisfy the dynamic shape invariants', () => {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/data-props.json'), 'utf8'));
  const projects = extractProjects(fixture);

  for (const project of projects) {
    assert.equal(typeof project.name, 'string');
    assert.equal(typeof project.tasks, 'number');
    assert.ok(project.tasks >= 0);
    assert.match(project.pay, /^\$\d+\.\d{2}\/hr$/);
    assert.match(project.base_pay, /^\$\d+\.\d{2}\/hr$/);
    assert.match(project.priority_pay, /^\$\d+\.\d{2}\/hr$/);
    assert.ok(Array.isArray(project.tags));
    assert.ok(project.tags.every((tag) => typeof tag === 'string'));
    assert.ok(['project', 'coding', 'qualification'].includes(project.category));
    assert.ok(project.created === null || typeof project.created === 'string');
    assert.equal(typeof project.id, 'string');
  }
});

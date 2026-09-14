const assert = require('node:assert/strict');
const test = require('node:test');
const {
  STANDARD_PHASES,
  buildPhaseSeedRows,
  resolveCompletion,
  resolveReopen,
} = require('../dist/services/phase.constants.js');

const makePhases = () => [
  { id: 'a', sequence: 1, status: 'completed' },
  { id: 'b', sequence: 2, status: 'current' },
  { id: 'c', sequence: 3, status: 'not_started' },
];

test('standard phases seed the 7 brief phases in order', () => {
  assert.equal(STANDARD_PHASES.length, 7);
  assert.deepEqual(
    STANDARD_PHASES.map((phase) => phase.displayName),
    [
      'Initiation',
      'Requirements Analysis',
      'System Design',
      'Development',
      'Testing & UAT',
      'Deployment',
      'Closure',
    ],
  );
  const rows = buildPhaseSeedRows('project-id');
  assert.equal(rows.length, 7);
  assert.equal(rows[0].status, 'current');
  assert.ok(rows.slice(1).every((row) => row.status === 'not_started'));
});

test('only the current phase can be completed', () => {
  const { target, next } = resolveCompletion(makePhases(), 'b');
  assert.equal(target.id, 'b');
  assert.equal(next.id, 'c');

  assert.throws(() => resolveCompletion(makePhases(), 'c'), /Only the current phase/);
  assert.throws(() => resolveCompletion(makePhases(), 'a'), /already completed/);
  assert.throws(() => resolveCompletion(makePhases(), 'missing'), /not found/);
});

test('completing the final phase has no successor', () => {
  const phases = [
    { id: 'a', sequence: 1, status: 'completed' },
    { id: 'b', sequence: 2, status: 'current' },
  ];
  const { target, next } = resolveCompletion(phases, 'b');
  assert.equal(target.id, 'b');
  assert.equal(next, undefined);
});

test('only the most recently completed phase can be reopened', () => {
  const { target, successor } = resolveReopen(makePhases(), 'a');
  assert.equal(target.id, 'a');
  assert.equal(successor.id, 'b');

  assert.throws(() => resolveReopen(makePhases(), 'b'), /Only a completed phase/);
  assert.throws(
    () =>
      resolveReopen(
        [
          { id: 'a', sequence: 1, status: 'completed' },
          { id: 'b', sequence: 2, status: 'completed' },
          { id: 'c', sequence: 3, status: 'current' },
        ],
        'a',
      ),
    /most recently completed/,
  );
});

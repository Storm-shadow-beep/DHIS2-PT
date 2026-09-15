const assert = require('node:assert/strict');
const test = require('node:test');
const {
  STANDARD_REQUIREMENT_TEMPLATES,
  buildCategorySeedRows,
  validateRequirementName,
  validateSortOrder,
} = require('../dist/services/requirement-templates.constants.js');

test('standard template covers all 7 phases with mandatory and optional rows', () => {
  assert.equal(STANDARD_REQUIREMENT_TEMPLATES.length, 21);
  const sequences = new Set(STANDARD_REQUIREMENT_TEMPLATES.map((row) => row.phaseSequence));
  assert.deepEqual([...sequences].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);

  for (const sequence of sequences) {
    const rows = STANDARD_REQUIREMENT_TEMPLATES.filter(
      (row) => row.phaseSequence === sequence,
    );
    assert.ok(rows.length >= 2, `phase ${sequence} should have at least 2 templates`);
    assert.ok(
      rows.some((row) => row.isMandatory),
      `phase ${sequence} should have a mandatory requirement`,
    );
    assert.ok(
      rows.some((row) => !row.isMandatory),
      `phase ${sequence} should have an optional requirement`,
    );
  }

  const names = STANDARD_REQUIREMENT_TEMPLATES.map((row) => row.name);
  assert.ok(names.includes('Software Requirements Specification (SRS)'));
  assert.ok(names.includes('System Design Document (SDD)'));
  assert.ok(names.includes('UAT Report'));
});

test('seed rows map templates onto project phases in sort order', () => {
  const phases = [
    { id: 'phase-1', sequence: 1 },
    { id: 'phase-2', sequence: 2 },
  ];
  const rows = buildCategorySeedRows(phases);
  assert.equal(rows.length, 6);
  assert.ok(rows.every((row) => ['phase-1', 'phase-2'].includes(row.phaseId)));
  const phaseOne = rows.filter((row) => row.phaseId === 'phase-1');
  assert.deepEqual(
    phaseOne.map((row) => row.sortOrder),
    [1, 2, 3],
  );
  assert.ok(rows.some((row) => row.name === 'Project Charter' && row.isMandatory));
  assert.ok(rows.some((row) => row.name === 'Business Case' && !row.isMandatory));
});

test('seed rows skip phases without a template entry', () => {
  const rows = buildCategorySeedRows([{ id: 'phase-x', sequence: 99 }]);
  assert.deepEqual(rows, []);
});

test('requirement name validation trims and enforces length', () => {
  assert.equal(validateRequirementName('  SRS  '), 'SRS');
  assert.throws(() => validateRequirementName(''), /required/);
  assert.throws(() => validateRequirementName('   '), /required/);
  assert.throws(() => validateRequirementName(42), /required/);
  assert.throws(() => validateRequirementName('x'.repeat(151)), /at most 150/);
});

test('sort order validation accepts only non-negative integers', () => {
  assert.equal(validateSortOrder(undefined), undefined);
  assert.equal(validateSortOrder(0), 0);
  assert.equal(validateSortOrder(3), 3);
  assert.throws(() => validateSortOrder(-1), /non-negative integer/);
  assert.throws(() => validateSortOrder(1.5), /non-negative integer/);
  assert.throws(() => validateSortOrder('2'), /non-negative integer/);
});

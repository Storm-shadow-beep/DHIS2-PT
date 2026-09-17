const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DOCUMENT_STATUSES,
  resolveApproval,
  resolveNewVersion,
  validateDecision,
  validateDocumentName,
  validateStatusFilter,
} = require('../dist/services/document.constants.js');

test('document name requires a non-empty value within 255 characters', () => {
  assert.equal(validateDocumentName('  SRS v2  '), 'SRS v2');
  assert.throws(() => validateDocumentName(''), /name is required/);
  assert.throws(() => validateDocumentName('   '), /name is required/);
  assert.throws(() => validateDocumentName('x'.repeat(256)), /at most 255/);
});

test('approval decisions and status filters accept only canonical values', () => {
  assert.equal(validateDecision('approved'), 'approved');
  assert.equal(validateDecision('needs_revision'), 'needs_revision');
  assert.throws(() => validateDecision('rejected'), /decision must be/);

  assert.equal(validateStatusFilter('submitted'), 'submitted');
  assert.deepEqual([...DOCUMENT_STATUSES], ['submitted', 'approved', 'needs_revision']);
  assert.throws(() => validateStatusFilter('Uploaded'), /status must be/);
});

test('only submitted documents can be reviewed', () => {
  assert.equal(
    resolveApproval({ id: 'd', currentVersion: 1, status: 'submitted' }, 'approved'),
    'approved',
  );
  assert.equal(
    resolveApproval({ id: 'd', currentVersion: 2, status: 'submitted' }, 'needs_revision'),
    'needs_revision',
  );

  assert.throws(
    () => resolveApproval({ id: 'd', currentVersion: 1, status: 'approved' }, 'approved'),
    /Only a submitted document/,
  );
  assert.throws(
    () => resolveApproval({ id: 'd', currentVersion: 1, status: 'needs_revision' }, 'approved'),
    /Upload a new version/,
  );
});

test('re-upload bumps the version by exactly one', () => {
  assert.equal(resolveNewVersion({ id: 'd', currentVersion: 1, status: 'approved' }), 2);
  assert.equal(resolveNewVersion({ id: 'd', currentVersion: 7, status: 'submitted' }), 8);
  assert.throws(
    () => resolveNewVersion({ id: 'd', currentVersion: 0, status: 'submitted' }),
    /version state is invalid/,
  );
});

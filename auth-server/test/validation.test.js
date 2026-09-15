const assert = require('node:assert/strict');
const test = require('node:test');
const { isUuid, assertUuidWith } = require('../dist/utils/validation.js');

const VALID = '123e4567-e89b-12d3-a456-426614174000';

test('isUuid accepts canonical UUIDs and rejects anything else', () => {
  assert.equal(isUuid(VALID), true);
  assert.equal(isUuid('not-a-uuid'), false);
  assert.equal(isUuid(''), false);
  assert.equal(isUuid('123e4567-e89b-12d3-a456-42661417400'), false);
});

test('assertUuidWith passes valid ids silently', () => {
  assert.doesNotThrow(() => assertUuidWith(VALID, 'project id'));
});

test('assertUuidWith defaults to 400 INVALID_RESOURCE_ID', () => {
  assert.throws(() => assertUuidWith('bad', 'project id'), (error) => {
    assert.equal(error.message, 'Invalid project id');
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, 'INVALID_RESOURCE_ID');
    return true;
  });
});

test('assertUuidWith preserves caller error contracts via factory', () => {
  const factory = (label) =>
    Object.assign(new Error(`Invalid ${label}`), { statusCode: 400, code: 'INVALID_UUID' });
  assert.throws(() => assertUuidWith('bad', 'member id', factory), (error) => {
    assert.equal(error.message, 'Invalid member id');
    assert.equal(error.code, 'INVALID_UUID');
    return true;
  });
});

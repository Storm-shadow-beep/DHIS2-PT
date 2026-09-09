const assert = require('node:assert/strict');
const test = require('node:test');
const {
  canAccessDocument,
  canAccessProject,
} = require('../dist/services/authorization.policy.js');

const managerContext = {
  isAdministrator: false,
  globalRoles: ['project_manager'],
  projectRoles: [],
  permissions: [
    'project:view',
    'project:manage',
    'project:publish',
    'phase:manage',
    'document:view',
    'document:upload',
    'document:delete',
  ],
  isProjectManager: true,
  isActiveMember: true,
};

const memberContext = {
  isAdministrator: false,
  globalRoles: ['team_member'],
  projectRoles: [],
  permissions: [
    'project:view',
    'document:view',
    'document:upload',
    'document:delete',
  ],
  isProjectManager: false,
  isActiveMember: true,
};

test('administrators bypass project and document policy checks', () => {
  const administrator = {
    ...memberContext,
    isAdministrator: true,
    isUploader: false,
  };

  assert.equal(canAccessProject(administrator, 'manage'), true);
  assert.equal(canAccessDocument(administrator, 'approve'), true);
});

test('project managers can manage only projects they manage', () => {
  assert.equal(canAccessProject(managerContext, 'manage'), true);
  assert.equal(canAccessProject({ ...managerContext, isProjectManager: false }, 'manage'), false);
  assert.equal(canAccessProject(managerContext, 'publish'), true);
});

test('members can view and contribute without managing project configuration', () => {
  assert.equal(canAccessProject(memberContext, 'view'), true);
  assert.equal(canAccessProject(memberContext, 'member'), true);
  assert.equal(canAccessProject(memberContext, 'manage'), false);
  assert.equal(canAccessProject({ ...memberContext, isActiveMember: false }, 'view'), false);
});

test('document deletion is limited to the uploader or an authorized manager', () => {
  const owner = { ...memberContext, isUploader: true };
  const otherMember = { ...memberContext, isUploader: false };

  assert.equal(canAccessDocument(owner, 'delete'), true);
  assert.equal(canAccessDocument(otherMember, 'delete'), false);
  assert.equal(canAccessDocument({ ...managerContext, isUploader: false }, 'delete'), true);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const rules = require('../controllers/Organisations/rules');
const { _test } = require('../controllers/Organisations/OrganisationsService');

const valid = {
    name: 'Medrich Pharma Pvt Ltd',
    maxUsers: '10',
    ownerName: 'Rajesh Kumar Reddy',
    ownerEmail: 'Rajesh@Medrich.in',
    ownerPhone: '+91 98480 12345',
};

test('company code: made from the name, suffixes dropped, made unique with a number', () => {
    assert.equal(rules.codeFromName('Medrich Pharma Pvt Ltd'), 'MEDRICH-PHARMA');
    assert.equal(rules.codeFromName('Sun Pharmaceutical Industries Limited'), 'SUN-PHARMACEUTICAL-INDUSTR', 'cut at 26 so a "-2" still fits in 30');
    assert.equal(rules.codeFromName('A & B'), 'A-B');
    assert.equal(rules.codeFromName('Z'), 'CO-Z');

    assert.equal(rules.uniqueCode('Medrich Pharma', new Set()), 'MEDRICH-PHARMA');
    assert.equal(rules.uniqueCode('Medrich Pharma', new Set(['MEDRICH-PHARMA'])), 'MEDRICH-PHARMA-2');
    assert.equal(rules.uniqueCode('Medrich Pharma', new Set(['MEDRICH-PHARMA', 'MEDRICH-PHARMA-2'])), 'MEDRICH-PHARMA-3');
});

test('new company: the owner becomes the first administrator and signs in with their email', () => {
    const input = rules.newOrganisation(valid);
    assert.equal(input.maxUsers, 10);
    assert.deepEqual(input.admin, {
        firstName: 'Rajesh',
        lastName: 'Kumar Reddy',
        userName: 'rajesh@medrich.in',
        email: 'rajesh@medrich.in',
        mobile: '+91 98480 12345',
    });
    assert.equal(input.contactName, 'Rajesh Kumar Reddy');

    assert.throws(() => rules.newOrganisation({ ...valid, maxUsers: 0 }), /User limit must be a whole number/);
    assert.throws(() => rules.newOrganisation({ ...valid, ownerEmail: '' }), /Owner email is required/);
    assert.throws(() => rules.newOrganisation({ ...valid, ownerEmail: 'not-an-email' }), /isn't a valid email/);
    assert.throws(() => rules.newOrganisation({ ...valid, ownerPhone: 'call me' }), /isn't a valid phone/);
    assert.throws(() => rules.newOrganisation({ ...valid, ownerName: ' ' }), /Owner name is required/);
});

test('first password: readable, strong enough, different each time', () => {
    const a = rules.firstPassword();
    const b = rules.firstPassword();
    assert.match(a, /^[A-Za-z]{5}[2-9]{3}[A-Za-z]{4}$/);
    assert.doesNotThrow(() => rules.password(a));
    assert.notEqual(a, b);
    assert.doesNotMatch(a, /[0O1lI]/, 'no look-alike characters');
});

test('changes: only known fields, at least one', () => {
    assert.deepEqual(rules.organisationChanges({ maxUsers: '25' }), { maxUsers: 25 });
    assert.throws(() => rules.organisationChanges({}), /Nothing to change/);
    assert.throws(() => rules.status('DELETED'), /ACTIVE or PAUSED/);
});

test('set-up: three roles, template switches copied, administrators always get everything', () => {
    const template = {
        roles: [
            { RoleCode: 'ADMIN', RoleName: 'Administrator', Permissions: [{ PermissionCode: 'roles.view', IsAllowed: true }, { PermissionCode: 'dataimport.create', IsAllowed: false }] },
            { RoleCode: 'FIELD_USER', RoleName: 'Field User', Permissions: [{ PermissionCode: 'visits.create', IsAllowed: true }, { PermissionCode: 'roles.view', IsAllowed: false }] },
        ],
        designations: [{ Code: 'BDE', Name: 'BDE' }],
        leaveTypes: [{ Code: 'CL', Name: 'Casual leave', AnnualQuota: 12, AllowHalfDay: true, IsPaid: true, SortOrder: 1 }],
        permissionCodes: ['roles.view', 'dataimport.create', 'visits.create', 'masters.view'],
    };
    const input = { ...rules.newOrganisation(valid), code: 'MEDRICH-PHARMA' };
    const { organisationId, setup } = _test.buildSetup(input, template, 'owner-1', 'hash');

    assert.equal(setup.organisation.OrganisationId, organisationId);
    assert.equal(setup.organisation.Code, 'MEDRICH-PHARMA');
    assert.deepEqual(setup.roles.map((r) => r.RoleCode), ['ADMIN', 'MANAGER', 'FIELD_USER']);

    const admin = setup.roles.find((r) => r.RoleCode === 'ADMIN');
    const adminCodes = setup.rolePermissions.filter((p) => p.RoleId === admin.RoleId);
    assert.deepEqual(adminCodes.map((p) => p.PermissionCode).sort(), ['dataimport.create', 'masters.view', 'roles.view', 'visits.create']);
    assert.ok(adminCodes.every((p) => p.IsAllowed === 1), 'administrators can do everything');

    const field = setup.roles.find((r) => r.RoleCode === 'FIELD_USER');
    assert.deepEqual(setup.rolePermissions.filter((p) => p.RoleId === field.RoleId).map((p) => [p.PermissionCode, p.IsAllowed]), [['visits.create', 1], ['roles.view', 0]]);

    assert.deepEqual(setup.designations.map((d) => d.Code), ['ADMIN', 'BDE'], 'an ADMIN designation is always there for the first admin');
    assert.equal(setup.adminUser.RoleId, admin.RoleId);
    assert.equal(setup.adminUser.UserName, 'rajesh@medrich.in');
    assert.equal(setup.adminUser.MobileNumber, '+91 98480 12345');
    assert.equal(setup.organisation.ContactPhone, '+91 98480 12345');
});

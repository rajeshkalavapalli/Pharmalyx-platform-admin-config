const { customQuery, inTransaction } = require('../../utils/dbFunctions');
const sql = require('./sql');

const json = (value) => JSON.stringify(value);

exports.list = () => customQuery(sql.LIST());
exports.get = async (id) => (await customQuery(sql.GET(), { OrganisationId: id }))[0] || null;
exports.codesLike = async (base) => new Set((await customQuery(sql.CODES_LIKE(), { Base: base })).map((row) => row.Code.toUpperCase()));
exports.admins = (id) => customQuery(sql.ADMINS(), { OrganisationId: id });
exports.recentAudit = (id) => customQuery(sql.RECENT_AUDIT(), { OrganisationId: id });

// What a new company starts with: the template company's roles (with permission switches),
// designations and leave types. Read across companies.
exports.template = async () => {
    const [roles, designations, leaveTypes, permissionCodes] = await Promise.all([
        customQuery(sql.TEMPLATE_ROLES()),
        customQuery(sql.TEMPLATE_DESIGNATIONS()),
        customQuery(sql.TEMPLATE_LEAVE_TYPES()),
        customQuery(sql.ALL_PERMISSION_CODES()),
    ]);
    return {
        roles: roles.map((r) => ({ RoleCode: r.RoleCode, RoleName: r.RoleName, Permissions: JSON.parse(r.Permissions || '[]') })),
        designations,
        leaveTypes,
        permissionCodes: permissionCodes.map((p) => p.PermissionCode),
    };
};

// Creates the company and everything in it, all or nothing.
// setup: { organisation, roles, rolePermissions, designations, leaveTypes, adminUser, audit }
exports.create = (setup) =>
    inTransaction(async (tx) => {
        await tx.run(sql.INSERT_ORGANISATION(), setup.organisation);

        // From here on, every insert is tagged with the new company.
        await tx.useOrganisation(setup.organisation.OrganisationId);
        await tx.run(sql.INSERT_ROLES(), { Rows: json(setup.roles) });
        if (setup.rolePermissions.length) await tx.run(sql.INSERT_ROLE_PERMISSIONS(), { Rows: json(setup.rolePermissions) });
        if (setup.designations.length) await tx.run(sql.INSERT_DESIGNATIONS(), { Rows: json(setup.designations) });
        if (setup.leaveTypes.length) await tx.run(sql.INSERT_LEAVE_TYPES(), { Rows: json(setup.leaveTypes) });
        await tx.run(sql.INSERT_ADMIN_USER(), { ...setup.adminUser, OrganisationId: setup.organisation.OrganisationId });

        await tx.acrossOrganisations();
        await tx.run(sql.INSERT_AUDIT(), setup.audit);
    });

exports.update = (id, columns, inputs) => customQuery(sql.UPDATE(columns), { ...inputs, OrganisationId: id });
exports.setStatus = (id, status) => customQuery(sql.SET_STATUS(), { OrganisationId: id, Status: status });
exports.setAdminPassword = async (id, userId, hash) =>
    (await customQuery(sql.SET_ADMIN_PASSWORD(), { OrganisationId: id, UserId: userId, PasswordHash: hash }))[0] > 0;

exports.audit = (entry) =>
    customQuery(sql.INSERT_AUDIT(), {
        PlatformAdminId: entry.adminId,
        OrganisationId: entry.organisationId,
        Action: entry.action,
        Details: entry.details == null ? null : json(entry.details),
    });

// Companies: list, create (with its roles, first admin and starting lists), change the user
// limit and details, pause / resume, reset an administrator's password.
// The platform never reads a company's business data (doctors, visits, sales...).
const crypto = require('crypto');
const argon2 = require('argon2');

const { fail, isGuid, lower } = require('../../utils/access');
const rules = require('./rules');
const DA = require('./OrganisationsDA');

// The three roles every company has; permission switches come from the template company.
const STANDARD_ROLES = [
    { RoleCode: 'ADMIN', RoleName: 'Administrator' },
    { RoleCode: 'MANAGER', RoleName: 'Manager' },
    { RoleCode: 'FIELD_USER', RoleName: 'Field User' },
];
// Used only if the template company has no designations.
const DEFAULT_DESIGNATIONS = [
    { Code: 'ADMIN', Name: 'ADMIN' },
    { Code: 'MEDICAL_REPRESENTATIVE', Name: 'MR' },
    { Code: 'AREA_SALES_MANAGER', Name: 'ASM' },
    { Code: 'REGIONAL_SALES_MANAGER', Name: 'RSM' },
    { Code: 'ZONAL_SALES_MANAGER', Name: 'ZSM' },
];

const view = (o) => ({
    organisationId: lower(o.OrganisationId),
    name: o.Name,
    code: o.Code,
    status: o.Status,
    maxUsers: o.MaxUsers,
    activeUsers: o.ActiveUsers,
    totalUsers: o.TotalUsers,
    freeSeats: Math.max(0, o.MaxUsers - o.ActiveUsers),
    contactName: o.ContactName,
    contactEmail: o.ContactEmail,
    contactPhone: o.ContactPhone,
    notes: o.Notes ?? null,
    createdOn: o.CreatedOn,
    modifiedOn: o.ModifiedOn,
});

const requireOrganisation = async (id) => {
    if (!isGuid(id)) throw fail(400, 'Company is invalid.');
    const organisation = await DA.get(id);
    if (!organisation) throw fail(404, 'Company not found.');
    return organisation;
};

exports.list = async () => {
    const rows = await DA.list();
    return {
        organisations: rows.map(view),
        totals: {
            companies: rows.length,
            active: rows.filter((o) => o.Status === 'ACTIVE').length,
            paused: rows.filter((o) => o.Status === 'PAUSED').length,
            activeUsers: rows.reduce((sum, o) => sum + o.ActiveUsers, 0),
        },
    };
};

exports.get = async (id) => {
    const organisation = await requireOrganisation(id);
    const [admins, audit] = await Promise.all([DA.admins(id), DA.recentAudit(id)]);
    return {
        organisation: view(organisation),
        admins: admins.map((a) => ({ userId: lower(a.UserId), name: a.Name, userName: a.UserName, email: a.EmailId, active: Boolean(a.IsActive) })),
        history: audit.map((a) => ({ action: a.Action, details: a.Details ? JSON.parse(a.Details) : null, at: a.CreatedOn, by: a.AdminName })),
    };
};

// The code a company with this name would get (free right now).
const freeCode = async (name) => rules.uniqueCode(name, await DA.codesLike(rules.codeFromName(name)));

exports.suggestCode = async (name) => ({ code: String(name || '').trim().length >= 2 ? await freeCode(name) : '' });

// Builds everything the new company starts with (pure apart from ids).
const buildSetup = (input, template, adminId, passwordHash) => {
    const organisationId = crypto.randomUUID();
    const roles = STANDARD_ROLES.map((role) => {
        const fromTemplate = template.roles.find((r) => r.RoleCode === role.RoleCode);
        return { RoleId: crypto.randomUUID(), RoleCode: role.RoleCode, RoleName: fromTemplate?.RoleName || role.RoleName, permissions: fromTemplate?.Permissions || null };
    });

    // Switches from the template; without one, administrators get everything and others nothing.
    const rolePermissions = roles.flatMap((role) =>
        role.permissions
            ? role.permissions.map((p) => ({ RoleId: role.RoleId, PermissionCode: p.PermissionCode, IsAllowed: p.IsAllowed ? 1 : 0 }))
            : template.permissionCodes.map((code) => ({ RoleId: role.RoleId, PermissionCode: code, IsAllowed: role.RoleCode === 'ADMIN' ? 1 : 0 }))
    );
    // Administrators always keep every permission, whatever the template says.
    const adminRole = roles.find((r) => r.RoleCode === 'ADMIN');
    rolePermissions.forEach((p) => {
        if (p.RoleId === adminRole.RoleId) p.IsAllowed = 1;
    });
    const adminCodes = new Set(rolePermissions.filter((p) => p.RoleId === adminRole.RoleId).map((p) => p.PermissionCode));
    template.permissionCodes.filter((code) => !adminCodes.has(code)).forEach((code) => rolePermissions.push({ RoleId: adminRole.RoleId, PermissionCode: code, IsAllowed: 1 }));

    const designationsFrom = template.designations.length ? template.designations : DEFAULT_DESIGNATIONS;
    const designations = designationsFrom.map((d) => ({ Id: crypto.randomUUID(), Code: d.Code, Name: d.Name }));
    if (!designations.some((d) => d.Code === 'ADMIN')) designations.unshift({ Id: crypto.randomUUID(), Code: 'ADMIN', Name: 'ADMIN' });

    const adminUserId = crypto.randomUUID();
    return {
        organisationId,
        setup: {
            organisation: {
                OrganisationId: organisationId,
                Name: input.name,
                Code: input.code,
                MaxUsers: input.maxUsers,
                ContactName: input.contactName,
                ContactEmail: input.contactEmail,
                ContactPhone: input.contactPhone,
                Notes: input.notes,
                CreatedBy: adminId,
            },
            roles: roles.map(({ RoleId, RoleCode, RoleName }) => ({ RoleId, RoleCode, RoleName })),
            rolePermissions,
            designations,
            leaveTypes: template.leaveTypes,
            adminUser: {
                UserId: adminUserId,
                UserName: input.admin.userName,
                FirstName: input.admin.firstName,
                LastName: input.admin.lastName,
                EmailId: input.admin.email,
                MobileNumber: input.admin.mobile,
                PasswordHash: passwordHash,
                RoleId: adminRole.RoleId,
            },
            audit: {
                PlatformAdminId: adminId,
                OrganisationId: organisationId,
                Action: 'CREATE_ORG',
                Details: JSON.stringify({ name: input.name, code: input.code, maxUsers: input.maxUsers, adminUserName: input.admin.userName }),
            },
        },
    };
};

// Creates the company with a code made from its name; its owner becomes the first administrator
// (signs in with their email). The generated password is returned this once, to pass on.
exports.create = async (adminId, payload) => {
    const input = rules.newOrganisation(payload);
    const template = await DA.template();
    const password = rules.firstPassword();
    const passwordHash = await argon2.hash(password);

    // Two companies with the same name created at the same moment: the second retries with the next code.
    for (let attempt = 1; ; attempt += 1) {
        const code = await freeCode(input.name);
        const { organisationId, setup } = buildSetup({ ...input, code }, template, adminId, passwordHash);
        try {
            await DA.create(setup);
            return { ...(await exports.get(organisationId)), signIn: { userName: input.admin.userName, password } };
        } catch (error) {
            const codeClash = (error.number === 2627 || error.number === 2601) && /UQ_Organisations_Code/.test(error.message);
            if (!codeClash || attempt >= 3) throw error;
        }
    }
};

const COLUMN = { name: 'Name', maxUsers: 'MaxUsers', contactName: 'ContactName', contactEmail: 'ContactEmail', contactPhone: 'ContactPhone', notes: 'Notes' };

exports.update = async (adminId, id, payload) => {
    const organisation = await requireOrganisation(id);
    const changes = rules.organisationChanges(payload);

    // The limit can't go below the people who can sign in today.
    if (changes.maxUsers !== undefined && changes.maxUsers < organisation.ActiveUsers) {
        throw fail(409, `${organisation.ActiveUsers} users are active in ${organisation.Name}. Set the limit to at least ${organisation.ActiveUsers}, or ask them to deactivate users first.`);
    }

    const columns = Object.keys(changes).map((key) => COLUMN[key]);
    const inputs = Object.fromEntries(Object.entries(changes).map(([key, value]) => [COLUMN[key], value]));
    await DA.update(id, columns, inputs);
    const before = Object.fromEntries(Object.keys(changes).map((key) => [key, organisation[COLUMN[key]]]));
    await DA.audit({ adminId, organisationId: id, action: changes.maxUsers !== undefined ? 'SET_LIMIT' : 'UPDATE_ORG', details: { before, after: changes } });
    return exports.get(id);
};

exports.setStatus = async (adminId, id, value) => {
    const organisation = await requireOrganisation(id);
    const status = rules.status(value);
    if (organisation.Status !== status) {
        await DA.setStatus(id, status);
        await DA.audit({ adminId, organisationId: id, action: status === 'PAUSED' ? 'PAUSE_ORG' : 'RESUME_ORG' });
    }
    return exports.get(id);
};

exports.resetAdminPassword = async (adminId, id, userId, payload) => {
    await requireOrganisation(id);
    if (!isGuid(userId)) throw fail(400, 'Administrator is invalid.');
    const password = rules.password(payload?.password);
    const changed = await DA.setAdminPassword(id, userId, await argon2.hash(password));
    if (!changed) throw fail(404, "That person isn't an administrator of this company.");
    await DA.audit({ adminId, organisationId: id, action: 'RESET_ADMIN_PASSWORD', details: { userId } });
    return { message: 'Password changed. Share it with the administrator; they can sign in with it now.' };
};

exports._test = { buildSetup, STANDARD_ROLES };

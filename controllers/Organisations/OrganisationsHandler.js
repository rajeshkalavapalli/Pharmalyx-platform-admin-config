const { handle, actingAdmin } = require('../../utils/http');
const Organisations = require('./OrganisationsService');

exports.list = handle('load companies', () => Organisations.list());
exports.get = handle('load the company', (req) => Organisations.get(req.params.organisationId));
exports.suggestCode = handle('suggest a code', (req) => Organisations.suggestCode(req.query.name));
exports.create = handle('create the company', (req) => Organisations.create(actingAdmin(req), req.body || {}), 201);
exports.update = handle('update the company', (req) => Organisations.update(actingAdmin(req), req.params.organisationId, req.body || {}));
exports.setStatus = handle('change the company status', (req) => Organisations.setStatus(actingAdmin(req), req.params.organisationId, req.body?.status));
exports.resetAdminPassword = handle('reset the password', (req) =>
    Organisations.resetAdminPassword(actingAdmin(req), req.params.organisationId, req.params.userId, req.body || {})
);

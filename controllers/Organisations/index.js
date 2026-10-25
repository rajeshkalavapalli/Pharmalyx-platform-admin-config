const express = require('express');

const router = express.Router();

const Organisations = require('./OrganisationsHandler');

// Companies (organisations). Every route needs a signed-in platform owner.
router.get('/organisations', Organisations.list);
router.get('/organisations/suggest-code', Organisations.suggestCode);
router.post('/organisations', Organisations.create);
router.get('/organisations/:organisationId', Organisations.get);
router.patch('/organisations/:organisationId', Organisations.update);
router.post('/organisations/:organisationId/status', Organisations.setStatus);
router.post('/organisations/:organisationId/admins/:userId/password', Organisations.resetAdminPassword);

module.exports = router;

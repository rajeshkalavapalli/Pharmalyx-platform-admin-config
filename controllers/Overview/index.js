const express = require('express');

const router = express.Router();

const Overview = require('./OverviewHandler');

// Platform overview: how every company is doing. Needs a signed-in platform owner.
router.get('/overview', Overview.get);

module.exports = router;

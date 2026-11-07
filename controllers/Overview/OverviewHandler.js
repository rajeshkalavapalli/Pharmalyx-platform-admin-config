const { handle } = require('../../utils/http');
const Overview = require('./OverviewService');

exports.get = handle('load the overview', () => Overview.get());

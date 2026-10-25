const { handle, actingAdmin } = require('../../utils/http');
const AuthService = require('./AuthService');

exports.login = handle('sign in', (req) => AuthService.login(req.body || {}));
exports.me = handle('load your account', (req) => AuthService.me(actingAdmin(req)));

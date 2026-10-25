const express = require('express');

const router = express.Router();

const Auth = require('./AuthHandler');

// Platform owner sign-in (POST /login is public; see utils/auth.js PUBLIC_ROUTES).
router.post('/login', Auth.login);
router.get('/me', Auth.me);

module.exports = router;

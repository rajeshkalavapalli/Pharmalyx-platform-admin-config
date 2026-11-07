require('dotenv').config({ quiet: true });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { authenticate } = require('./utils/auth');
const Auth = require('./controllers/Auth');
const Organisations = require('./controllers/Organisations');

const app = express();

// Standard security headers. Photos and receipts are shown by the web app from another address,
// so files may be read cross-origin; nothing here is a web page, so no page policy is needed.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
// Behind Render's proxy: req.ip is the caller's address (used to slow down password guessing).
app.set('trust proxy', 1);

app.use(express.json({ limit: '100kb' }));
// CORS_ORIGINS: comma-separated web addresses allowed to call the API (the hosted web app).
// Not set: on a hosted server (Render sets RENDER) only our own sites; on a local machine any origin.
// The phone app sends no Origin header, so CORS never blocks it.
const DEFAULT_ORIGINS = ['https://pharmalyx-dev-platform-admin-ui.onrender.com'];
const configuredOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
const allowedOrigins = configuredOrigins.length ? configuredOrigins : process.env.RENDER ? DEFAULT_ORIGINS : [];
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : {}));

// Every /platform route needs a signed-in platform owner, except POST /platform/login.
app.use('/platform', authenticate);
app.use('/platform', Auth);
app.use('/platform', Organisations);

const PORT = Number(process.env.PORT) || 5001;

app.listen(PORT, () => {
    console.log(`Pharmalyx Platform API running on port ${PORT}`);
});

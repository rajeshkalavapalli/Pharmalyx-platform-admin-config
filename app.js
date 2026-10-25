require('dotenv').config({ quiet: true });

const express = require('express');
const cors = require('cors');

const { authenticate } = require('./utils/auth');
const Auth = require('./controllers/Auth');
const Organisations = require('./controllers/Organisations');

const app = express();

app.use(express.json({ limit: '100kb' }));
app.use(cors());

// Every /platform route needs a signed-in platform owner, except POST /platform/login.
app.use('/platform', authenticate);
app.use('/platform', Auth);
app.use('/platform', Organisations);

const PORT = Number(process.env.PORT) || 5001;

app.listen(PORT, () => {
    console.log(`Pharmalyx Platform API running on port ${PORT}`);
});

require('dotenv').config({ quiet: true });

const sql = require('mssql');

const dbConfig = {
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT),
    options: {
        // Azure SQL needs an encrypted connection (DB_ENCRYPT=true); a local SQL Server doesn't.
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_ENCRYPT !== 'true',
    },
    requestTimeout: 60000,
};

const poolPromise = new sql.ConnectionPool(dbConfig).connect();

module.exports = {
    sql,
    poolPromise,
};

// Database access for the platform API.
//
// The database keeps companies apart with Row-Level Security (see the main API's
// controllers/Organisations/schema.sql): every query must say which company it works in.
// The platform manages companies, so by default it works ACROSS companies
// (AllOrganisations = 1). While setting up one company (its roles, admin user, lists)
// it switches the transaction INTO that company, so new rows are tagged with it.
const db = require('../db');

const CONTEXT_SQL = `EXEC sp_set_session_context @key = N'OrganisationId', @value = @__OrganisationId;
EXEC sp_set_session_context @key = N'AllOrganisations', @value = @__AllOrganisations;
`;

const ACROSS = { __OrganisationId: null, __AllOrganisations: 1 };
const inside = (organisationId) => ({ __OrganisationId: String(organisationId).toLowerCase(), __AllOrganisations: null });

const addInputs = (request, inputs) => Object.entries(inputs).forEach(([name, value]) => request.input(name, value));

// One query across companies.
const customQuery = async (sqlQuery, inputs = {}) => {
    const pool = await db.poolPromise;
    const request = pool.request();
    addInputs(request, { ...inputs, ...ACROSS });
    const result = await request.query(CONTEXT_SQL + sqlQuery);
    return result.recordset ?? result.rowsAffected ?? result;
};

// Runs work(tx) in one transaction. tx.run(sql, inputs) returns the recordset;
// tx.useOrganisation(id) / tx.acrossOrganisations() switch the company for what follows.
// Anything thrown rolls everything back.
const inTransaction = async (work) => {
    const pool = await db.poolPromise;
    const transaction = pool.transaction();
    await transaction.begin();

    const setContext = async (inputs) => {
        const request = new db.sql.Request(transaction);
        addInputs(request, inputs);
        await request.query(CONTEXT_SQL);
    };

    try {
        await setContext(ACROSS);
        const tx = {
            run: async (sqlText, inputs = {}) => {
                const request = new db.sql.Request(transaction);
                addInputs(request, inputs);
                const result = await request.query(sqlText);
                return result.recordset || [];
            },
            useOrganisation: (organisationId) => setContext(inside(organisationId)),
            acrossOrganisations: () => setContext(ACROSS),
        };
        const result = await work(tx);
        await transaction.commit();
        return result;
    } catch (error) {
        await transaction.rollback().catch(() => null);
        throw error;
    }
};

module.exports = { customQuery, inTransaction };

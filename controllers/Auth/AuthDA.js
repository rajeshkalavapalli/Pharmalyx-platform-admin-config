const { customQuery } = require('../../utils/dbFunctions');
const sql = require('./sql');

exports.getAdminByUserName = async (userName) => (await customQuery(sql.GET_ADMIN_BY_USERNAME(), { UserName: userName }))[0] || null;
exports.getAdmin = async (id) => (await customQuery(sql.GET_ADMIN(), { Id: id }))[0] || null;
exports.markSignedIn = (id) => customQuery(sql.MARK_SIGNED_IN(), { Id: id });

// Platform audit: who did what to which company. A failure here is logged, never thrown.
exports.audit = async ({ adminId = null, organisationId = null, action, details = null }) => {
    try {
        await customQuery(sql.INSERT_AUDIT(), {
            PlatformAdminId: adminId,
            OrganisationId: organisationId,
            Action: action,
            Details: details == null ? null : JSON.stringify(details),
        });
    } catch (error) {
        console.error(`Platform audit not recorded (${action}):`, error.message);
    }
};

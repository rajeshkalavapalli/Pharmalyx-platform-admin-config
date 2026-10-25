const argon2 = require('argon2');

const { fail } = require('../../utils/access');
const { issueToken, checkLock, recordFailure, clearFailures } = require('../../utils/auth');
const AuthDA = require('./AuthDA');

// The same message for an unknown username and a wrong password, so usernames can't be probed.
const WRONG = 'Incorrect username or password.';

exports.login = async ({ userName, password }) => {
    const name = String(userName || '').trim();
    if (!name || !password) throw fail(400, 'Enter your username and password.');

    const locked = checkLock(name);
    if (locked) throw fail(429, locked);

    const admin = await AuthDA.getAdminByUserName(name);
    let valid = false;
    if (admin?.PasswordHash) {
        try {
            valid = await argon2.verify(admin.PasswordHash, String(password));
        } catch {
            valid = false;
        }
    }

    if (!valid) {
        recordFailure(name);
        await AuthDA.audit({ adminId: admin?.PlatformAdminId || null, action: 'SIGN_IN_FAILED', details: { userName: name } });
        throw fail(401, WRONG);
    }

    clearFailures(name);
    await AuthDA.markSignedIn(admin.PlatformAdminId);
    await AuthDA.audit({ adminId: admin.PlatformAdminId, action: 'SIGN_IN' });

    return {
        admin: { adminId: admin.PlatformAdminId, userName: admin.UserName, name: admin.Name },
        ...issueToken(admin.PlatformAdminId),
    };
};

exports.me = async (adminId) => {
    const admin = await AuthDA.getAdmin(adminId);
    if (!admin) throw fail(401, 'Your session has expired. Please sign in again.');
    return { admin: { adminId: admin.PlatformAdminId, userName: admin.UserName, name: admin.Name, lastLoginOn: admin.LastLoginOn } };
};

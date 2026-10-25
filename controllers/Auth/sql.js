module.exports = {
    GET_ADMIN_BY_USERNAME: () => `
        SELECT PlatformAdminId, UserName, Name, PasswordHash
        FROM dbo.PlatformAdmins
        WHERE UserName = @UserName AND IsActive = 1`,
    GET_ADMIN: () => `SELECT PlatformAdminId, UserName, Name, LastLoginOn FROM dbo.PlatformAdmins WHERE PlatformAdminId = @Id AND IsActive = 1`,
    MARK_SIGNED_IN: () => `UPDATE dbo.PlatformAdmins SET LastLoginOn = SYSUTCDATETIME() WHERE PlatformAdminId = @Id`,
    INSERT_AUDIT: () => `
        INSERT INTO dbo.PlatformAudit (PlatformAdminId, OrganisationId, Action, Details)
        VALUES (@PlatformAdminId, @OrganisationId, @Action, @Details)`,
};

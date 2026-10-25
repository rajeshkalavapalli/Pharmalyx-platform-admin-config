// Company queries. Lists and counts run across companies; the set-up inserts run inside the
// new company, so the database tags every new row with it (Row-Level Security default).
const DESIGNATION_LIST = "(SELECT SystemLovId FROM dbo.SystemLov WHERE SystemLovCode = 'EMPLOYEE_DESIGNATION')";
const TEMPLATE_CODE = 'DEMO'; // a new company starts with the Demo company's roles, permissions and lists

const ACTIVE_USERS = `(SELECT COUNT(*) FROM dbo.Users u WHERE u.OrganisationId = o.OrganisationId AND u.IsActive = 1)`;

// We generate these passwords, so the person chooses their own at first sign-in
// (Users.MustChangePassword; skipped until the main app's schema_password_change.sql has run).
const MUST_CHANGE_PASSWORD = `
        IF COL_LENGTH('dbo.Users', 'MustChangePassword') IS NOT NULL
            EXEC sp_executesql N'UPDATE dbo.Users SET MustChangePassword = 1 WHERE UserId = @Id', N'@Id UNIQUEIDENTIFIER', @Id = @UserId;`;

module.exports = {
    TEMPLATE_CODE,

    LIST: () => `
        SELECT o.OrganisationId, o.Name, o.Code, o.MaxUsers, o.Status, o.ContactName, o.ContactEmail, o.ContactPhone,
               o.CreatedOn, o.ModifiedOn,
               ${ACTIVE_USERS} AS ActiveUsers,
               (SELECT COUNT(*) FROM dbo.Users u WHERE u.OrganisationId = o.OrganisationId) AS TotalUsers
        FROM dbo.Organisations o
        ORDER BY o.Name`,

    GET: () => `
        SELECT o.*, ${ACTIVE_USERS} AS ActiveUsers,
               (SELECT COUNT(*) FROM dbo.Users u WHERE u.OrganisationId = o.OrganisationId) AS TotalUsers
        FROM dbo.Organisations o
        WHERE o.OrganisationId = @OrganisationId`,

    // Codes already used that start like this one (MEDRICH, MEDRICH-2, ...).
    CODES_LIKE: () => `SELECT Code FROM dbo.Organisations WHERE Code = @Base OR Code LIKE @Base + '-%'`,

    // The company's administrators (people with the ADMIN role): the only users the platform shows.
    ADMINS: () => `
        SELECT u.UserId, u.UserName, u.EmailId, LTRIM(CONCAT(u.FirstName, ' ', u.LastName)) AS Name, u.IsActive
        FROM dbo.Users u
        INNER JOIN dbo.Roles r ON r.RoleId = u.RoleId AND r.RoleCode = 'ADMIN'
        WHERE u.OrganisationId = @OrganisationId
        ORDER BY u.IsActive DESC, Name`,

    RECENT_AUDIT: () => `
        SELECT TOP 20 a.Action, a.Details, a.CreatedOn, p.Name AS AdminName
        FROM dbo.PlatformAudit a LEFT JOIN dbo.PlatformAdmins p ON p.PlatformAdminId = a.PlatformAdminId
        WHERE a.OrganisationId = @OrganisationId
        ORDER BY a.CreatedOn DESC`,

    // ---------- template (read across companies before the set-up) ----------
    TEMPLATE_ROLES: () => `
        SELECT r.RoleCode, r.RoleName,
               (SELECT rp.PermissionCode, rp.IsAllowed FROM dbo.RolePermissions rp WHERE rp.RoleId = r.RoleId FOR JSON PATH) AS Permissions
        FROM dbo.Roles r
        INNER JOIN dbo.Organisations o ON o.OrganisationId = r.OrganisationId AND o.Code = '${TEMPLATE_CODE}'
        WHERE r.IsActive = 1`,
    TEMPLATE_DESIGNATIONS: () => `
        SELECT d.SystemLovDetailCode AS Code, d.SystemLovDetailName AS Name
        FROM dbo.SystemLovDetails d
        INNER JOIN dbo.Organisations o ON o.OrganisationId = d.OrganisationId AND o.Code = '${TEMPLATE_CODE}'
        WHERE d.SystemLovId = ${DESIGNATION_LIST} AND ISNULL(d.IsActive, 1) = 1`,
    TEMPLATE_LEAVE_TYPES: () => `
        SELECT l.Code, l.Name, l.AnnualQuota, l.AllowHalfDay, l.IsPaid, l.SortOrder
        FROM dbo.LeaveTypes l
        INNER JOIN dbo.Organisations o ON o.OrganisationId = l.OrganisationId AND o.Code = '${TEMPLATE_CODE}'
        WHERE l.IsActive = 1`,
    ALL_PERMISSION_CODES: () => `SELECT PermissionCode FROM dbo.Permissions`,

    // ---------- set-up of a new company ----------
    INSERT_ORGANISATION: () => `
        INSERT INTO dbo.Organisations (OrganisationId, Name, Code, MaxUsers, Status, ContactName, ContactEmail, ContactPhone, Notes, CreatedBy)
        VALUES (@OrganisationId, @Name, @Code, @MaxUsers, 'ACTIVE', @ContactName, @ContactEmail, @ContactPhone, @Notes, @CreatedBy)`,
    INSERT_ROLES: () => `
        INSERT INTO dbo.Roles (RoleId, RoleCode, RoleName, IsActive, CreatedOn)
        SELECT j.RoleId, j.RoleCode, j.RoleName, 1, SYSUTCDATETIME()
        FROM OPENJSON(@Rows) WITH (RoleId UNIQUEIDENTIFIER, RoleCode VARCHAR(50), RoleName VARCHAR(100)) j`,
    INSERT_ROLE_PERMISSIONS: () => `
        INSERT INTO dbo.RolePermissions (RoleId, PermissionCode, IsAllowed, ModifiedOn)
        SELECT j.RoleId, j.PermissionCode, j.IsAllowed, SYSUTCDATETIME()
        FROM OPENJSON(@Rows) WITH (RoleId UNIQUEIDENTIFIER, PermissionCode VARCHAR(100), IsAllowed BIT) j`,
    INSERT_DESIGNATIONS: () => `
        INSERT INTO dbo.SystemLovDetails (SystemLovDetailId, SystemLovDetailCode, SystemLovDetailName, SystemLovId, IsActive)
        SELECT j.Id, j.Code, j.Name, ${DESIGNATION_LIST}, 1
        FROM OPENJSON(@Rows) WITH (Id UNIQUEIDENTIFIER, Code VARCHAR(50), Name VARCHAR(100)) j`,
    INSERT_LEAVE_TYPES: () => `
        INSERT INTO dbo.LeaveTypes (LeaveTypeId, Code, Name, AnnualQuota, AllowHalfDay, IsPaid, IsActive, SortOrder, ModifiedOn)
        SELECT NEWID(), j.Code, j.Name, j.AnnualQuota, j.AllowHalfDay, j.IsPaid, 1, j.SortOrder, SYSUTCDATETIME()
        FROM OPENJSON(@Rows) WITH (Code VARCHAR(50), Name NVARCHAR(100), AnnualQuota DECIMAL(9,2), AllowHalfDay BIT, IsPaid BIT, SortOrder INT) j`,
    INSERT_ADMIN_USER: () => `
        INSERT INTO dbo.Users (UserId, UserName, FirstName, LastName, EmailId, MobileNumber, PasswordHash, DesignationId, RoleId, IsActive, CreatedOn, ModifiedOn)
        VALUES (@UserId, @UserName, @FirstName, @LastName, @EmailId, @MobileNumber, @PasswordHash,
                (SELECT TOP 1 d.SystemLovDetailId FROM dbo.SystemLovDetails d
                 WHERE d.SystemLovId = ${DESIGNATION_LIST} AND d.SystemLovDetailCode = 'ADMIN' AND d.OrganisationId = @OrganisationId),
                @RoleId, 1, SYSUTCDATETIME(), SYSUTCDATETIME());
        ${MUST_CHANGE_PASSWORD}`,
    INSERT_AUDIT: () => `
        INSERT INTO dbo.PlatformAudit (PlatformAdminId, OrganisationId, Action, Details)
        VALUES (@PlatformAdminId, @OrganisationId, @Action, @Details)`,

    // ---------- changes ----------
    UPDATE: (columns) => `
        UPDATE dbo.Organisations SET ${columns.map((c) => `${c} = @${c}`).join(', ')}, ModifiedOn = SYSUTCDATETIME()
        WHERE OrganisationId = @OrganisationId`,
    SET_STATUS: () => `UPDATE dbo.Organisations SET Status = @Status, ModifiedOn = SYSUTCDATETIME() WHERE OrganisationId = @OrganisationId`,
    // Only an administrator of that company.
    SET_ADMIN_PASSWORD: () => `
        UPDATE u SET u.PasswordHash = @PasswordHash, u.ModifiedOn = SYSUTCDATETIME()
        FROM dbo.Users u INNER JOIN dbo.Roles r ON r.RoleId = u.RoleId AND r.RoleCode = 'ADMIN'
        WHERE u.UserId = @UserId AND u.OrganisationId = @OrganisationId;
        ${MUST_CHANGE_PASSWORD}`,
};

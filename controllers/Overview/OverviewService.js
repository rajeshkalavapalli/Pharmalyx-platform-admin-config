const { customQuery } = require('../../utils/dbFunctions');

// Platform overview for the owner: companies, seats, growth and usage health.
// Usage is counts only (how many visits, how many people working) - never names, doctors or other company data.

const SQL = {
    COMPANIES: `
        SELECT o.OrganisationId, o.Name, o.Code, o.Status, o.MaxUsers, o.CreatedOn,
               (SELECT COUNT(*) FROM dbo.Users u WHERE u.OrganisationId = o.OrganisationId AND u.IsActive = 1) AS ActiveUsers,
               (SELECT COUNT(*) FROM dbo.Visits v WHERE v.OrganisationId = o.OrganisationId AND v.VisitDate >= @Since7) AS Visits7,
               (SELECT COUNT(*) FROM dbo.Visits v WHERE v.OrganisationId = o.OrganisationId AND v.VisitDate >= @Since30) AS Visits30,
               (SELECT COUNT(DISTINCT v.UserId) FROM dbo.Visits v WHERE v.OrganisationId = o.OrganisationId AND v.VisitDate >= @Since7) AS FieldUsers7,
               (SELECT COUNT(*) FROM dbo.Orders r WHERE r.OrganisationId = o.OrganisationId AND r.OrderDate >= @Since30 AND r.Status <> 'CANCELLED') AS Orders30,
               (SELECT MAX(x.At) FROM (
                    SELECT MAX(v.CreatedOn) AS At FROM dbo.Visits v WHERE v.OrganisationId = o.OrganisationId
                    UNION ALL SELECT MAX(r.CreatedOn) FROM dbo.Orders r WHERE r.OrganisationId = o.OrganisationId
                    UNION ALL SELECT MAX(d.SubmittedOn) FROM dbo.DailyCallReports d WHERE d.OrganisationId = o.OrganisationId
                    UNION ALL SELECT MAX(a.CreatedOn) FROM dbo.AuditLog a WHERE a.OrganisationId = o.OrganisationId
               ) x) AS LastActivity
        FROM dbo.Organisations o
        ORDER BY o.Name`,

    // Visits per day across all companies, last 14 days (platform-wide usage trend).
    DAILY: `
        SELECT v.VisitDate AS Day, COUNT(*) AS Visits, COUNT(DISTINCT v.UserId) AS People
        FROM dbo.Visits v
        WHERE v.VisitDate >= @Since14
        GROUP BY v.VisitDate
        ORDER BY v.VisitDate`,
};

const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return dayKey(d);
};
const num = (value) => Number(value) || 0;

// Health from usage: working (visits this week), quiet (none this week, some this month), idle (nothing for 30 days).
const healthOf = (row) => {
    if (row.Status === 'PAUSED') return 'PAUSED';
    if (num(row.Visits7) > 0) return 'ACTIVE';
    if (num(row.Visits30) > 0) return 'QUIET';
    return 'IDLE';
};

exports.get = async () => {
    const inputs = { Since7: daysAgo(6), Since14: daysAgo(13), Since30: daysAgo(29) };
    const [rows, daily] = await Promise.all([customQuery(SQL.COMPANIES, inputs), customQuery(SQL.DAILY, inputs).catch(() => [])]);

    const companies = rows.map((row) => {
        const seatsUsed = num(row.ActiveUsers);
        const seats = num(row.MaxUsers);
        return {
            organisationId: row.OrganisationId,
            name: row.Name,
            code: row.Code,
            status: row.Status,
            createdOn: row.CreatedOn,
            seatsUsed,
            seats,
            seatPct: seats ? Math.round((seatsUsed / seats) * 100) : null,
            visits7: num(row.Visits7),
            visits30: num(row.Visits30),
            fieldUsers7: num(row.FieldUsers7),
            orders30: num(row.Orders30),
            lastActivity: row.LastActivity,
            health: healthOf(row),
        };
    });

    // Companies joined per month, last 12 months.
    const growth = [];
    const now = new Date();
    for (let i = 11; i >= 0; i -= 1) {
        const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = dayKey(month).slice(0, 7);
        const joined = companies.filter((c) => c.createdOn && dayKey(new Date(c.createdOn)).slice(0, 7) === key).length;
        growth.push({ month: key, label: month.toLocaleDateString('en-IN', { month: 'short' }), joined });
    }
    let running = companies.filter((c) => c.createdOn && dayKey(new Date(c.createdOn)).slice(0, 7) < growth[0].month).length;
    growth.forEach((g) => {
        running += g.joined;
        g.total = running;
    });

    // Fill the 14-day trend so days without visits show as 0.
    const byDay = new Map(daily.map((d) => [dayKey(new Date(d.Day)), d]));
    const trend = Array.from({ length: 14 }, (_, i) => {
        const key = daysAgo(13 - i);
        const d = byDay.get(key);
        return { day: key, visits: num(d?.Visits), people: num(d?.People) };
    });

    const live = companies.filter((c) => c.status !== 'PAUSED');
    const seatsUsed = live.reduce((s, c) => s + c.seatsUsed, 0);
    const seats = live.reduce((s, c) => s + c.seats, 0);
    const thisMonth = dayKey(now).slice(0, 7);

    return {
        totals: {
            companies: companies.length,
            active: companies.filter((c) => c.status === 'ACTIVE').length,
            paused: companies.filter((c) => c.status === 'PAUSED').length,
            newThisMonth: companies.filter((c) => c.createdOn && dayKey(new Date(c.createdOn)).slice(0, 7) === thisMonth).length,
            seatsUsed,
            seats,
            seatPct: seats ? Math.round((seatsUsed / seats) * 100) : null,
            visits7: companies.reduce((s, c) => s + c.visits7, 0),
            fieldUsers7: companies.reduce((s, c) => s + c.fieldUsers7, 0),
        },
        attention: {
            nearLimit: live.filter((c) => c.seatPct != null && c.seatPct >= 90).map((c) => ({ organisationId: c.organisationId, name: c.name, seatPct: c.seatPct })),
            idle: live.filter((c) => c.health === 'IDLE' || c.health === 'QUIET').map((c) => ({ organisationId: c.organisationId, name: c.name, health: c.health, lastActivity: c.lastActivity })),
            paused: companies.filter((c) => c.status === 'PAUSED').map((c) => ({ organisationId: c.organisationId, name: c.name })),
        },
        growth,
        trend,
        companies: companies.sort((a, b) => b.visits7 - a.visits7 || a.name.localeCompare(b.name)),
    };
};

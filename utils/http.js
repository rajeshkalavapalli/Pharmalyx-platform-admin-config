// Standard handler wrapper: runs `work(req)` and sends its result, or a clean error.
// Errors with a `status` (from utils/access `fail`) show their own message;
// anything else becomes "Failed to <label>." with the cause in `error`.
const handle = (label, work, successStatus = 200) => async (req, res) => {
    try {
        const result = await work(req);
        return res.status(successStatus).json(result);
    } catch (error) {
        if (!error.status) console.error(`Error trying to ${label}:`, error);

        return res.status(error.status || 500).json({
            message: error.status ? error.message : `Failed to ${label}.`,
            error: error.message,
        });
    }
};

// The signed-in platform admin (set by authenticate()).
const actingAdmin = (req) => req.admin?.adminId || null;

module.exports = { handle, actingAdmin };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Error carrying an HTTP status; handlers send `message` as-is when `status` is set.
const fail = (status, message) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const isGuid = (value) => GUID.test(String(value ?? ''));

const lower = (id) => (id == null ? null : String(id).toLowerCase());

module.exports = { fail, isGuid, lower };

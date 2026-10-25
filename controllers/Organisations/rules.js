// Input rules for companies (pure: no database).
const crypto = require('crypto');

const { fail } = require('../../utils/access');

const MAX_USERS_LIMIT = 100000;

const text = (value, label, { required = false, max = 150, min = 0 } = {}) => {
    const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!clean) {
        if (required) throw fail(400, `${label} is required.`);
        return null;
    }
    if (clean.length < min) throw fail(400, `${label} must be at least ${min} characters.`);
    if (clean.length > max) throw fail(400, `${label} must be ${max} characters or fewer.`);
    return clean;
};

// Company code made from the name: "Medrich Pharma Pvt Ltd" -> "MEDRICH-PHARMA".
// Common suffixes are dropped; the result is 2-30 capital letters, digits and hyphens.
const codeFromName = (name) => {
    const code = String(name ?? '')
        .toUpperCase()
        .replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CO|COMPANY)\b\.?/g, ' ')
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 26) // room for "-99" when the code is taken
        .replace(/-+$/, '');
    return code.length >= 2 ? code : `CO-${code || 'NEW'}`;
};

// The first free code: MEDRICH-PHARMA, then MEDRICH-PHARMA-2, -3, ... (`taken` is a Set).
const uniqueCode = (name, taken) => {
    const base = codeFromName(name);
    if (!taken.has(base)) return base;
    for (let n = 2; n < 1000; n += 1) {
        const candidate = `${base}-${n}`;
        if (!taken.has(candidate)) return candidate;
    }
    throw fail(409, 'Could not make a free company code from this name. Use a more specific name.');
};

const maxUsers = (value) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > MAX_USERS_LIMIT) throw fail(400, `User limit must be a whole number from 1 to ${MAX_USERS_LIMIT}.`);
    return number;
};

const email = (value, label = 'Email', { required = false } = {}) => {
    const clean = text(value, label, { max: 100, required });
    if (clean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw fail(400, `${label} isn't a valid email address.`);
    return clean ? clean.toLowerCase() : null;
};

const phone = (value, label = 'Phone', { required = false } = {}) => {
    const clean = text(value, label, { max: 30, required });
    if (clean && !/^[+\d][\d\s-]{6,29}$/.test(clean)) throw fail(400, `${label} isn't a valid phone number.`);
    return clean;
};

// At least 8 characters with a letter and a digit.
const password = (value) => {
    const clean = String(value ?? '');
    if (clean.length < 8 || !/[A-Za-z]/.test(clean) || !/\d/.test(clean)) throw fail(400, 'Password must be at least 8 characters and include a letter and a digit.');
    if (clean.length > 128) throw fail(400, 'Password must be 128 characters or fewer.');
    return clean;
};

// A readable first password for the owner (letters and digits, no look-alikes such as 0/O, 1/l).
const firstPassword = () => {
    const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits = '23456789';
    const pick = (set, n) => Array.from(crypto.randomBytes(n), (b) => set[b % set.length]).join('');
    return `${pick(letters, 5)}${pick(digits, 3)}${pick(letters, 4)}`;
};

// "Rajesh Kumar Reddy" -> { firstName: "Rajesh", lastName: "Kumar Reddy" }
const splitName = (fullName) => {
    const [first, ...rest] = fullName.split(' ');
    return { firstName: first.slice(0, 100), lastName: rest.join(' ').slice(0, 100) || null };
};

// Everything needed to create a company. The owner becomes its first administrator:
// they sign in with their email, and the password is generated (shown once to the platform owner).
const newOrganisation = (payload = {}) => {
    const name = text(payload.name, 'Company name', { required: true, min: 2 });
    const ownerName = text(payload.ownerName, 'Owner name', { required: true, max: 150 });
    const ownerEmail = email(payload.ownerEmail, 'Owner email', { required: true });
    const ownerPhone = phone(payload.ownerPhone, 'Owner phone', { required: true });
    return {
        name,
        maxUsers: maxUsers(payload.maxUsers),
        notes: text(payload.notes, 'Notes', { max: 500 }),
        contactName: ownerName,
        contactEmail: ownerEmail,
        contactPhone: ownerPhone,
        admin: {
            ...splitName(ownerName),
            userName: ownerEmail,
            email: ownerEmail,
            mobile: ownerPhone,
        },
    };
};

// Editable details (the code and the owner's sign-in are fixed after creation).
const organisationChanges = (payload = {}) => {
    const changes = {};
    if (payload.name !== undefined) changes.name = text(payload.name, 'Company name', { required: true, min: 2 });
    if (payload.maxUsers !== undefined) changes.maxUsers = maxUsers(payload.maxUsers);
    if (payload.contactName !== undefined) changes.contactName = text(payload.contactName, 'Contact name');
    if (payload.contactEmail !== undefined) changes.contactEmail = email(payload.contactEmail, 'Contact email');
    if (payload.contactPhone !== undefined) changes.contactPhone = phone(payload.contactPhone, 'Contact phone');
    if (payload.notes !== undefined) changes.notes = text(payload.notes, 'Notes', { max: 500 });
    if (!Object.keys(changes).length) throw fail(400, 'Nothing to change.');
    return changes;
};

const status = (value) => {
    const clean = String(value ?? '').toUpperCase();
    if (!['ACTIVE', 'PAUSED'].includes(clean)) throw fail(400, 'Status must be ACTIVE or PAUSED.');
    return clean;
};

module.exports = { newOrganisation, organisationChanges, status, password, firstPassword, codeFromName, uniqueCode, MAX_USERS_LIMIT };

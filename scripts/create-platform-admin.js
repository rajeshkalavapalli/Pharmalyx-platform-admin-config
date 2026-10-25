// Creates a platform owner account, or sets a new password for an existing one.
// Run in a terminal:   npm run create-admin
// You type the username, name and password; the password is stored as an argon2 hash.
const readline = require('readline');
const crypto = require('crypto');
const argon2 = require('argon2');

const { customQuery } = require('../utils/dbFunctions');
const db = require('../db');

const ask = (rl, question) => new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));

// Reads a line without showing what is typed.
const askHidden = (question) =>
    new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        rl.stdoutMuted = true;
        rl._writeToOutput = (text) => {
            if (!rl.stdoutMuted || text.includes(question)) rl.output.write(text);
        };
        rl.question(question, (answer) => {
            rl.close();
            process.stdout.write('\n');
            resolve(answer);
        });
    });

const strongEnough = (password) => password.length >= 10 && /[a-z]/i.test(password) && /\d/.test(password);

(async () => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('Pharmalyx platform owner account\n');
    const userName = (await ask(rl, 'Username: ')).toLowerCase();
    if (!/^[a-z0-9._@-]{3,100}$/.test(userName)) throw new Error('Use 3-100 letters, digits or . _ @ -');

    const [existing] = await customQuery('SELECT PlatformAdminId, Name FROM dbo.PlatformAdmins WHERE UserName = @UserName', { UserName: userName });
    const name = existing ? existing.Name : await ask(rl, 'Full name: ');
    rl.close();
    if (!name) throw new Error('Enter a name.');
    if (existing) console.log(`"${userName}" already exists: you are setting a new password.`);

    const password = await askHidden('Password (at least 10 characters, with a letter and a digit): ');
    if (!strongEnough(password)) throw new Error('The password is too weak.');
    const again = await askHidden('Type it again: ');
    if (again !== password) throw new Error("The passwords don't match.");

    const hash = await argon2.hash(password);
    if (existing) {
        await customQuery('UPDATE dbo.PlatformAdmins SET PasswordHash = @Hash, IsActive = 1 WHERE PlatformAdminId = @Id', { Hash: hash, Id: existing.PlatformAdminId });
        console.log('Password updated.');
    } else {
        await customQuery('INSERT INTO dbo.PlatformAdmins (PlatformAdminId, UserName, Name, PasswordHash) VALUES (@Id, @UserName, @Name, @Hash)', {
            Id: crypto.randomUUID(),
            UserName: userName,
            Name: name,
            Hash: hash,
        });
        console.log(`Platform owner "${userName}" created. Sign in on the platform page.`);
    }
})()
    .catch((error) => {
        console.error(`Not saved: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        const pool = await db.poolPromise.catch(() => null);
        await pool?.close();
    });

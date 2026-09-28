const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { verifyPassword } = require('../utils/password');

test('database setup and admin recovery never store a plain-text password', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpfm-test-'));
  const dbPath = path.join(tempDir, 'fan_management.sqlite');
  const env = { ...process.env, DB_PATH: dbPath, ADMIN_EMAIL: 'setup-admin@example.com', ADMIN_PASSWORD: '' };
  const run = (script) => spawnSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'), env, encoding: 'utf8',
  });
  const passwordFrom = (output, label) => output.match(new RegExp(`${label} \\(shown once\\): ([^\\r\\n]+)`))?.[1];

  try {
    const setup = run('database/init.js');
    assert.equal(setup.status, 0);
    const firstPassword = passwordFrom(setup.stdout, 'Initial admin password');
    assert.ok(firstPassword && firstPassword.length >= 24);
    let db = new DatabaseSync(dbPath);
    let storedHash = db.prepare('SELECT password_hash FROM users WHERE email = ?').get(env.ADMIN_EMAIL).password_hash;
    assert.ok(!storedHash.includes(firstPassword));
    assert.equal(await verifyPassword(firstPassword, storedHash), true);
    db.close();

    const repeated = run('database/init.js');
    assert.equal(repeated.status, 0);
    assert.equal(passwordFrom(repeated.stdout, 'Initial admin password'), undefined);

    const reset = run('database/reset-admin.js');
    assert.equal(reset.status, 0);
    const secondPassword = passwordFrom(reset.stdout, 'New admin password');
    assert.ok(secondPassword && secondPassword !== firstPassword);
    db = new DatabaseSync(dbPath);
    storedHash = db.prepare('SELECT password_hash FROM users WHERE email = ?').get(env.ADMIN_EMAIL).password_hash;
    assert.ok(!storedHash.includes(secondPassword));
    assert.equal(await verifyPassword(firstPassword, storedHash), false);
    assert.equal(await verifyPassword(secondPassword, storedHash), true);
    db.close();
  } finally {
    if (!tempDir.startsWith(os.tmpdir() + path.sep)) throw new Error('Unexpected test directory');
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

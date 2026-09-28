const fs = require('node:fs');
const path = require('node:path');
const { openDatabase, databasePath } = require('./db');
const { hashPassword, makeTemporaryPassword } = require('../utils/password');

const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Set a valid ADMIN_EMAIL in .env before running db:init.');
  process.exit(1);
}

const db = openDatabase();

try {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email);
  if (existing && existing.role !== 'admin') {
    throw new Error('ADMIN_EMAIL already belongs to a member account. Choose a different email.');
  }

  if (!existing) {
    const password = makeTemporaryPassword();
    db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)')
      .run(email, hashPassword(password), 'admin');
    console.log(`Created development admin account: ${email}`);
    console.log(`Initial admin password (shown once): ${password}`);
  } else {
    console.log(`Development admin account already exists: ${email}`);
  }

  console.log(`Database ready: ${databasePath}`);
} catch (error) {
  console.error(`Database setup failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}

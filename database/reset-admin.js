const fs = require('node:fs');
const { openDatabase, databasePath } = require('./db');
const { hashPassword, makeTemporaryPassword } = require('../utils/password');

const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !fs.existsSync(databasePath)) {
  console.error('Set ADMIN_EMAIL in .env and initialize the database before resetting the admin password.');
  process.exit(1);
}

const db = openDatabase();
try {
  const admin = db.prepare("SELECT id FROM users WHERE email = ? AND role = 'admin'").get(email);
  if (!admin) throw new Error('Admin account not found. Check ADMIN_EMAIL in .env.');
  const password = makeTemporaryPassword();
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), admin.id);
  console.log(`New admin password (shown once): ${password}`);
} catch (error) {
  console.error(`Could not reset admin password: ${error.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}

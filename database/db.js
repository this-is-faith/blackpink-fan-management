const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
require('dotenv').config();

const databasePath = path.resolve(__dirname, '..', process.env.DB_PATH || 'database/fan_management.sqlite');

function openDatabase() {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  // SQLite requires this setting on every connection to enforce foreign keys.
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  return db;
}

module.exports = { openDatabase, databasePath };

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createApp } = require('../app');
const { hashPassword } = require('../utils/password');

test('login, logout, role access, and inactive accounts', async () => {
  let db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8'));
  let addUser = db.prepare('INSERT INTO users (email, password_hash, role, is_active) VALUES (?, ?, ?, ?)');
  addUser.run('admin@example.com', hashPassword('admin-test-password'), 'admin', 1);
  addUser.run('member@example.com', hashPassword('member-test-password'), 'member', 1);

  const app = createApp(db, 'test-session-secret-that-is-long-enough');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  // Leave the app as the only owner, like it is when started with npm start.
  db = null;
  addUser = null;
  global.gc();
  const get = (url, cookie) => fetch(base + url, {
    redirect: 'manual',
    headers: cookie ? { cookie } : {},
  });
  const login = (email, password) => fetch(base + '/login', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }),
  });

  try {
    assert.equal((await get('/admin')).headers.get('location'), '/');
    assert.equal((await get('/member')).headers.get('location'), '/');
    assert.match(await (await get('/missing-page')).text(), /Page not found/);

    const badLogin = await login('admin@example.com', 'wrong-password');
    assert.equal(badLogin.headers.get('location'), '/?error=1');
    assert.equal(badLogin.headers.get('set-cookie'), null);

    const adminLogin = await login('admin@example.com', 'admin-test-password');
    assert.equal(adminLogin.headers.get('location'), '/admin');
    const adminCookie = adminLogin.headers.get('set-cookie').split(';')[0];
    const emptyDashboard = await get('/admin', adminCookie);
    assert.equal(emptyDashboard.status, 200);
    assert.match(await emptyDashboard.text(), /data-stat="total">0<\/strong>/);

    const liveDb = app.locals.db;
    const addProfile = liveDb.prepare(`
      INSERT INTO member_profiles (user_id, first_name, last_name, birthdate, country, city, favorite_member, date_joined, membership_status)
      VALUES (?, 'Test', 'Member', '2000-01-01', 'Singapore', 'Singapore', 'Lisa', ?, ?)
    `);
    const today = new Date().toISOString().slice(0, 10);
    const memberId = liveDb.prepare('SELECT id FROM users WHERE email = ?').get('member@example.com').id;
    addProfile.run(memberId, today, 'active');
    const oldActive = liveDb.prepare('INSERT INTO users (email, password_hash, role, is_active) VALUES (?, ?, ?, ?)')
      .run('old@example.com', hashPassword('unused-password'), 'member', 1);
    addProfile.run(oldActive.lastInsertRowid, '2020-01-01', 'active');
    const newInactiveAccount = liveDb.prepare('INSERT INTO users (email, password_hash, role, is_active) VALUES (?, ?, ?, ?)')
      .run('inactive-account@example.com', hashPassword('unused-password'), 'member', 0);
    addProfile.run(newInactiveAccount.lastInsertRowid, today, 'active');
    const oldInactiveMembership = liveDb.prepare('INSERT INTO users (email, password_hash, role, is_active) VALUES (?, ?, ?, ?)')
      .run('inactive-membership@example.com', hashPassword('unused-password'), 'member', 1);
    addProfile.run(oldInactiveMembership.lastInsertRowid, '2020-01-01', 'inactive');

    const dashboard = await get('/admin', adminCookie);
    const dashboardHtml = await dashboard.text();
    assert.match(dashboardHtml, /data-stat="total">4<\/strong>/);
    assert.match(dashboardHtml, /data-stat="active">2<\/strong>/);
    assert.match(dashboardHtml, /data-stat="new">2<\/strong>/);
    const forbidden = await get('/member', adminCookie);
    assert.equal(forbidden.status, 403);
    assert.match(await forbidden.text(), /Access denied/);

    const logout = await fetch(base + '/logout', {
      method: 'POST', redirect: 'manual', headers: { cookie: adminCookie },
    });
    assert.equal(logout.headers.get('location'), '/');
    assert.equal((await get('/admin', adminCookie)).headers.get('location'), '/');

    const memberLogin = await login('member@example.com', 'member-test-password');
    assert.equal(memberLogin.headers.get('location'), '/member');
    const memberCookie = memberLogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await get('/member', memberCookie)).status, 200);
    assert.equal((await get('/admin', memberCookie)).status, 403);

    app.locals.db.prepare('UPDATE users SET is_active = 0 WHERE email = ?').run('member@example.com');
    assert.equal((await get('/member', memberCookie)).headers.get('location'), '/');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    app.locals.db.close();
  }
});

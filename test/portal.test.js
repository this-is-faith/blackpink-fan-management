const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createApp } = require('../app');
const { hashPassword } = require('../utils/password');

test('member portal edits only the signed-in profile and changes password', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8'));
  const addUser = db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)');
  addUser.run('admin@example.com', hashPassword('admin-test-password'), 'admin');
  const firstUserId = addUser.run('one@example.com', hashPassword('member-one-password'), 'member').lastInsertRowid;
  const secondUserId = addUser.run('two@example.com', hashPassword('member-two-password'), 'member').lastInsertRowid;
  const addProfile = db.prepare(`
    INSERT INTO member_profiles (user_id, first_name, last_name, birthdate, country, city, favorite_member, date_joined)
    VALUES (?, ?, ?, '2000-05-10', 'Singapore', 'Singapore', 'Lisa', '2025-01-01')
  `);
  addProfile.run(firstUserId, 'Mina', 'Park');
  addProfile.run(secondUserId, 'Jae', 'Kim');

  const app = createApp(db, 'test-session-secret-that-is-long-enough');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (url, cookie) => fetch(base + url, { redirect: 'manual', headers: cookie ? { cookie } : {} });
  const post = (url, fields, cookie) => fetch(base + url, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) },
    body: new URLSearchParams(fields),
  });
  const changes = {
    first_name: 'Min', last_name: 'Park', email: 'min@example.com', birthdate: '2000-05-10',
    gender: '', country: 'Singapore', city: 'Seoul', favorite_member: 'Rosé',
    profile_picture_url: '', short_bio: 'BLINK forever',
  };

  try {
    assert.equal((await get('/member/profile')).headers.get('location'), '/');
    const adminLogin = await post('/login', { email: 'admin@example.com', password: 'admin-test-password' });
    const adminCookie = adminLogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await get('/member', adminCookie)).status, 403);

    const firstLogin = await post('/login', { email: 'one@example.com', password: 'member-one-password' });
    assert.equal(firstLogin.headers.get('location'), '/member');
    const cookie = firstLogin.headers.get('set-cookie').split(';')[0];
    const home = await get('/member', cookie);
    const homeHtml = await home.text();
    assert.equal(home.status, 200);
    assert.match(homeHtml, /Welcome, Mina!/);
    assert.match(homeHtml, /BP-00001/);
    assert.match(homeHtml, /2025-01-01/);
    const profileHtml = await (await get('/member/profile', cookie)).text();
    assert.match(profileHtml, /one@example.com/);
    assert.ok(!profileHtml.includes('two@example.com'));
    assert.equal((await get('/member/profile/edit', cookie)).status, 200);
    assert.equal((await get('/member/profile/2', cookie)).status, 404);
    assert.equal((await get('/admin/members', cookie)).status, 403);

    const invalid = await post('/member/profile/edit', { ...changes, birthdate: '2035-01-01' }, cookie);
    assert.equal(invalid.status, 400);
    assert.equal(db.prepare('SELECT first_name FROM member_profiles WHERE user_id = ?').get(firstUserId).first_name, 'Mina');
    const duplicate = await post('/member/profile/edit', { ...changes, email: 'two@example.com' }, cookie);
    assert.equal(duplicate.status, 400);
    assert.match(await duplicate.text(), /already in use/);

    const edited = await post('/member/profile/edit', {
      ...changes, user_id: String(secondUserId), membership_status: 'inactive', date_joined: '1900-01-01', is_active: '0',
    }, cookie);
    assert.equal(edited.status, 303);
    assert.equal(edited.headers.get('location'), '/member/profile?notice=updated');
    assert.match(await (await get(edited.headers.get('location'), cookie)).text(), /Your profile has been updated/);
    const own = db.prepare('SELECT first_name, city, favorite_member, date_joined, membership_status FROM member_profiles WHERE user_id = ?').get(firstUserId);
    const other = db.prepare('SELECT first_name, city FROM member_profiles WHERE user_id = ?').get(secondUserId);
    assert.deepEqual([own.first_name, own.city, own.favorite_member, own.date_joined, own.membership_status], ['Min', 'Seoul', 'Rosé', '2025-01-01', 'active']);
    assert.deepEqual([other.first_name, other.city], ['Jae', 'Singapore']);
    assert.equal(db.prepare('SELECT email, is_active FROM users WHERE id = ?').get(firstUserId).email, 'min@example.com');
    assert.equal(db.prepare('SELECT is_active FROM users WHERE id = ?').get(firstUserId).is_active, 1);
    assert.match(await (await get('/member/profile', cookie)).text(), /Min Park/);

    const wrong = await post('/member/password', { current_password: 'wrong', new_password: 'new-member-password', confirm_password: 'new-member-password' }, cookie);
    assert.equal(wrong.status, 400);
    const mismatch = await post('/member/password', { current_password: 'member-one-password', new_password: 'new-member-password', confirm_password: 'different-password' }, cookie);
    assert.equal(mismatch.status, 400);
    const changed = await post('/member/password', { current_password: 'member-one-password', new_password: 'new-member-password', confirm_password: 'new-member-password' }, cookie);
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/member/password?changed=1');
    const newCookie = changed.headers.get('set-cookie').split(';')[0];
    assert.match(await (await get('/member/password?changed=1', newCookie)).text(), /Your password has been changed/);
    assert.equal((await post('/login', { email: 'min@example.com', password: 'member-one-password' })).headers.get('location'), '/?error=1');
    assert.equal((await post('/login', { email: 'min@example.com', password: 'new-member-password' })).headers.get('location'), '/member');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createApp } = require('../app');
const { hashPassword } = require('../utils/password');

test('admin member management validates, searches, edits, and deactivates', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8'));
  db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)')
    .run('admin@example.com', hashPassword('admin-test-password'), 'admin');

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
  const member = {
    first_name: 'Mina', last_name: 'Park', email: 'mina@example.com',
    password: 'member-test-password', birthdate: '2000-05-10', gender: '',
    country: 'Singapore', city: 'Singapore', favorite_member: 'Lisa',
    profile_picture_url: '', short_bio: '<script>alert(1)</script>',
  };

  try {
    assert.equal((await get('/admin/members')).headers.get('location'), '/');
    const adminLogin = await post('/login', { email: 'admin@example.com', password: 'admin-test-password' });
    const adminCookie = adminLogin.headers.get('set-cookie').split(';')[0];

    assert.match(await (await get('/admin/members', adminCookie)).text(), /No members yet/);
    assert.equal((await get('/admin/members/new', adminCookie)).status, 200);
    const invalid = await post('/admin/members', { ...member, birthdate: '2035-01-01' }, adminCookie);
    assert.equal(invalid.status, 400);
    assert.match(await invalid.text(), /valid birthdate/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);

    const added = await post('/admin/members', member, adminCookie);
    assert.equal(added.status, 303);
    assert.equal(added.headers.get('location'), '/admin/members/1?notice=added');
    assert.match(await (await get(added.headers.get('location'), adminCookie)).text(), /Member added successfully/);
    const stored = db.prepare('SELECT password_hash FROM users WHERE email = ?').get(member.email);
    assert.ok(stored.password_hash.startsWith('scrypt:'));
    assert.ok(!stored.password_hash.includes(member.password));

    const profile = await get('/admin/members/1', adminCookie);
    const profileHtml = await profile.text();
    assert.equal(profile.status, 200);
    assert.match(profileHtml, /BP-00001/);
    assert.match(profileHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.ok(!profileHtml.includes('<script>alert(1)</script>'));
    assert.ok(!profileHtml.includes(member.password));
    assert.match(await (await get('/admin/members?q=BP-00001', adminCookie)).text(), /Mina Park/);
    assert.match(await (await get('/admin/members?q=missing', adminCookie)).text(), /No matching members/);

    const duplicate = await post('/admin/members', member, adminCookie);
    assert.equal(duplicate.status, 400);
    assert.match(await duplicate.text(), /already in use/);

    const edit = await post('/admin/members/1/edit', { ...member, first_name: 'Min', email: 'min@example.com' }, adminCookie);
    assert.equal(edit.status, 303);
    assert.match(await (await get(edit.headers.get('location'), adminCookie)).text(), /Member details saved/);
    assert.match(await (await get('/admin/members/1', adminCookie)).text(), /Min Park/);
    assert.equal(db.prepare('SELECT email FROM users WHERE id = 2').get().email, 'min@example.com');

    const memberLogin = await post('/login', { email: 'min@example.com', password: member.password });
    const memberCookie = memberLogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await get('/admin/members', memberCookie)).status, 403);
    assert.equal((await post('/admin/members/1/edit', { ...member, first_name: 'Hacked' }, memberCookie)).status, 403);

    const deactivated = await post('/admin/members/1/deactivate', {}, adminCookie);
    assert.equal(deactivated.status, 303);
    assert.match(await (await get(deactivated.headers.get('location'), adminCookie)).text(), /Member deactivated/);
    assert.equal(db.prepare('SELECT is_active FROM users WHERE id = 2').get().is_active, 0);
    assert.equal(db.prepare('SELECT membership_status FROM member_profiles WHERE id = 1').get().membership_status, 'inactive');
    assert.equal((await get('/member', memberCookie)).headers.get('location'), '/');
    assert.equal((await post('/login', { email: 'min@example.com', password: member.password })).headers.get('location'), '/?error=1');
    assert.match(await (await get('/admin', adminCookie)).text(), /data-stat="active">0<\/strong>/);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});

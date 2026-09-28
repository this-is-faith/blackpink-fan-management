const express = require('express');
const { hashPassword } = require('../utils/password');
const { FAVORITES, validateMember, calculateAge, memberId } = require('../utils/member');

function memberRoutes(db) {
  const router = express.Router();
  const listAll = db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.country, p.favorite_member, p.date_joined,
           u.email, CASE WHEN u.is_active = 1 AND p.membership_status = 'active' THEN 'active' ELSE 'inactive' END AS status
    FROM member_profiles p JOIN users u ON u.id = p.user_id
    WHERE u.role = 'member' ORDER BY p.date_joined DESC, p.id DESC
  `);
  const search = db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.country, p.favorite_member, p.date_joined,
           u.email, CASE WHEN u.is_active = 1 AND p.membership_status = 'active' THEN 'active' ELSE 'inactive' END AS status
    FROM member_profiles p JOIN users u ON u.id = p.user_id
    WHERE u.role = 'member' AND (
      instr(lower(p.first_name || ' ' || p.last_name), lower(?)) > 0 OR
      instr(lower(u.email), lower(?)) > 0 OR
      instr(lower(printf('BP-%05d', p.id)), lower(?)) > 0
    ) ORDER BY p.date_joined DESC, p.id DESC
  `);
  const getMember = db.prepare(`
    SELECT p.*, u.email, u.is_active
    FROM member_profiles p JOIN users u ON u.id = p.user_id
    WHERE p.id = ? AND u.role = 'member'
  `);
  const emailExists = db.prepare('SELECT id FROM users WHERE email = ?');
  const addUser = db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)');
  const addProfile = db.prepare(`
    INSERT INTO member_profiles
      (user_id, first_name, last_name, birthdate, gender, country, city, favorite_member, profile_picture_url, short_bio)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateUser = db.prepare('UPDATE users SET email = ? WHERE id = ?');
  const updateProfile = db.prepare(`
    UPDATE member_profiles SET first_name = ?, last_name = ?, birthdate = ?, gender = ?,
      country = ?, city = ?, favorite_member = ?, profile_picture_url = ?, short_bio = ?
    WHERE id = ?
  `);
  const deactivateUser = db.prepare('UPDATE users SET is_active = 0 WHERE id = ?');
  const deactivateProfile = db.prepare("UPDATE member_profiles SET membership_status = 'inactive' WHERE id = ?");

  function transaction(work) {
    db.exec('BEGIN');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function findMember(req, res) {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(404).render('error', { title: 'Member not found', message: 'This member profile could not be found.', homeHref: '/admin/members' });
      return null;
    }
    const member = getMember.get(id);
    if (!member) res.status(404).render('error', { title: 'Member not found', message: 'This member profile could not be found.', homeHref: '/admin/members' });
    return member;
  }

  function form(res, { mode, values, errors = [], id = null }) {
    res.render('members/form', {
      title: mode === 'new' ? 'Add member' : 'Edit member',
      mode, values, errors, favorites: FAVORITES,
      action: mode === 'new' ? '/admin/members' : `/admin/members/${id}/edit`,
    });
  }

  router.get('/', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const members = q ? search.all(q, q, q) : listAll.all();
    res.render('members/list', { title: 'Members', members, q, memberId });
  });

  router.get('/new', (req, res) => {
    form(res, { mode: 'new', values: {} });
  });

  router.post('/', (req, res) => {
    const { values, password, errors } = validateMember(req.body || {}, { creating: true });
    if (emailExists.get(values.email)) errors.push('That email address is already in use.');
    if (errors.length) return form(res.status(400), { mode: 'new', values, errors });

    const id = transaction(() => {
      const userId = addUser.run(values.email, hashPassword(password), 'member').lastInsertRowid;
      return addProfile.run(userId, values.first_name, values.last_name, values.birthdate,
        values.gender || null, values.country, values.city, values.favorite_member,
        values.profile_picture_url || null, values.short_bio || null).lastInsertRowid;
    });
    res.redirect(303, `/admin/members/${id}?notice=added`);
  });

  router.get('/:id', (req, res) => {
    const member = findMember(req, res);
    if (!member) return;
    res.render('members/profile', {
      title: `${member.first_name} ${member.last_name}`,
      member, memberId: memberId(member.id), age: calculateAge(member.birthdate),
      status: member.is_active && member.membership_status === 'active' ? 'active' : 'inactive',
      notice: { added: 'Member added successfully.', updated: 'Member details saved.', deactivated: 'Member deactivated. They can no longer log in.' }[req.query.notice] || null,
    });
  });

  router.get('/:id/edit', (req, res) => {
    const member = findMember(req, res);
    if (!member) return;
    form(res, { mode: 'edit', values: member, id: member.id });
  });

  router.post('/:id/edit', (req, res) => {
    const member = findMember(req, res);
    if (!member) return;
    const { values, errors } = validateMember(req.body || {});
    values.id = member.id;
    const emailOwner = emailExists.get(values.email);
    if (emailOwner && emailOwner.id !== member.user_id) errors.push('That email address is already in use.');
    if (errors.length) return form(res.status(400), { mode: 'edit', values, errors, id: member.id });

    transaction(() => {
      updateUser.run(values.email, member.user_id);
      updateProfile.run(values.first_name, values.last_name, values.birthdate,
        values.gender || null, values.country, values.city, values.favorite_member,
        values.profile_picture_url || null, values.short_bio || null, member.id);
    });
    res.redirect(303, `/admin/members/${member.id}?notice=updated`);
  });

  router.post('/:id/deactivate', (req, res) => {
    const member = findMember(req, res);
    if (!member) return;
    transaction(() => {
      deactivateUser.run(member.user_id);
      deactivateProfile.run(member.id);
    });
    res.redirect(303, `/admin/members/${member.id}?notice=deactivated`);
  });

  return router;
}

module.exports = memberRoutes;

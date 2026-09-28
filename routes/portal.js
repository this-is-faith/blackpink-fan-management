const express = require('express');
const { hashPassword, verifyPassword } = require('../utils/password');
const { FAVORITES, validateMember, calculateAge, memberId } = require('../utils/member');

function portalRoutes(db) {
  const router = express.Router();
  const getProfile = db.prepare(`
    SELECT p.*, u.email
    FROM users u JOIN member_profiles p ON p.user_id = u.id
    WHERE u.id = ? AND u.role = 'member'
  `);
  const emailExists = db.prepare('SELECT id FROM users WHERE email = ?');
  const updateEmail = db.prepare('UPDATE users SET email = ? WHERE id = ?');
  const updateProfile = db.prepare(`
    UPDATE member_profiles SET first_name = ?, last_name = ?, birthdate = ?, gender = ?,
      country = ?, city = ?, favorite_member = ?, profile_picture_url = ?, short_bio = ?
    WHERE user_id = ?
  `);
  const getPassword = db.prepare('SELECT password_hash FROM users WHERE id = ?');
  const updatePassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');

  function ownProfile(req) {
    return getProfile.get(req.user.id);
  }

  function renderEdit(res, values, errors = []) {
    res.render('portal/edit', { title: 'Edit my profile', values, errors, favorites: FAVORITES });
  }

  router.get('/', (req, res) => {
    const profile = ownProfile(req);
    res.render('portal/overview', {
      title: 'Member home', profile,
      memberId: profile ? memberId(profile.id) : null,
    });
  });

  router.get('/profile', (req, res) => {
    const profile = ownProfile(req);
    if (!profile) return res.status(404).render('error', { title: 'Profile not found', message: 'Ask an admin to complete your member profile.', homeHref: '/member' });
    res.render('portal/profile', {
      title: 'My profile', profile, memberId: memberId(profile.id), age: calculateAge(profile.birthdate),
      notice: req.query.notice === 'updated' ? 'Your profile has been updated.' : null,
    });
  });

  router.get('/profile/edit', (req, res) => {
    const profile = ownProfile(req);
    if (!profile) return res.status(404).render('error', { title: 'Profile not found', message: 'Ask an admin to complete your member profile.', homeHref: '/member' });
    renderEdit(res, profile);
  });

  router.post('/profile/edit', (req, res) => {
    const profile = ownProfile(req);
    if (!profile) return res.status(404).render('error', { title: 'Profile not found', message: 'Ask an admin to complete your member profile.', homeHref: '/member' });
    const { values, errors } = validateMember(req.body || {});
    const owner = emailExists.get(values.email);
    if (owner && owner.id !== req.user.id) errors.push('That email address is already in use.');
    if (errors.length) return renderEdit(res.status(400), values, errors);

    db.exec('BEGIN');
    try {
      updateEmail.run(values.email, req.user.id);
      updateProfile.run(values.first_name, values.last_name, values.birthdate,
        values.gender || null, values.country, values.city, values.favorite_member,
        values.profile_picture_url || null, values.short_bio || null, req.user.id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    res.redirect(303, '/member/profile?notice=updated');
  });

  router.get('/password', (req, res) => {
    res.render('portal/password', { title: 'Change password', errors: [], changed: req.query.changed === '1' });
  });

  router.post('/password', async (req, res, next) => {
    try {
      const body = req.body || {};
      const current = typeof body.current_password === 'string' ? body.current_password : '';
      const nextPassword = typeof body.new_password === 'string' ? body.new_password : '';
      const confirmation = typeof body.confirm_password === 'string' ? body.confirm_password : '';
      const errors = [];

      if (current.length > 1024 || !(await verifyPassword(current, getPassword.get(req.user.id).password_hash))) {
        errors.push('Current password is incorrect.');
      }
      if (nextPassword.length < 12 || nextPassword.length > 128) {
        errors.push('New password must be between 12 and 128 characters.');
      }
      if (nextPassword !== confirmation) errors.push('New passwords do not match.');
      if (errors.length) {
        return res.status(400).render('portal/password', { title: 'Change password', errors, changed: false });
      }

      updatePassword.run(hashPassword(nextPassword), req.user.id);
      req.session.regenerate((error) => {
        if (error) return next(error);
        req.session.userId = req.user.id;
        req.session.save((saveError) => {
          if (saveError) return next(saveError);
          res.redirect(303, '/member/password?changed=1');
        });
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = portalRoutes;

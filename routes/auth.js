const express = require('express');
const { verifyPassword } = require('../utils/password');

function authRoutes(db) {
  const router = express.Router();
  const findByEmail = db.prepare('SELECT id, password_hash, role, is_active FROM users WHERE email = ?');

  router.post('/login', async (req, res, next) => {
    try {
      const body = req.body || {};
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || password.length > 1024) {
        return res.redirect('/?error=1');
      }

      const user = findByEmail.get(email);
      if (!user || !user.is_active || !(await verifyPassword(password, user.password_hash))) {
        return res.redirect('/?error=1');
      }

      // Regenerating the session gives the user a fresh ID after login.
      req.session.regenerate((error) => {
        if (error) return next(error);
        req.session.userId = user.id;
        req.session.save((saveError) => {
          if (saveError) return next(saveError);
          res.redirect(user.role === 'admin' ? '/admin' : '/member');
        });
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', (req, res, next) => {
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie('fan.sid');
      res.redirect('/');
    });
  });

  return router;
}

module.exports = authRoutes;

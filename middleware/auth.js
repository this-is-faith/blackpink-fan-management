function loadCurrentUser(db) {
  const findUser = db.prepare('SELECT id, email, role, is_active FROM users WHERE id = ?');

  return (req, res, next) => {
    if (!req.session.userId) return next();

    const user = findUser.get(req.session.userId);
    if (!user || !user.is_active) {
      return req.session.destroy(() => next());
    }

    req.user = user;
    next();
  };
}

function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/');
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).render('error', {
        title: 'Access denied', message: 'Your account cannot open this page.',
        homeHref: req.user.role === 'admin' ? '/admin' : '/member',
      });
    }
    next();
  };
}

module.exports = { loadCurrentUser, requireAuth, requireRole };

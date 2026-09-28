const path = require('node:path');
const express = require('express');
const session = require('express-session');
require('dotenv').config();

const { openDatabase } = require('./database/db');
const { loadCurrentUser, requireAuth, requireRole } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const memberRoutes = require('./routes/members');
const portalRoutes = require('./routes/portal');

function createApp(db, sessionSecret) {
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error('Set SESSION_SECRET to at least 32 characters in .env.');
  }

  const app = express();
  // Keep the SQLite connection alive for as long as this Express app runs.
  app.locals.db = db;
  app.set('view engine', 'ejs');
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));
  app.use(session({
    name: 'fan.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
  }));
  app.use(loadCurrentUser(db));
  app.use(authRoutes(db));
  app.use(adminRoutes(db));
  app.use('/admin/members', requireAuth, requireRole('admin'), memberRoutes(db));
  app.use('/member', requireAuth, requireRole('member'), portalRoutes(db));

  app.get('/', (req, res) => {
    if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/member');
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
  });

  app.use((req, res) => {
    res.status(404).render('error', {
      title: 'Page not found', message: 'The page you requested does not exist.',
      homeHref: req.user?.role === 'admin' ? '/admin' : req.user?.role === 'member' ? '/member' : '/',
    });
  });

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).render('error', {
      title: 'Something went wrong', message: 'Please try again. If the problem continues, restart the server.',
      homeHref: req.user?.role === 'admin' ? '/admin' : req.user?.role === 'member' ? '/member' : '/',
    });
  });

  return app;
}

if (require.main === module) {
  try {
    const db = openDatabase();
    const app = createApp(db, process.env.SESSION_SECRET);
    const port = Number(process.env.PORT) || 3000;
    app.listen(port, () => {
      console.log(`BLACKPINK Fan Management System is running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error(`Could not start the app: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { createApp };

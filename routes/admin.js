const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { requireAuth, requireRole } = require('../middleware/auth');

const template = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin.html'), 'utf8');

function adminRoutes(db) {
  const router = express.Router();
  const getStats = db.prepare(`
    SELECT
      COUNT(*) AS total_members,
      COALESCE(SUM(CASE WHEN u.is_active = 1 AND p.membership_status = 'active' THEN 1 ELSE 0 END), 0) AS active_members,
      COALESCE(SUM(CASE WHEN date(p.date_joined) > date('now', '-30 days') AND date(p.date_joined) <= date('now') THEN 1 ELSE 0 END), 0) AS new_members
    FROM member_profiles AS p
    JOIN users AS u ON u.id = p.user_id
    WHERE u.role = 'member'
  `);

  router.get('/admin', requireAuth, requireRole('admin'), (req, res) => {
    const stats = getStats.get();
    const message = stats.total_members === 0
      ? 'No member profiles yet. Add your first member to get started.'
      : 'View profiles, search members, and update membership details.';

    const html = template
      .replace('{{TOTAL_MEMBERS}}', String(stats.total_members))
      .replace('{{ACTIVE_MEMBERS}}', String(stats.active_members))
      .replace('{{NEW_MEMBERS}}', String(stats.new_members))
      .replace('{{MEMBER_MESSAGE}}', message);

    res.type('html').send(html);
  });

  return router;
}

module.exports = adminRoutes;

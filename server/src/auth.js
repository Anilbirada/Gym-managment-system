const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sign in to continue.' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'local-only-change-me');
    return next();
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Sign in again.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission to do that.' });
    return next();
  };
}

module.exports = { requireAuth, requireRole };
function requirePin(req, res, next) {
  const pin = process.env.ADMIN_PIN;
  if (!pin) return next(); // No PIN configured — open access
  if (req.session && req.session.authenticated) return next();
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

module.exports = { requirePin };

'use strict';

const jwt = require('jsonwebtoken');

/**
 * Express middleware that verifies a JWT Bearer token.
 * Attaches the decoded payload to req.user on success.
 * Returns 401 if the token is missing or invalid.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: No token provided.' });
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized: Invalid or expired token.' });
  }
}

module.exports = { authenticate };

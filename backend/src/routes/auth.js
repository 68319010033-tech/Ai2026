'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../config/firebase');

const router = express.Router();
const SALT_ROUNDS = 10;

/**
 * Helper: find a user in RTDB by username.
 * Returns { id, ...userData } or null if not found.
 */
async function findUserByUsername(username) {
  const snapshot = await db
    .ref('users')
    .orderByChild('username')
    .equalTo(username)
    .once('value');

  if (!snapshot.exists()) return null;

  const usersObj = snapshot.val();
  const id = Object.keys(usersObj)[0];
  return { id, ...usersObj[id] };
}

/**
 * POST /api/login
 * Body: { username, password }
 * Response: { token, user: { id, name, username } } or 401 { message }
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'username and password are required.' });
    }

    const user = await findUserByUsername(username);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

/**
 * POST /api/register
 * Body: { name, username, password }
 * Response: 201 { message, userId } or 400/409 { message }
 */
router.post('/register', async (req, res) => {
  try {
    const { name, username, password } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({ message: 'name, username, and password are required.' });
    }

    if (username.trim().length < 3) {
      return res.status(400).json({ message: 'Username must be at least 3 characters.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    // Check for existing username
    const existingUser = await findUserByUsername(username.trim());
    if (existingUser) {
      return res.status(409).json({ message: 'Username already taken.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const newUserRef = db.ref('users').push();
    await newUserRef.set({
      name: name.trim(),
      username: username.trim(),
      passwordHash,
      createdAt: new Date().toISOString(),
    });

    return res.status(201).json({
      message: 'Registered successfully.',
      userId: newUserRef.key,
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;

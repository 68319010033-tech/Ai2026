'use strict';

const path = require('path');
const fs = require('fs');
const { LocalDatabase } = require('./localDb');

let admin = null;
let db = null;

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const databaseURL = process.env.FIREBASE_DATABASE_URL;

let useFirebase = false;

if (serviceAccountPath && databaseURL) {
  const resolvedPath = path.resolve(serviceAccountPath);
  if (fs.existsSync(resolvedPath)) {
    try {
      admin = require('firebase-admin');
      if (!admin.apps.length) {
        const serviceAccount = require(resolvedPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL,
        });
      }
      db = admin.database();
      useFirebase = true;
      console.log('[db] Connected to Firebase Realtime Database');
    } catch (err) {
      console.warn('[db] Failed to initialize Firebase:', err.message);
    }
  }
}

if (!useFirebase) {
  const localDbPath = path.resolve(__dirname, '../../data/db.json');
  console.log(`[db] Using local JSON database at ${localDbPath}`);
  console.log('[db] (To connect to Firebase RTDB, configure FIREBASE_SERVICE_ACCOUNT_PATH and FIREBASE_DATABASE_URL in .env)');
  db = new LocalDatabase(localDbPath);
}

module.exports = { admin, db };

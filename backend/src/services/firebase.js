import fs from 'node:fs';
import { initializeApp, cert, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Returns a Firestore instance, or null when no Firebase configuration is present.
 * Supported (first match wins):
 *   FIREBASE_SERVICE_ACCOUNT_BASE64   base64 of the service-account JSON   (easiest for Cloud env vars)
 *   FIREBASE_SERVICE_ACCOUNT          the JSON itself, or a path to the JSON file
 *   GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_USE_ADC=true   Application Default Credentials (Cloud Run, GCE...)
 *   FIRESTORE_EMULATOR_HOST           local emulator (no credentials needed)
 */
export function initFirestore(env = process.env) {
  let raw = env.FIREBASE_SERVICE_ACCOUNT_BASE64 ? Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8') : env.FIREBASE_SERVICE_ACCOUNT;
  const adc = Boolean(env.GOOGLE_APPLICATION_CREDENTIALS) || env.FIREBASE_USE_ADC === 'true';
  if (!raw && !adc && !env.FIRESTORE_EMULATOR_HOST) return null;

  let options;
  if (raw) {
    if (!raw.trim().startsWith('{')) raw = fs.readFileSync(raw.trim(), 'utf8');
    const sa = JSON.parse(raw);
    options = { credential: cert(sa), projectId: env.FIREBASE_PROJECT_ID || sa.project_id };
  } else if (adc) options = { credential: applicationDefault(), projectId: env.FIREBASE_PROJECT_ID };
  else options = { projectId: env.FIREBASE_PROJECT_ID || 'demo-smart-campus' };

  const app = getApps()[0] || initializeApp(options);
  const db = env.FIRESTORE_DATABASE_ID ? getFirestore(app, env.FIRESTORE_DATABASE_ID) : getFirestore(app);
  try { db.settings({ ignoreUndefinedProperties: true }); } catch { /* settings already applied */ }
  return db;
}

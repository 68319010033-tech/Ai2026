import { createApp } from './app.js';
import { CONFIG } from './config.js';
import { initFirestore } from './services/firebase.js';
import { createFirestorePersistence } from './services/firestorePersistence.js';
import { setPersistence } from './services/persistence.js';

try {
  const db = initFirestore();
  if (db) { setPersistence(createFirestorePersistence(db, CONFIG.firestorePrefix)); console.log(`Storage: Firestore (collections ${CONFIG.firestorePrefix}datasets, ${CONFIG.firestorePrefix}jobs)`); }
  else console.log('Storage: memory only (no Firebase credentials found) - data is lost on restart');
} catch (e) {
  console.error('Firebase initialisation failed, falling back to memory:', e.message);
}
createApp().listen(CONFIG.port, '0.0.0.0', () => console.log(`Smart Campus API listening on :${CONFIG.port}`));

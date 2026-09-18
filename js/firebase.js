// js/firebase.js
// ─────────────────────────────────────────────────────────────────────────────
// Initializes Firebase and exports singleton service instances.
// All other modules import { auth, db, storage } from here.
// This prevents duplicate initialization and circular dependencies.
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp }              from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth }                    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore }               from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getStorage }                 from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';
import { firebaseConfig }             from './config.js';

const app = initializeApp(firebaseConfig);

export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);

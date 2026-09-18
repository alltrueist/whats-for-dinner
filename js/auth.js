// js/auth.js
// ─────────────────────────────────────────────────────────────────────────────
// Authentication module — handles both adult (Firebase Auth email/password)
// and child (client-side PIN verification + Anonymous Auth) login flows.
// ─────────────────────────────────────────────────────────────────────────────

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

import { auth }                    from './firebase.js';
import { getAllUsers, getUser }     from './db.js';
import { verifyPin }               from './utils.js';
import { STORAGE_KEYS }            from './config.js';


// ─── Auth State ──────────────────────────────────────────────────────────────

/**
 * Subscribe to Firebase auth state changes.
 * @param {function} callback - Called with (firebaseUser|null)
 * @returns {function} Unsubscribe
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Get the current Firebase auth user (synchronous, may be null).
 */
export function getCurrentFirebaseUser() {
  return auth.currentUser;
}


// ─── Adult Auth ──────────────────────────────────────────────────────────────

/**
 * Sign in an adult user with email and password.
 * @returns {Promise<object>} Firebase UserCredential
 */
export async function signInAdult(email, password) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

/**
 * Create a new adult Firebase Auth account.
 * Called during onboarding.
 * @returns {Promise<string>} Firebase UID (use as userId in Firestore)
 */
export async function createAdultAccount(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return cred.user.uid;
}

/**
 * Send a password reset email to an adult user.
 */
export async function sendPasswordReset(email) {
  return sendPasswordResetEmail(auth, email.trim());
}


// ─── Child Auth ──────────────────────────────────────────────────────────────

/**
 * Attempt to sign in a child with their PIN.
 *
 * Flow:
 *   1. Get the child's user document from Firestore.
 *   2. Verify the entered PIN against the stored hash.
 *   3. If valid: sign in anonymously with Firebase, store child session.
 *   4. Return the child's user document.
 *
 * @param {string} userId     - The child's Firestore document ID
 * @param {string} enteredPin - Raw 4-digit PIN string
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
export async function signInChild(userId, enteredPin) {
  try {
    const userData = await getUser(userId);
    if (!userData) {
      return { success: false, error: 'User not found.' };
    }
    if (!userData.pinHash) {
      return { success: false, error: 'No PIN set for this account. Ask Owen or Mom.' };
    }

    const valid = await verifyPin(enteredPin, userId, userData.pinHash);
    if (!valid) {
      return { success: false, error: 'Wrong PIN. Try again.' };
    }

    // PIN is correct — sign in anonymously for Firestore write access
    await signInAnonymously(auth);

    // Store child session in localStorage
    const session = {
      userId:      userData.id,
      displayName: userData.displayName,
      role:        'child',
      palette:     userData.palette || 'slate'
    };
    localStorage.setItem(STORAGE_KEYS.CHILD_SESSION, JSON.stringify(session));

    return { success: true, user: userData };
  } catch (err) {
    console.error('Child sign-in error:', err);
    return { success: false, error: 'Something went wrong. Try again.' };
  }
}

/**
 * Retrieve the active child session from localStorage.
 * @returns {object|null} Session object or null
 */
export function getChildSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CHILD_SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Clear the child session from localStorage.
 */
export function clearChildSession() {
  localStorage.removeItem(STORAGE_KEYS.CHILD_SESSION);
}


// ─── Sign Out ─────────────────────────────────────────────────────────────────

/**
 * Sign out the current user (adult or child).
 * Clears Firebase Auth session and any child localStorage session.
 */
export async function signOut() {
  clearChildSession();
  try {
    await firebaseSignOut(auth);
  } catch (err) {
    console.error('Sign-out error:', err);
  }
}


// ─── Load All Users for Login Screen ─────────────────────────────────────────

/**
 * Load all active household members for display on the login screen.
 * Returns them sorted in display order: Owen, Hanna, Jack, Otto, Ella.
 * @returns {Promise<object[]>}
 */
export async function loadLoginProfiles() {
  const DISPLAY_ORDER = ['Owen', 'Hanna', 'Jack', 'Otto', 'Ella'];
  try {
    const users = await getAllUsers();
    const active = users.filter(u => u.isActive);
    active.sort((a, b) => {
      const ai = DISPLAY_ORDER.indexOf(a.displayName);
      const bi = DISPLAY_ORDER.indexOf(b.displayName);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    return active;
  } catch (err) {
    console.error('Failed to load profiles:', err);
    return [];
  }
}

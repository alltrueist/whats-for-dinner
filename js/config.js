// js/config.js
// ─────────────────────────────────────────────────────────────────────────────
// Firebase project configuration
// Replace ALL placeholder values below with your actual Firebase project values.
// Find these in: Firebase Console → Your Project → Project Settings → General
// → Your apps → Firebase SDK snippet → Config
// ─────────────────────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey:            "AIzaSyDtY8lpch4zLsV-omyMAnfoX5qrA-2186o",
  authDomain:        "what-s-for-dinner-2c2b8.firebaseapp.com",
  projectId:         "what-s-for-dinner-2c2b8",
  storageBucket:     "what-s-for-dinner-2c2b8.firebasestorage.app",
  messagingSenderId: "1091997904083",
  appId:             "1:1091997904083:web:863755fe37565e0a2e3826"
};

// ─────────────────────────────────────────────────────────────────────────────
// App-wide constants
// ─────────────────────────────────────────────────────────────────────────────

// localStorage keys
export const STORAGE_KEYS = {
  CHILD_SESSION:  'wfd_child_session',   // active child user object
  PALETTE:        'wfd_palette'           // cached palette before Firestore loads
};

// Firestore collection paths
export const COLLECTIONS = {
  USERS:          'users',
  MEALS:          'meals',
  PANTRY:         'pantry',
  CYCLES:         'cycles',
  SHOPPING_LISTS: 'shoppingLists',
  CALENDAR:       'calendar',
  SETTINGS:       'settings'
};

// Settings document IDs
export const SETTINGS_DOCS = {
  HOUSEHOLD: 'household'
};

// Valid palette names (must match class names in palettes.css)
export const PALETTES = ['slate', 'obsidian', 'azure', 'sage', 'terracotta', 'violet'];
export const DEFAULT_PALETTE = 'slate';

// Household member display names (canonical — do not change)
export const MEMBER_NAMES = {
  OWEN:  'Owen',
  HANNA: 'Hanna',
  JACK:  'Jack',
  OTTO:  'Otto',
  ELLA:  'Ella'
};

// App version (bump on major releases)
export const APP_VERSION = '0.1.0';

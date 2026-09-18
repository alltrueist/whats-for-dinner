// js/state.js
// ─────────────────────────────────────────────────────────────────────────────
// Global app state — a single source of truth for the currently logged-in
// user and other session-level data.
// All modules import from here rather than passing state as function arguments.
// ─────────────────────────────────────────────────────────────────────────────

import { PALETTES, DEFAULT_PALETTE } from './config.js';

/**
 * The current session's user object.
 * Populated by app.js on successful auth, cleared on sign-out.
 *
 * Shape (adult):
 * {
 *   id:          string,   // Firestore document ID = Firebase Auth UID
 *   displayName: string,
 *   role:        'adult',
 *   palette:     string,
 *   email:       string,
 *   isActive:    boolean,
 *   activeMealIds:   string[],
 *   archivedMealIds: string[],
 *   notificationPrefs: object
 * }
 *
 * Shape (child):
 * {
 *   id:          string,   // Firestore document ID
 *   displayName: string,
 *   role:        'child',
 *   palette:     string,
 *   isActive:    boolean,
 *   activeMealIds:   string[],
 *   archivedMealIds: string[]
 * }
 */
export let currentUser = null;

/**
 * Set the current user. Call this after successful login.
 * @param {object|null} user
 */
export function setCurrentUser(user) {
  currentUser = user;
}

/**
 * Clear the current user. Call this on sign-out.
 */
export function clearCurrentUser() {
  currentUser = null;
}

/**
 * Whether the current user is an adult.
 */
export function isAdult() {
  return currentUser?.role === 'adult';
}

/**
 * Whether the current user is a child.
 */
export function isChild() {
  return currentUser?.role === 'child';
}


// ─── Palette ─────────────────────────────────────────────────────────────────

/**
 * Apply a palette to the document body.
 * @param {string} paletteName - e.g. 'slate', 'azure'
 */
export function applyPalette(paletteName) {
  const valid = PALETTES.includes(paletteName) ? paletteName : DEFAULT_PALETTE;
  // Remove all existing palette classes
  PALETTES.forEach(p => document.body.classList.remove(`palette-${p}`));
  document.body.classList.add(`palette-${valid}`);
  // Update theme-color meta tag to match primary color
  updateThemeColor(valid);
}

/** Map palette names to their primary color hex (for the browser chrome). */
const PALETTE_THEME_COLORS = {
  slate:      '#495057',
  obsidian:   '#6C757D',
  azure:      '#1864AB',
  sage:       '#2B6940',
  terracotta: '#C1440E',
  violet:     '#6A0DAD'
};

function updateThemeColor(paletteName) {
  const color = PALETTE_THEME_COLORS[paletteName] || PALETTE_THEME_COLORS.slate;
  let meta = document.getElementById('theme-color-meta');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.id   = 'theme-color-meta';
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', color);
}


// ─── Loading ─────────────────────────────────────────────────────────────────

let _loading = false;

export function showLoading() {
  _loading = true;
  const el = document.getElementById('loading-screen');
  if (el) el.classList.remove('hidden');
}

export function hideLoading() {
  _loading = false;
  const el = document.getElementById('loading-screen');
  if (el) el.classList.add('hidden');
}

export function isLoading() {
  return _loading;
}

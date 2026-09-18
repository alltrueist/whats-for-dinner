// js/utils.js
// ─────────────────────────────────────────────────────────────────────────────
// Pure utility functions — no Firebase, no DOM, no side effects.
// Safe to import anywhere.
// ─────────────────────────────────────────────────────────────────────────────


// ─── PIN Hashing ─────────────────────────────────────────────────────────────
// Uses Web Crypto API (built into all modern browsers — no dependencies needed).
// Salt is the userId so each user's hash is unique even for the same PIN.

/**
 * Hash a 4-digit PIN using SHA-256 with the userId as a salt.
 * @param {string} pin    - The raw 4-digit PIN string e.g. "1234"
 * @param {string} userId - The Firestore document ID of the child user
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
export async function hashPin(pin, userId) {
  const raw  = `${pin}:${userId}:wfd`;
  const data = new TextEncoder().encode(raw);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compare an entered PIN against a stored hash.
 * @param {string} enteredPin - Raw PIN string entered by the user
 * @param {string} userId     - Child's Firestore document ID
 * @param {string} storedHash - Hash stored in the user's Firestore document
 * @returns {Promise<boolean>}
 */
export async function verifyPin(enteredPin, userId, storedHash) {
  const computed = await hashPin(enteredPin, userId);
  return computed === storedHash;
}


// ─── Date Utilities ──────────────────────────────────────────────────────────

/**
 * Format a Date (or Firestore Timestamp) as a readable string.
 * @param {Date|object} date
 * @param {object} opts - Intl.DateTimeFormat options
 * @returns {string}
 */
export function formatDate(date, opts = { month: 'short', day: 'numeric' }) {
  const d = date?.toDate ? date.toDate() : new Date(date);
  return new Intl.DateTimeFormat('en-US', opts).format(d);
}

/**
 * Return today's date as an ISO string (YYYY-MM-DD) in local time.
 */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Check if a given date string (YYYY-MM-DD) is a birthday for a user.
 * @param {string} dateISO - e.g. "2026-10-20"
 * @param {string} dobISO  - User's date of birth e.g. "2011-10-20"
 * @returns {boolean}
 */
export function isBirthday(dateISO, dobISO) {
  if (!dateISO || !dobISO) return false;
  return dateISO.slice(5) === dobISO.slice(5); // Compare MM-DD only
}

/**
 * Add months to a date and return ISO string.
 * @param {Date} date
 * @param {number} months
 * @returns {string} ISO date string YYYY-MM-DD
 */
export function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}


// ─── String Utilities ────────────────────────────────────────────────────────

/**
 * Capitalize the first letter of a string.
 */
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Render a cost tier as $ symbols.
 * @param {number} cost - 1, 2, or 3
 * @returns {string} "$", "$$", or "$$$"
 */
export function costSymbol(cost) {
  return '$'.repeat(Math.max(1, Math.min(3, cost || 1)));
}

/**
 * Truncate a string to a max length with ellipsis.
 */
export function truncate(str, maxLen = 30) {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}


// ─── DOM Utilities ───────────────────────────────────────────────────────────

/**
 * Shorthand for document.getElementById.
 */
export function el(id) {
  return document.getElementById(id);
}

/**
 * Shorthand for document.querySelector.
 */
export function qs(selector, parent = document) {
  return parent.querySelector(selector);
}

/**
 * Shorthand for document.querySelectorAll.
 */
export function qsAll(selector, parent = document) {
  return parent.querySelectorAll(selector);
}

/**
 * Show an element (removes 'hidden' class, sets display if needed).
 */
export function show(element) {
  if (!element) return;
  element.classList.remove('hidden');
}

/**
 * Hide an element (adds 'hidden' class).
 */
export function hide(element) {
  if (!element) return;
  element.classList.add('hidden');
}

/**
 * Toggle a class and return the new state.
 */
export function toggleClass(element, className) {
  if (!element) return false;
  element.classList.toggle(className);
  return element.classList.contains(className);
}

/**
 * Add a one-time event listener that removes itself after firing.
 */
export function once(element, event, handler) {
  const wrapper = (e) => {
    handler(e);
    element.removeEventListener(event, wrapper);
  };
  element.addEventListener(event, wrapper);
}

/**
 * Trigger a shake animation on an element (for wrong PIN, errors, etc.).
 */
export function shake(element) {
  if (!element) return;
  element.classList.remove('shake');
  void element.offsetWidth; // force reflow to restart animation
  element.classList.add('shake');
}


// ─── Array / Object Utilities ────────────────────────────────────────────────

/**
 * Pick a random item from an array.
 */
export function randomFrom(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Deep clone a plain object/array (JSON-safe values only).
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Fuzzy match score between two strings (0 = no match, 1 = exact).
 * Used for ingredient name normalization.
 * @returns {number} 0–1
 */
export function fuzzyScore(a, b) {
  if (!a || !b) return 0;
  const s = a.toLowerCase().trim();
  const t = b.toLowerCase().trim();
  if (s === t) return 1;
  if (s.includes(t) || t.includes(s)) return 0.85;

  // Levenshtein-based similarity
  const m = s.length, n = t.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = s[i - 1] === t[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return 1 - dp[m][n] / Math.max(m, n);
}

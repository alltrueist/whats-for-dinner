// js/db.js
// ─────────────────────────────────────────────────────────────────────────────
// Firestore data layer — all database reads and writes go through here.
// No component or screen should import Firestore directly.
// All methods return plain JS objects (never raw Firestore snapshots).
// ─────────────────────────────────────────────────────────────────────────────

import {
  doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, orderBy, limit, onSnapshot,
  serverTimestamp, arrayUnion, arrayRemove, increment
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import { db }          from './firebase.js';
import { COLLECTIONS, SETTINGS_DOCS } from './config.js';
import { fuzzyScore }  from './utils.js';


// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert a Firestore DocumentSnapshot to a plain object with id field. */
function snap(docSnap) {
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() };
}

/** Convert a Firestore QuerySnapshot to an array of plain objects. */
function snapAll(querySnap) {
  return querySnap.docs.map(d => ({ id: d.id, ...d.data() }));
}


// ─── USERS ───────────────────────────────────────────────────────────────────

/**
 * Get a single user document by userId.
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getUser(userId) {
  const ref = doc(db, COLLECTIONS.USERS, userId);
  return snap(await getDoc(ref));
}

/**
 * Get all household members.
 * @returns {Promise<object[]>}
 */
export async function getAllUsers() {
  const ref = collection(db, COLLECTIONS.USERS);
  return snapAll(await getDocs(ref));
}

/**
 * Get all users with role === 'child'.
 * @returns {Promise<object[]>}
 */
export async function getChildUsers() {
  const ref = query(
    collection(db, COLLECTIONS.USERS),
    where('role', '==', 'child'),
    where('isActive', '==', true)
  );
  return snapAll(await getDocs(ref));
}

/**
 * Get all users with role === 'adult'.
 * @returns {Promise<object[]>}
 */
export async function getAdultUsers() {
  const ref = query(
    collection(db, COLLECTIONS.USERS),
    where('role', '==', 'adult'),
    where('isActive', '==', true)
  );
  return snapAll(await getDocs(ref));
}

/**
 * Create a new user document.
 * Used during onboarding for both adult and child accounts.
 * For adults, userId is the Firebase Auth UID.
 * For children, userId is a Firestore auto-generated ID (pass null).
 * @param {string|null} userId
 * @param {object} userData
 * @returns {Promise<string>} The userId (either passed in or auto-generated)
 */
export async function createUser(userId, userData) {
  const data = {
    ...userData,
    activeMealIds:    [],
    archivedMealIds:  [],
    notificationPrefs: defaultNotificationPrefs(userData.role),
    sequentialPointer: 0,
    isActive:         true,
    createdAt:        serverTimestamp()
  };

  if (userId) {
    await setDoc(doc(db, COLLECTIONS.USERS, userId), data);
    return userId;
  } else {
    const ref = await addDoc(collection(db, COLLECTIONS.USERS), data);
    return ref.id;
  }
}

/**
 * Update a user's palette preference.
 */
export async function updateUserPalette(userId, palette) {
  await updateDoc(doc(db, COLLECTIONS.USERS, userId), { palette });
}

/**
 * Update a user's PIN hash (adults only — child PIN reset).
 */
export async function updateChildPin(userId, pinHash) {
  await updateDoc(doc(db, COLLECTIONS.USERS, userId), { pinHash });
}

/**
 * Update a user's notification preferences.
 */
export async function updateNotificationPrefs(userId, prefs) {
  await updateDoc(doc(db, COLLECTIONS.USERS, userId), { notificationPrefs: prefs });
}

/**
 * Update a user's FCM token for push notifications.
 */
export async function updateFcmToken(userId, token) {
  await updateDoc(doc(db, COLLECTIONS.USERS, userId), { fcmToken: token });
}

/**
 * Add a meal to a user's active pool.
 */
export async function addMealToUser(userId, mealId) {
  await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
    activeMealIds: arrayUnion(mealId)
  });
}

/**
 * Move a meal from active to archived in a user's pool.
 */
export async function archiveMealForUser(userId, mealId) {
  await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
    activeMealIds:   arrayRemove(mealId),
    archivedMealIds: arrayUnion(mealId)
  });
}

/**
 * Move a meal from archived to active in a user's pool.
 */
export async function restoreMealForUser(userId, mealId) {
  await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
    activeMealIds:   arrayUnion(mealId),
    archivedMealIds: arrayRemove(mealId)
  });
}

/** Default notification preferences by role. */
function defaultNotificationPrefs(role) {
  if (role === 'adult') {
    return {
      shoppingSync:             true,
      shoppingSyncSilenced:     null,
      shoppingSilenceExpiresAt: null,
      submissionDeadlinePassed: true,
      allSubmissionsIn:         true,
      restockSuggestions:       true
    };
  }
  return {
    submissionReminder: true
  };
}


// ─── MEALS ───────────────────────────────────────────────────────────────────

/**
 * Get a single meal by ID.
 */
export async function getMeal(mealId) {
  return snap(await getDoc(doc(db, COLLECTIONS.MEALS, mealId)));
}

/**
 * Get all meals owned by a specific user.
 */
export async function getMealsByOwner(ownerId) {
  const ref = query(
    collection(db, COLLECTIONS.MEALS),
    where('ownerId', '==', ownerId)
  );
  return snapAll(await getDocs(ref));
}

/**
 * Get all active meals for a specific user (not archived, not on cooldown).
 */
export async function getActiveMeals(ownerId) {
  const ref = query(
    collection(db, COLLECTIONS.MEALS),
    where('ownerId', '==', ownerId),
    where('status', '==', 'active')
  );
  return snapAll(await getDocs(ref));
}

/**
 * Get ALL meals across all users (for library browsing).
 */
export async function getAllMeals() {
  return snapAll(await getDocs(collection(db, COLLECTIONS.MEALS)));
}

/**
 * Create a new meal document.
 * @param {object} mealData - Meal fields (ownerId, title, cost, etc.)
 * @returns {Promise<string>} New meal ID
 */
export async function createMeal(mealData) {
  const data = {
    ...mealData,
    status:              'active',
    totalSelections:     0,
    reactionCount:       0,
    reactedBy:           [],
    ingredientsImported: false,
    hasLeftovers:        false,
    cooldownUntil:       null,
    lastSelectedDate:    null,
    createdAt:           serverTimestamp(),
    updatedAt:           serverTimestamp()
  };
  const ref = await addDoc(collection(db, COLLECTIONS.MEALS), data);
  return ref.id;
}

/**
 * Update a meal's fields.
 */
export async function updateMeal(mealId, updates) {
  await updateDoc(doc(db, COLLECTIONS.MEALS, mealId), {
    ...updates,
    updatedAt: serverTimestamp()
  });
}

/**
 * Add a "love" reaction to a meal.
 */
export async function reactToMeal(mealId, userId) {
  await updateDoc(doc(db, COLLECTIONS.MEALS, mealId), {
    reactionCount: increment(1),
    reactedBy:     arrayUnion(userId),
    updatedAt:     serverTimestamp()
  });
}

/**
 * Check cooldown status for all meals and update any that have expired.
 * Call this on app load.
 */
export async function refreshCooldowns() {
  const today = new Date().toISOString().slice(0, 10);
  const ref = query(
    collection(db, COLLECTIONS.MEALS),
    where('status', '==', 'cooldown')
  );
  const meals = snapAll(await getDocs(ref));
  const updates = meals
    .filter(m => m.cooldownUntil && m.cooldownUntil <= today)
    .map(m => updateDoc(doc(db, COLLECTIONS.MEALS, m.id), {
      status:    'active',
      updatedAt: serverTimestamp()
    }));
  await Promise.all(updates);
}


// ─── PANTRY ──────────────────────────────────────────────────────────────────

/**
 * Get all pantry items.
 */
export async function getPantry() {
  return snapAll(await getDocs(collection(db, COLLECTIONS.PANTRY)));
}

/**
 * Get a pantry item by ingredient name (exact match).
 */
export async function getPantryItem(name) {
  const ref = query(
    collection(db, COLLECTIONS.PANTRY),
    where('name', '==', name),
    limit(1)
  );
  const results = snapAll(await getDocs(ref));
  return results[0] || null;
}

/**
 * Find pantry items that fuzzy-match a given ingredient name.
 * Returns all pantry items with score > threshold, sorted by score desc.
 */
export async function fuzzyMatchPantry(ingredientName, threshold = 0.75) {
  const all = await getPantry();
  return all
    .map(item => ({ ...item, score: fuzzyScore(item.name, ingredientName) }))
    .filter(item => item.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

/**
 * Create or update a pantry item.
 */
export async function upsertPantryItem(name, data) {
  const existing = await getPantryItem(name);
  if (existing) {
    await updateDoc(doc(db, COLLECTIONS.PANTRY, existing.id), {
      ...data,
      updatedAt: serverTimestamp()
    });
    return existing.id;
  } else {
    const newData = {
      name,
      status:                   data.status || 'out',
      isStaple:                 data.isStaple || false,
      stapleQuantity:           data.stapleQuantity || null,
      restockHistory:           [],
      avgRestockIntervalDays:   null,
      lastRestockedDate:        null,
      suggestionThresholdWeeks: 2,
      preferredStore:           null,
      krogerAisle:              null,
      aldiAisle:                null,
      ...data,
      updatedAt:                serverTimestamp()
    };
    const ref = await addDoc(collection(db, COLLECTIONS.PANTRY), newData);
    return ref.id;
  }
}

/**
 * Update pantry status for a list of ingredient names (called after shopping).
 * @param {string[]} purchasedNames - Names of purchased ingredients
 */
export async function markPurchased(purchasedNames) {
  const today = new Date().toISOString().slice(0, 10);
  const updates = purchasedNames.map(name =>
    upsertPantryItem(name, {
      status:           'stocked',
      lastRestockedDate: today,
      restockHistory:   arrayUnion(today)
    })
  );
  await Promise.all(updates);
}


// ─── SETTINGS ────────────────────────────────────────────────────────────────

/**
 * Get the household settings document.
 */
export async function getHouseholdSettings() {
  return snap(await getDoc(
    doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOCS.HOUSEHOLD)
  ));
}

/**
 * Create or update household settings.
 */
export async function setHouseholdSettings(data) {
  await setDoc(
    doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOCS.HOUSEHOLD),
    data,
    { merge: true }
  );
}

/**
 * Check if the app has been set up (household settings exist + at least 1 adult user).
 * @returns {Promise<boolean>}
 */
export async function isAppSetup() {
  try {
    const settings = await getHouseholdSettings();
    if (!settings) return false;
    const adults = await getAdultUsers();
    return adults.length > 0;
  } catch {
    return false;
  }
}


// ─── REAL-TIME LISTENERS ─────────────────────────────────────────────────────

/**
 * Subscribe to real-time updates on the active shopping list.
 * @param {string} listId
 * @param {function} callback - Called with the updated list object
 * @returns {function} Unsubscribe function
 */
export function subscribeShoppingList(listId, callback) {
  return onSnapshot(
    doc(db, COLLECTIONS.SHOPPING_LISTS, listId),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  );
}

/**
 * Subscribe to real-time updates on the current cycle.
 * @param {string} cycleId
 * @param {function} callback
 * @returns {function} Unsubscribe function
 */
export function subscribeCycle(cycleId, callback) {
  return onSnapshot(
    doc(db, COLLECTIONS.CYCLES, cycleId),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  );
}

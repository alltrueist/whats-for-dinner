// js/cycles.js — Cycle query helpers that require NO composite Firestore indexes.
// All filtering and sorting is done in JavaScript after a simple collection fetch.
import { getDocs, collection } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db }          from './firebase.js';
import { COLLECTIONS } from './config.js';

function sortDesc(cycles) {
  return cycles.slice().sort((a,b) => {
    const ms = c => c.startDate?.toDate ? c.startDate.toDate().getTime() : new Date(c.startDate||0).getTime();
    return ms(b) - ms(a);
  });
}

/** Load every cycle, sorted most-recent-first. */
export async function loadAllCycles() {
  const snap = await getDocs(collection(db, COLLECTIONS.CYCLES));
  return sortDesc(snap.docs.map(d => ({id:d.id,...d.data()})));
}

/** Active cycle first; falls back to most-recent planning cycle. */
export async function getCurrentCycle() {
  const all = await loadAllCycles();
  return all.find(c=>c.status==='active') || all.find(c=>c.status==='planning') || null;
}

/** Most-recent planning cycle only. */
export async function getPlanningCycle() {
  const all = await loadAllCycles();
  return all.find(c=>c.status==='planning') || null;
}

/** All completed cycles, most-recent-first. */
export async function getCompletedCycles() {
  const all = await loadAllCycles();
  return all.filter(c=>c.status==='complete');
}

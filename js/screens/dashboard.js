// js/screens/dashboard.js
// ─────────────────────────────────────────────────────────────────────────────
// Dashboard — Home screen for both adults and kids.
// Adults see: cycle bar, tonight's meal card, full cycle list, quick actions.
// Kids see:   greeting, tonight's meal, simplified cycle list, submission banner.
// ─────────────────────────────────────────────────────────────────────────────

import { currentUser, isAdult, isChild } from '../state.js';
import { getHouseholdSettings, getAllUsers } from '../db.js';
import { navigate }  from '../router.js';
import { signOut }   from '../auth.js';
import { clearCurrentUser } from '../state.js';
import {
  getDocs, collection, query, where, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db }            from '../firebase.js';
import { COLLECTIONS }   from '../config.js';
import { formatDate, costSymbol } from '../utils.js';


// ─── Avatar helpers ───────────────────────────────────────────────────────────

const AVATAR_COLORS = {
  Owen:  { bg: '#495057', fg: '#FFFFFF' },
  Hanna: { bg: '#2B6940', fg: '#FFFFFF' },
  Jack:  { bg: '#1864AB', fg: '#FFFFFF' },
  Otto:  { bg: '#C1440E', fg: '#FFFFFF' },
  Ella:  { bg: '#6A0DAD', fg: '#FFFFFF' }
};

function avatarStyle(name) {
  const c = AVATAR_COLORS[name] || { bg: '#868E96', fg: '#FFFFFF' };
  return `background:${c.bg}; color:${c.fg};`;
}

function initials(name) {
  return name ? name.slice(0, 2).toUpperCase() : '??';
}


// ─── Main render ─────────────────────────────────────────────────────────────

export async function renderDashboard(params, container) {
  // Render shell immediately so screen isn't blank while data loads
  container.innerHTML = buildShell();
  bindTabBar();
  bindHeader();

  // Load data in the background
  loadDashboardData();
}

function buildShell() {
  const user = currentUser;
  return `
    <div class="screen" id="dashboard-screen">
      <!-- Header -->
      <div class="app-header">
        <div class="app-wordmark">What's for Dinner?</div>
        <div style="display:flex; align-items:center; gap:10px;">
          ${isAdult() ? '<button class="icon-btn" id="notif-btn" aria-label="Notifications">🔔</button>' : ''}
          <button class="avatar" id="avatar-btn"
            style="${avatarStyle(user?.displayName)}"
            aria-label="Account">
            ${initials(user?.displayName)}
          </button>
        </div>
      </div>

      <!-- Cycle strip (adults only) -->
      ${isAdult() ? `
        <div class="cycle-strip" id="cycle-strip">
          <div class="cycle-strip-inner">
            <span class="cycle-strip-label" id="cycle-label">Loading…</span>
            <div class="cycle-dots" id="cycle-dots"></div>
          </div>
          <div class="night4-bar" id="night4-bar" style="display:none;">
            <span id="night4-text" class="night4-text"></span>
            <button class="override-link" id="override-btn">Override ›</button>
          </div>
        </div>
      ` : `
        <!-- Kid greeting strip -->
        <div class="cycle-strip" style="justify-content:flex-start; gap:8px;">
          <span style="font-size:20px;">👋</span>
          <span class="cycle-strip-label">Hi, ${user?.displayName}!</span>
        </div>
      `}

      <!-- Scrollable content -->
      <div class="screen-scroll">
        <div class="screen-content">

          <!-- Tonight's meal card -->
          <div>
            <div class="section-label">Tonight's Dinner</div>
            <div id="tonight-card" class="card">
              <div class="tonight-loading">
                <div class="spinner spinner-sm"></div>
              </div>
            </div>
          </div>

          <!-- Cycle list -->
          <div>
            <div class="section-label">${isAdult() ? 'This Cycle' : 'This Week\'s Dinners'}</div>
            <div id="cycle-list" class="card">
              <div class="tonight-loading">
                <div class="spinner spinner-sm"></div>
              </div>
            </div>
          </div>

          <!-- Quick Actions (adults only) -->
          ${isAdult() ? `
            <div>
              <div class="section-label">Quick Actions</div>
              <div class="quick-row">
                <button class="quick-btn quick-btn-primary" id="open-shopping">
                  <div class="quick-btn-label">🛒 Shopping List</div>
                  <div class="quick-btn-sub">View current list</div>
                </button>
                <button class="quick-btn quick-btn-disabled" id="gen-shopping">
                  <div class="quick-btn-label">⚡ Generate List</div>
                  <div class="quick-btn-sub" id="gen-sub">Select all meals first</div>
                </button>
              </div>
            </div>
          ` : ''}

          <!-- Submission banner for kids (shown conditionally) -->
          <div id="submission-banner" style="display:none;">
            <div class="submission-banner">
              <div style="font-size:28px; flex-shrink:0;">🗓️</div>
              <div>
                <div class="sub-banner-title">Time to pick your meals!</div>
                <div class="sub-banner-sub">Submit your top 3 picks for next cycle.</div>
                <button class="sub-banner-btn" id="sub-now-btn">Submit Now →</button>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Tab Bar -->
      ${buildTabBar()}
    </div>
  `;
}

function buildTabBar() {
  if (isAdult()) {
    return `
      <nav class="tab-bar">
        <button class="tab-item active" data-route="/dashboard">
          <span class="tab-icon">🏠</span>
          <span class="tab-label">Home</span>
          <div class="tab-dot"></div>
        </button>
        <button class="tab-item" data-route="/planner">
          <span class="tab-icon">📅</span>
          <span class="tab-label">Planner</span>
        </button>
        <button class="tab-item" data-route="/meals">
          <span class="tab-icon">🍽️</span>
          <span class="tab-label">Meals</span>
        </button>
        <button class="tab-item" data-route="/shopping">
          <span class="tab-icon">🛒</span>
          <span class="tab-label">Shopping</span>
        </button>
        <button class="tab-item" data-route="/calendar">
          <span class="tab-icon">📆</span>
          <span class="tab-label">Calendar</span>
        </button>
      </nav>
    `;
  }
  return `
    <nav class="tab-bar">
      <button class="tab-item active" data-route="/dashboard">
        <span class="tab-icon">🏠</span>
        <span class="tab-label">Home</span>
        <div class="tab-dot"></div>
      </button>
      <button class="tab-item" data-route="/meals">
        <span class="tab-icon">🍽️</span>
        <span class="tab-label">My Meals</span>
      </button>
      <button class="tab-item" data-route="/calendar">
        <span class="tab-icon">📆</span>
        <span class="tab-label">Calendar</span>
      </button>
      <button class="tab-item" data-route="/analytics">
        <span class="tab-icon">📊</span>
        <span class="tab-label">Stats</span>
      </button>
    </nav>
  `;
}


// ─── Header bindings ──────────────────────────────────────────────────────────

function bindHeader() {
  const avatarBtn = document.getElementById('avatar-btn');
  if (avatarBtn) {
    avatarBtn.addEventListener('click', () => showAccountMenu());
  }
  const openShopping = document.getElementById('open-shopping');
  if (openShopping) {
    openShopping.addEventListener('click', () => navigate('/shopping'));
  }
  const subNowBtn = document.getElementById('sub-now-btn');
  if (subNowBtn) {
    subNowBtn.addEventListener('click', () => navigate('/submission'));
  }
}

function showAccountMenu() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <div style="padding: 16px 20px 8px;">
        <div style="font-size:16px; font-weight:800; color:var(--text); margin-bottom:4px;">
          ${currentUser?.displayName}
        </div>
        <div style="font-size:13px; color:var(--text-3);">
          ${currentUser?.role === 'adult' ? currentUser?.email || 'Adult account' : 'Kid account'}
        </div>
      </div>
      <div style="border-top: 1px solid var(--border); margin: 8px 0;"></div>
      ${isAdult() ? `
        <button class="menu-item" id="go-settings">⚙️ Settings</button>
      ` : ''}
      <button class="menu-item" id="go-analytics">📊 Stats & Analytics</button>
      <button class="menu-item menu-item-danger" id="sign-out-btn">Sign Out</button>
      <div style="height: max(16px, env(safe-area-inset-bottom));"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });

  const settingsBtn = overlay.querySelector('#go-settings');
  if (settingsBtn) settingsBtn.addEventListener('click', () => {
    overlay.remove();
    navigate('/settings');
  });

  const analyticsBtn = overlay.querySelector('#go-analytics');
  if (analyticsBtn) analyticsBtn.addEventListener('click', () => {
    overlay.remove();
    navigate('/analytics');
  });

  overlay.querySelector('#sign-out-btn').addEventListener('click', async () => {
    overlay.remove();
    clearCurrentUser();
    await signOut();
    navigate('/login');
  });
}


// ─── Tab bar bindings ─────────────────────────────────────────────────────────

function bindTabBar() {
  document.querySelectorAll('.tab-item[data-route]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigate(btn.dataset.route);
    });
  });
}


// ─── Data loading ─────────────────────────────────────────────────────────────

async function loadDashboardData() {
  try {
    // Load all data in parallel
    const [currentCycle, allUsers, settings] = await Promise.all([
      getCurrentCycle(),
      getAllUsers(),
      getHouseholdSettings()
    ]);

    renderCycleStrip(currentCycle, settings, allUsers);
    renderTonightCard(currentCycle, allUsers);
    renderCycleList(currentCycle, allUsers);
    checkSubmissionBanner(currentCycle, settings);

  } catch (err) {
    console.error('[Dashboard] Data load error:', err);
    renderErrorState();
  }
}

async function getCurrentCycle() {
  try {
    // Try active cycle first, then planning
    for (const status of ['active', 'planning']) {
      const q = query(
        collection(db, COLLECTIONS.CYCLES),
        where('status', '==', status),
        orderBy('startDate', 'desc'),
        limit(1)
      );
      const docs = (await getDocs(q)).docs;
      if (docs.length > 0) {
        return { id: docs[0].id, ...docs[0].data() };
      }
    }
    return null;
  } catch {
    return null;
  }
}


// ─── Cycle strip (adults) ─────────────────────────────────────────────────────

function renderCycleStrip(cycle, settings, allUsers) {
  if (!isAdult()) return;

  const labelEl = document.getElementById('cycle-label');
  const dotsEl  = document.getElementById('cycle-dots');
  const bar     = document.getElementById('night4-bar');
  const n4text  = document.getElementById('night4-text');

  if (!cycle) {
    if (labelEl) labelEl.textContent = 'No active cycle — go to Planner to start one';
    return;
  }

  const nights       = cycle.nights || [];
  const plannedCount = cycle.plannedMealCount || nights.length || 4;
  const today        = new Date().toISOString().slice(0, 10);

  // Which night are we on?
  let currentNightIndex = 0;
  if (nights.length > 0) {
    const idx = nights.findIndex(n => {
      const d = n.date?.toDate ? n.date.toDate().toISOString().slice(0, 10)
                               : String(n.date).slice(0, 10);
      return d >= today;
    });
    currentNightIndex = idx >= 0 ? idx : nights.length - 1;
  }

  if (labelEl) {
    labelEl.textContent = `Cycle ${cycle.cycleNumber || '?'} · Night ${currentNightIndex + 1} of ${plannedCount}`;
  }

  // Dots
  if (dotsEl) {
    dotsEl.innerHTML = Array.from({ length: plannedCount }, (_, i) => {
      let cls = 'dot';
      if (i < currentNightIndex) cls += ' dot-filled';
      if (i === currentNightIndex) cls += ' dot-active';
      return `<div class="${cls}"></div>`;
    }).join('');
  }

  // Night 4 bar — whose turn it is on the adult night
  if (bar && n4text && settings && nights.length > 0) {
    const adultNight = nights.find(n => {
      const owner = allUsers.find(u => u.id === n.pickOwnerId);
      return owner?.role === 'adult';
    });
    if (adultNight) {
      const owner = allUsers.find(u => u.id === adultNight.pickOwnerId);
      n4text.innerHTML = `Night ${adultNight.nightNumber}: <strong>${owner?.displayName || 'Adult'}'s pick</strong>`;
      bar.style.display = 'flex';

      document.getElementById('override-btn')?.addEventListener('click', () => {
        navigate('/planner');
      });
    }
  }
}


// ─── Tonight's meal card ──────────────────────────────────────────────────────

function renderTonightCard(cycle, allUsers) {
  const card = document.getElementById('tonight-card');
  if (!card) return;

  if (!cycle || !cycle.nights || cycle.nights.length === 0) {
    card.innerHTML = noPlanCard();
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const tonightNight = cycle.nights.find(n => {
    const d = n.date?.toDate ? n.date.toDate().toISOString().slice(0, 10)
                             : String(n.date).slice(0, 10);
    return d === today;
  }) || cycle.nights[0];

  const owner = allUsers.find(u => u.id === tonightNight?.pickOwnerId);
  const meal  = tonightNight?.selectedMealId ? null : null; // will load separately if needed

  if (!tonightNight?.selectedMealId) {
    card.innerHTML = `
      <div class="tonight-header">
        <span class="tonight-eyebrow">Tonight's Dinner</span>
        <span class="tonight-badge">${owner?.displayName || '?'}'s Pick</span>
      </div>
      <div class="card-body">
        <div class="tonight-meal-name" style="color:var(--text-3); font-style:italic;">
          Not yet selected
        </div>
        <div style="margin-top:10px;">
          ${isAdult() ? `<button class="btn-primary" onclick="navigate('/planner')">Plan Now →</button>` : ''}
        </div>
      </div>
    `;
    return;
  }

  // Load the meal details
  loadTonightMeal(tonightNight, owner, allUsers, card);
}

async function loadTonightMeal(night, owner, allUsers, card) {
  try {
    const { getMeal } = await import('../db.js');
    const meal = await getMeal(night.selectedMealId);
    if (!meal) {
      card.innerHTML = noPlanCard();
      return;
    }

    const cook = allUsers.find(u => u.id === night.cookId);
    const ownerLabel = isChild() && owner?.id === currentUser?.id
      ? '⭐ Your Pick!'
      : `${owner?.displayName || '?'}'s Pick`;

    card.innerHTML = `
      <div class="tonight-header">
        <span class="tonight-eyebrow">Tonight's Dinner</span>
        <span class="tonight-badge">${ownerLabel}</span>
      </div>
      <div class="card-body">
        <div class="tonight-meal-name">${meal.title}</div>
        <div class="meta-row">
          ${cook ? `<div class="chip"><span>👨‍🍳</span> ${cook.displayName} cooking</div>` : ''}
          <div class="chip" style="color:var(--success); font-weight:700;">
            ${costSymbol(meal.cost)}
          </div>
        </div>
        <div class="action-row">
          <button class="btn-primary" style="flex:1;"
            onclick="window.open('${meal.recipeUrl || '#'}', '_blank')">
            🔗 Recipe
          </button>
          ${isAdult() ? `
            <button class="btn-outline" style="flex:1;" onclick="navigate('/shopping')">
              🛒 List
            </button>
          ` : ''}
        </div>
      </div>
    `;
  } catch {
    card.innerHTML = noPlanCard();
  }
}

function noPlanCard() {
  return `
    <div class="tonight-header">
      <span class="tonight-eyebrow">Tonight's Dinner</span>
    </div>
    <div class="card-body">
      <div class="tonight-meal-name" style="color:var(--text-3); font-style:italic;">
        Nothing planned yet
      </div>
      ${isAdult() ? `
        <button class="btn-primary btn-full" style="margin-top:12px;"
          onclick="navigate('/planner')">
          Plan This Cycle →
        </button>
      ` : ''}
    </div>
  `;
}


// ─── Cycle list ───────────────────────────────────────────────────────────────

function renderCycleList(cycle, allUsers) {
  const listEl = document.getElementById('cycle-list');
  if (!listEl) return;

  if (!cycle || !cycle.nights || cycle.nights.length === 0) {
    listEl.innerHTML = `
      <div class="night-row">
        <div style="padding:16px; color:var(--text-3); font-size:14px;">
          No nights planned yet.
          ${isAdult() ? '<br><a href="#" onclick="navigate(\'/planner\')">Go to Planner →</a>' : ''}
        </div>
      </div>
    `;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  listEl.innerHTML = cycle.nights.map(night => {
    const owner     = allUsers.find(u => u.id === night.pickOwnerId);
    const cook      = allUsers.find(u => u.id === night.cookId);
    const nightDate = night.date?.toDate
      ? night.date.toDate().toISOString().slice(0, 10)
      : String(night.date || '').slice(0, 10);
    const isTonight = nightDate === today;
    const pending   = !night.selectedMealId;

    const ownerLabel = isChild() && owner?.id === currentUser?.id
      ? 'Your pick'
      : `${owner?.displayName || '?'}'s pick`;

    return `
      <div class="night-row ${isTonight ? 'night-row-tonight' : ''}">
        <div class="night-num ${isTonight ? 'night-num-active' : ''}">
          ${isTonight ? `<span style="font-size:10px;">NOW</span>` : night.nightNumber || '?'}
        </div>
        <div class="night-info">
          <div class="night-meal ${pending ? 'night-meal-pending' : ''}">
            ${pending ? 'Not yet selected' : (night.mealTitle || 'Selected meal')}
          </div>
          <div class="night-submeta">
            ${ownerLabel}
            ${!isChild() && cook ? ` · ${cook.displayName} cooking` : ''}
          </div>
        </div>
        <div class="night-right">
          ${isTonight ? '<div class="tonight-tag">Tonight</div>' : ''}
          ${nightDate ? `<div class="night-date">${formatDate(new Date(nightDate + 'T12:00:00'))}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}


// ─── Submission banner (kids) ─────────────────────────────────────────────────

function checkSubmissionBanner(cycle, settings) {
  if (!isChild()) return;
  if (!cycle || !settings) return;

  const banner     = document.getElementById('submission-banner');
  if (!banner) return;

  const submissions  = cycle.submissions || {};
  const hasSubmitted = !!submissions[currentUser?.id];
  if (hasSubmitted) return;

  const reminderDay    = settings.submissionReminderDay || 2;
  const startDate      = cycle.startDate?.toDate
    ? cycle.startDate.toDate()
    : new Date(cycle.startDate);
  const daysSinceStart = Math.floor((Date.now() - startDate.getTime()) / 86400000);

  if (daysSinceStart >= (reminderDay - 1)) {
    banner.style.display = 'block';
  }
}


// ─── Error state ──────────────────────────────────────────────────────────────

function renderErrorState() {
  const tonight = document.getElementById('tonight-card');
  const list    = document.getElementById('cycle-list');
  const msg     = `<div style="padding:16px; color:var(--text-3); font-size:14px;">
    Couldn't load data. Check your connection.
  </div>`;
  if (tonight) tonight.innerHTML = msg;
  if (list)    list.innerHTML    = msg;
}

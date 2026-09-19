// js/screens/dashboard.js
import { currentUser, isAdult, isChild } from '../state.js';
import { navigate } from '../router.js';
import { getAllUsers, getHouseholdSettings } from '../db.js';
import { getCurrentCycle } from '../cycles.js';
import { signOut } from '../auth.js';
import { clearCurrentUser } from '../state.js';
import { formatDate, costSymbol } from '../utils.js';

const AC = { Owen:'#495057',Hanna:'#2B6940',Jack:'#1864AB',Otto:'#C1440E',Ella:'#6A0DAD' };
const ab = n => AC[n]||'#868E96';
const ini = n => n?n.slice(0,2).toUpperCase():'??';

export async function renderDashboard(params, container) {
  container.innerHTML = buildShell();
  bindStaticEvents();
  loadData();
}

function buildShell() {
  const u = currentUser;
  return `
    <div class="screen" id="db-screen">
      <div class="app-header">
        <div class="app-wordmark">What's for Dinner?</div>
        <div style="display:flex;align-items:center;gap:10px;">
          ${isAdult()?'<button class="icon-btn" id="notif-btn">🔔</button>':''}
          <button class="avatar" id="avatar-btn" style="background:${ab(u?.displayName)};color:#fff;border:none;cursor:pointer;">${ini(u?.displayName)}</button>
        </div>
      </div>

      ${isAdult() ? `
        <div class="cycle-strip">
          <div class="cycle-strip-inner">
            <span class="cycle-strip-label" id="cycle-label">Loading…</span>
            <div class="cycle-dots" id="cycle-dots"></div>
          </div>
          <div class="night4-bar" id="night4-bar" style="display:none;">
            <span class="night4-text" id="night4-text"></span>
            <button class="override-link" id="override-btn">Override ›</button>
          </div>
        </div>` : `
        <div class="cycle-strip" style="justify-content:flex-start;gap:8px;">
          <div class="cycle-strip-inner"><span style="font-size:18px;">👋</span><span class="cycle-strip-label">Hi, ${u?.displayName}!</span></div>
        </div>`}

      <div class="screen-scroll">
        <div class="screen-content">
          <div>
            <div class="section-label">Tonight's Dinner</div>
            <div class="card" id="tonight-card"><div class="tonight-loading"><div class="spinner spinner-sm"></div></div></div>
          </div>
          <div>
            <div class="section-label">${isAdult()?'This Cycle':"This Week's Dinners"}</div>
            <div class="card" id="cycle-list"><div class="tonight-loading"><div class="spinner spinner-sm"></div></div></div>
          </div>
          ${isAdult() ? `
            <div>
              <div class="section-label">Quick Actions</div>
              <div class="quick-row">
                <button class="quick-btn quick-btn-primary" id="open-shopping">
                  <div class="quick-btn-label">🛒 Shopping List</div>
                  <div class="quick-btn-sub">View current list</div>
                </button>
                <button class="quick-btn quick-btn-disabled" id="gen-shopping" disabled>
                  <div class="quick-btn-label">⚡ Generate List</div>
                  <div class="quick-btn-sub" id="gen-sub">Select all meals first</div>
                </button>
              </div>
            </div>` : ''}
          <div id="sub-banner" style="display:none;">
            <div class="submission-banner">
              <div style="font-size:28px;flex-shrink:0;">🗓️</div>
              <div>
                <div class="sub-banner-title">Time to pick your meals!</div>
                <div class="sub-banner-sub">Submit your top 3 picks for next cycle.</div>
                <button class="sub-banner-btn" id="sub-now-btn">Submit Now →</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      ${buildTabBar()}
    </div>`;
}

function bindStaticEvents() {
  document.getElementById('avatar-btn')?.addEventListener('click', showAccountMenu);
  document.getElementById('open-shopping')?.addEventListener('click', () => navigate('/shopping'));
  document.getElementById('sub-now-btn')?.addEventListener('click', () => navigate('/submission'));
  document.getElementById('override-btn')?.addEventListener('click', () => navigate('/planner'));
  bindTabBar();
}

async function loadData() {
  try {
    const [cycle, allUsers, settings] = await Promise.all([getCurrentCycle(), getAllUsers(), getHouseholdSettings()]);
    renderCycleStrip(cycle, settings, allUsers);
    renderTonightCard(cycle, allUsers);
    renderCycleList(cycle, allUsers);
    checkSubBanner(cycle, settings);
    // Enable generate button when all meals selected
    if (isAdult() && cycle?.nights?.every(n=>n.selectedMealId) && !cycle?.shoppingListId) {
      const btn = document.getElementById('gen-shopping');
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('quick-btn-disabled');
        btn.classList.add('quick-btn-primary');
        document.getElementById('gen-sub').textContent = 'Tap to generate';
        btn.addEventListener('click', () => navigate('/planner'));
      }
    }
  } catch(e) {
    console.error('[Dashboard]', e);
    document.getElementById('tonight-card').innerHTML = errCard();
    document.getElementById('cycle-list').innerHTML   = errCard();
  }
}

function errCard() { return '<div style="padding:16px;color:var(--text-3);font-size:14px;">Couldn\'t load data.</div>'; }

// ─── Cycle strip ───────────────────────────────────────────────────────────

function renderCycleStrip(cycle, settings, allUsers) {
  if (!isAdult()) return;
  const lbl  = document.getElementById('cycle-label');
  const dots = document.getElementById('cycle-dots');
  const bar  = document.getElementById('night4-bar');
  if (!cycle) { if(lbl) lbl.textContent='No active cycle — go to Planner'; return; }

  const nights = cycle.nights||[];
  const today  = new Date().toISOString().slice(0,10);
  const curIdx = Math.max(0, nights.findIndex(n=>{
    const d = n.date?.toDate ? n.date.toDate().toISOString().slice(0,10) : String(n.date||'').slice(0,10);
    return d >= today;
  }));
  const planned = cycle.plannedMealCount||nights.length||4;

  if(lbl) lbl.textContent = `Cycle ${cycle.cycleNumber||'?'} · Night ${curIdx+1} of ${planned}`;
  if(dots) dots.innerHTML = Array.from({length:planned},(_,i)=>{
    let c='dot'; if(i<curIdx) c+=' dot-filled'; if(i===curIdx) c+=' dot-active';
    return `<div class="${c}"></div>`;
  }).join('');

  const adultNight = nights.find(n=>allUsers.find(u=>u.id===n.pickOwnerId)?.role==='adult');
  if (bar && adultNight) {
    const owner = allUsers.find(u=>u.id===adultNight.pickOwnerId);
    document.getElementById('night4-text').innerHTML = `Night ${adultNight.nightNumber}: <strong>${owner?.displayName||'Adult'}'s pick</strong>`;
    bar.style.display='flex';
  }
}

// ─── Tonight card ──────────────────────────────────────────────────────────

function renderTonightCard(cycle, allUsers) {
  const card = document.getElementById('tonight-card');
  if (!card) return;
  if (!cycle?.nights?.length) { card.innerHTML = noPlanCard(); bindNoPlanBtn(); return; }

  const today = new Date().toISOString().slice(0,10);
  const night = cycle.nights.find(n=>{
    const d = n.date?.toDate ? n.date.toDate().toISOString().slice(0,10) : String(n.date||'').slice(0,10);
    return d === today;
  }) || cycle.nights[0];

  const owner = allUsers.find(u=>u.id===night?.pickOwnerId);
  if (!night?.selectedMealId) {
    card.innerHTML = noPlanCard(owner);
    bindNoPlanBtn();
    return;
  }
  loadTonightMeal(night, owner, allUsers, card);
}

async function loadTonightMeal(night, owner, allUsers, card) {
  try {
    const {getMeal} = await import('../db.js');
    const meal = await getMeal(night.selectedMealId);
    if (!meal) { card.innerHTML = noPlanCard(); bindNoPlanBtn(); return; }
    const cook = allUsers.find(u=>u.id===night.cookId);
    const badge = isChild()&&owner?.id===currentUser?.id ? '⭐ Your Pick!' : `${owner?.displayName||'?'}'s Pick`;
    card.innerHTML = `
      <div class="tonight-header">
        <span class="tonight-eyebrow">Tonight's Dinner</span>
        <span class="tonight-badge">${badge}</span>
      </div>
      <div class="card-body">
        <div class="tonight-meal-name">${meal.title}</div>
        <div class="meta-row">
          ${cook?`<div class="chip">👨‍🍳 ${cook.displayName} cooking</div>`:''}
          <div class="chip" style="color:var(--success);font-weight:700;">${costSymbol(meal.cost)}</div>
        </div>
        <div class="action-row">
          ${meal.recipeUrl?`<a class="btn-primary" style="flex:1;text-decoration:none;display:flex;align-items:center;justify-content:center;" href="${meal.recipeUrl}" target="_blank" rel="noopener">🔗 Recipe</a>`:''}
          ${isAdult()?`<button class="btn-outline" style="flex:1;" id="list-from-tonight">🛒 List</button>`:''}
        </div>
      </div>`;
    document.getElementById('list-from-tonight')?.addEventListener('click',()=>navigate('/shopping'));
  } catch { card.innerHTML = noPlanCard(); bindNoPlanBtn(); }
}

function noPlanCard(owner) {
  return `
    <div class="tonight-header"><span class="tonight-eyebrow">Tonight's Dinner</span>${owner?`<span class="tonight-badge">${owner.displayName}'s Pick</span>`:''}</div>
    <div class="card-body">
      <div class="tonight-meal-name" style="color:var(--text-3);font-style:italic;">Not yet selected</div>
      ${isAdult()?`<button class="btn-primary btn-full" id="plan-now-btn" style="margin-top:12px;">Plan Now →</button>`:''}
    </div>`;
}

function bindNoPlanBtn() {
  document.getElementById('plan-now-btn')?.addEventListener('click', ()=>navigate('/planner'));
}

// ─── Cycle list ────────────────────────────────────────────────────────────

function renderCycleList(cycle, allUsers) {
  const el = document.getElementById('cycle-list');
  if (!el) return;
  if (!cycle?.nights?.length) {
    el.innerHTML = `<div style="padding:16px;color:var(--text-3);font-size:14px;">No nights planned.${isAdult()?` <button style="color:var(--primary);font-weight:600;background:none;border:none;cursor:pointer;" id="go-planner-list">Go to Planner →</button>`:''}</div>`;
    document.getElementById('go-planner-list')?.addEventListener('click',()=>navigate('/planner'));
    return;
  }
  const today = new Date().toISOString().slice(0,10);
  el.innerHTML = cycle.nights.map(n=>{
    const owner   = allUsers.find(u=>u.id===n.pickOwnerId);
    const cook    = allUsers.find(u=>u.id===n.cookId);
    const nd      = n.date?.toDate ? n.date.toDate().toISOString().slice(0,10) : String(n.date||'').slice(0,10);
    const tonight = nd===today;
    const ownerLbl = isChild()&&owner?.id===currentUser?.id ? 'Your pick' : `${owner?.displayName||'?'}'s pick`;
    return `
      <div class="night-row ${tonight?'night-row-tonight':''}">
        <div class="night-num ${tonight?'night-num-active':''}">${tonight?'<span style="font-size:9px;">NOW</span>':n.nightNumber||'?'}</div>
        <div class="night-info">
          <div class="night-meal ${!n.selectedMealId?'night-meal-pending':''}">${n.selectedMealId?(n.mealTitle||'Selected'):'Not yet selected'}</div>
          <div class="night-submeta">${ownerLbl}${!isChild()&&cook?` · ${cook.displayName} cooking`:''}</div>
        </div>
        <div class="night-right">
          ${tonight?'<div class="tonight-tag">Tonight</div>':''}
          ${nd?`<div class="night-date">${formatDate(new Date(nd+'T12:00:00'))}</div>`:''}
        </div>
      </div>`;
  }).join('');
}

// ─── Submission banner ─────────────────────────────────────────────────────

function checkSubBanner(cycle, settings) {
  if (!isChild()||!cycle||!settings) return;
  const banner = document.getElementById('sub-banner');
  if (!banner) return;
  if ((cycle.submissions||{})[currentUser?.id]) return;
  const start = cycle.startDate?.toDate ? cycle.startDate.toDate() : new Date(cycle.startDate||0);
  const days  = Math.floor((Date.now()-start.getTime())/86400000);
  if (days >= ((settings.submissionReminderDay||2)-1)) banner.style.display='block';
}

// ─── Account menu ──────────────────────────────────────────────────────────

function showAccountMenu() {
  const ov = document.createElement('div');
  ov.className='modal-overlay';
  ov.innerHTML=`
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <div style="padding:16px 20px 8px;">
        <div style="font-size:16px;font-weight:800;">${currentUser?.displayName}</div>
        <div style="font-size:13px;color:var(--text-3);">${currentUser?.role==='adult'?currentUser?.email||'Adult account':'Kid account'}</div>
      </div>
      <div style="border-top:1px solid var(--border);margin:8px 0;"></div>
      ${isAdult()?'<button class="menu-item" id="m-settings">⚙️ Settings</button>':''}
      <button class="menu-item" id="m-analytics">📊 Stats</button>
      <button class="menu-item menu-item-danger" id="m-signout">Sign Out</button>
      <div style="height:max(16px,env(safe-area-inset-bottom));"></div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click',e=>{ if(e.target===ov) ov.remove(); });
  document.getElementById('m-settings')?.addEventListener('click',()=>{ ov.remove(); navigate('/settings'); });
  document.getElementById('m-analytics')?.addEventListener('click',()=>{ ov.remove(); navigate('/analytics'); });
  document.getElementById('m-signout')?.addEventListener('click', async ()=>{ ov.remove(); clearCurrentUser(); await signOut(); navigate('/login'); });
}

// ─── Tab bar ───────────────────────────────────────────────────────────────

function buildTabBar() {
  if(isAdult()) return `<nav class="tab-bar">
    <button class="tab-item active" data-route="/dashboard"><span class="tab-icon">🏠</span><span class="tab-label">Home</span><div class="tab-dot"></div></button>
    <button class="tab-item" data-route="/planner"><span class="tab-icon">📅</span><span class="tab-label">Planner</span></button>
    <button class="tab-item" data-route="/meals"><span class="tab-icon">🍽️</span><span class="tab-label">Meals</span></button>
    <button class="tab-item" data-route="/shopping"><span class="tab-icon">🛒</span><span class="tab-label">Shopping</span></button>
    <button class="tab-item" data-route="/calendar"><span class="tab-icon">📆</span><span class="tab-label">Calendar</span></button>
  </nav>`;
  return `<nav class="tab-bar">
    <button class="tab-item active" data-route="/dashboard"><span class="tab-icon">🏠</span><span class="tab-label">Home</span><div class="tab-dot"></div></button>
    <button class="tab-item" data-route="/meals"><span class="tab-icon">🍽️</span><span class="tab-label">My Meals</span></button>
    <button class="tab-item" data-route="/calendar"><span class="tab-icon">📆</span><span class="tab-label">Calendar</span></button>
    <button class="tab-item" data-route="/analytics"><span class="tab-icon">📊</span><span class="tab-label">Stats</span></button>
  </nav>`;
}
function bindTabBar() { document.querySelectorAll('.tab-item[data-route]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.route))); }

// js/screens/calendar.js — Calendar (adults edit, kids view)
import { currentUser, isAdult, isChild } from '../state.js';
import { navigate } from '../router.js';
import { getAllUsers, getHouseholdSettings } from '../db.js';
import { isBirthday, todayISO } from '../utils.js';
import {
  getDocs, doc, setDoc, deleteDoc, collection, query,
  where, orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from '../firebase.js';
import { COLLECTIONS } from '../config.js';

const AVATAR_COLORS = { Owen:'#495057', Hanna:'#2B6940', Jack:'#1864AB', Otto:'#C1440E', Ella:'#6A0DAD' };
function avatarBg(n){ return AVATAR_COLORS[n]||'#868E96'; }
function initials(n){ return n?n.slice(0,2).toUpperCase():'??'; }

const STATE_CYCLE = ['home','away','out'];
const STATE_LABELS = { home:'🏠 Home', away:'⭕ Away', out:'🍽️ Out' };
let _viewDate  = new Date();
let _editMode  = false;
let _overrides = {}; // {dateISO: 'home'|'away'|'out'}
let _allUsers  = [];
let _settings  = null;

export async function renderCalendar(params, container) {
  container.innerHTML = `
    <div class="screen" id="cal-screen">
      <div class="app-header">
        <div class="app-wordmark">What's for Dinner?</div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${isChild()?`<span style="font-size:11px;font-weight:700;color:var(--text-3);background:var(--surface-2);padding:3px 9px;border-radius:10px;">View Only</span>`:''}
          <div class="avatar" style="background:${avatarBg(currentUser?.displayName)};color:#fff;">${initials(currentUser?.displayName)}</div>
        </div>
      </div>
      <div id="cal-body" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div style="display:flex;justify-content:center;align-items:center;flex:1;"><div class="spinner"></div></div>
      </div>
      ${buildTabBar()}
    </div>`;
  bindTabBar();
  [_allUsers, _settings] = await Promise.all([getAllUsers(), getHouseholdSettings()]);
  await loadMonthOverrides();
  renderCalendarBody();
}

async function loadMonthOverrides() {
  const y = _viewDate.getFullYear(), m = _viewDate.getMonth()+1;
  const start = `${y}-${String(m).padStart(2,'0')}-01`;
  const end   = `${y}-${String(m).padStart(2,'0')}-31`;
  const q = query(collection(db,COLLECTIONS.CALENDAR), where('date','>=',start), where('date','<=',end));
  const docs = await getDocs(q);
  _overrides = {};
  docs.forEach(d=>{ _overrides[d.id]=d.data().dayState; });
}

function getDefaultState(dateISO) {
  if (!_settings?.rotationAnchorDate) return 'home';
  const anchor = new Date(_settings.rotationAnchorDate+'T12:00:00');
  const target = new Date(dateISO+'T12:00:00');
  const diffDays = Math.round((target-anchor)/(1000*60*60*24));
  const cycleDay = ((diffDays % 6)+6) % 6;
  return cycleDay < 4 ? 'home' : 'away';
}

function getDayState(dateISO) {
  return _overrides[dateISO] || getDefaultState(dateISO);
}

function renderCalendarBody() {
  const body = document.getElementById('cal-body');
  if (!body) return;
  const today = todayISO();
  const y = _viewDate.getFullYear();
  const m = _viewDate.getMonth();
  const daysInMonth = new Date(y,m+1,0).getDate();
  const firstDay    = new Date(y,m,1).getDay();
  const monthName   = new Date(y,m,1).toLocaleString('en-US',{month:'long',year:'numeric'});
  const children    = _allUsers.filter(u=>u.role==='child'&&u.isActive);

  // Build calendar cells
  let cells = '';
  for(let i=0;i<firstDay;i++) cells+=`<div class="cal-cell cal-empty"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const dateISO = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const state   = getDayState(dateISO);
    const isToday = dateISO===today;
    const bday    = _allUsers.find(u=>u.dateOfBirth&&isBirthday(dateISO,u.dateOfBirth));
    const isMyNight = isChild() && state==='home' && isMyPickNight(dateISO);

    cells+=`<div class="cal-cell cal-${state} ${isToday?'cal-today':''} ${bday?'cal-bday':''} ${isMyNight?'cal-mine':''}"
      data-date="${dateISO}" ${isAdult()&&_editMode?'role="button"':''}">
      <div class="cal-day-num">${d}</div>
      ${bday?`<div class="cal-bday-label">🎂</div>`:''}
      ${state==='out'?`<div style="font-size:9px;color:var(--warning);font-weight:700;">OUT</div>`:''}
      ${isMyNight?`<div style="font-size:9px;color:#fff;font-weight:700;background:var(--primary);border-radius:3px;padding:0 3px;">YOU</div>`:''}
    </div>`;
  }

  body.innerHTML = `
    <!-- Month nav -->
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px 8px;background:var(--surface);border-bottom:1px solid var(--border);">
      <button class="icon-btn" id="prev-month">‹</button>
      <span style="font-size:17px;font-weight:800;color:var(--text);">${monthName}</span>
      <button class="icon-btn" id="next-month">›</button>
    </div>

    ${isAdult()?`<!-- Edit toggle -->
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 16px;background:var(--surface);border-bottom:1px solid var(--border);">
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text);">Edit Calendar</div>
        <div style="font-size:11px;color:var(--text-3);">Tap any day to change its state</div>
      </div>
      <label class="toggle">
        <input type="checkbox" id="edit-toggle" ${_editMode?'checked':''} />
        <div class="toggle-track"></div><div class="toggle-thumb"></div>
      </label>
    </div>`:''}

    <!-- Legend -->
    <div style="display:flex;gap:12px;padding:6px 16px;background:var(--surface-2);border-bottom:1px solid var(--border);flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;"><div style="width:10px;height:10px;border-radius:2px;background:var(--primary);"></div>${isChild()?'We\'re home':'Kids Home'}</div>
      <div style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;"><div style="width:10px;height:10px;border-radius:2px;background:var(--border);"></div>${isChild()?'Dad\'s house':'Kids Away'}</div>
      <div style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;"><div style="width:10px;height:10px;border-radius:2px;background:var(--warning);"></div>Dinner Out</div>
    </div>

    <!-- Calendar grid -->
    <div class="screen-scroll">
      <div style="padding:0;">
        <div class="cal-grid">
          ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-dow">${d}</div>`).join('')}
          ${cells}
        </div>

        ${isChild() ? buildKidNightsSummary(y,m+1,daysInMonth,today) : ''}

        ${isAdult() ? `
          <div style="padding:12px 16px;">
            <button class="btn-ghost btn-full" id="reset-month-btn" style="font-size:13px;">
              ↺ Reset ${monthName} to Default Pattern
            </button>
          </div>` : ''}
      </div>
    </div>
  `;

  // Month nav
  document.getElementById('prev-month')?.addEventListener('click', async ()=>{
    _viewDate.setMonth(_viewDate.getMonth()-1);
    await loadMonthOverrides(); renderCalendarBody();
  });
  document.getElementById('next-month')?.addEventListener('click', async ()=>{
    _viewDate.setMonth(_viewDate.getMonth()+1);
    await loadMonthOverrides(); renderCalendarBody();
  });

  // Edit toggle
  document.getElementById('edit-toggle')?.addEventListener('change', e=>{ _editMode=e.target.checked; renderCalendarBody(); });

  // Day cell clicks (edit mode, adults)
  if (isAdult() && _editMode) {
    document.querySelectorAll('.cal-cell[data-date]:not(.cal-empty)').forEach(cell=>{
      cell.style.cursor='pointer';
      cell.addEventListener('click', ()=>cycleDay(cell.dataset.date));
    });
  }

  // Reset month
  document.getElementById('reset-month-btn')?.addEventListener('click', async ()=>{
    if (!confirm(`Reset all of ${monthName} to the default 4/2 pattern? This can't be undone.`)) return;
    const toDelete = Object.keys(_overrides).filter(d=>d.startsWith(`${y}-${String(m+1).padStart(2,'0')}`));
    await Promise.all(toDelete.map(d=>deleteDoc(doc(db,COLLECTIONS.CALENDAR,d))));
    _overrides={};
    renderCalendarBody();
  });
}

function buildKidNightsSummary(y, m, daysInMonth, today) {
  const myNights = [];
  for(let d=1;d<=daysInMonth;d++){
    const dateISO=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if(getDayState(dateISO)==='home' && isMyPickNight(dateISO)) myNights.push(dateISO);
  }
  if(myNights.length===0) return '';
  return `
    <div style="margin:12px 16px 0;background:var(--surface);border-radius:var(--radius-md);padding:12px 14px;box-shadow:var(--shadow-sm);">
      <div class="section-label" style="margin-bottom:8px;">Your nights this month</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${myNights.map(d=>`
          <div style="background:var(--surface-2);border:1.5px solid var(--primary);border-radius:8px;padding:5px 10px;font-size:12px;font-weight:700;">
            ${new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}
          </div>`).join('')}
      </div>
    </div>`;
}

function isMyPickNight(dateISO) {
  // Simplified: cycle day 0 = Jack, 1 = Otto, 2 = Ella in order
  const children = _allUsers.filter(u=>u.role==='child'&&u.isActive).sort((a,b)=>a.displayName.localeCompare(b.displayName));
  const myIdx    = children.findIndex(u=>u.id===currentUser?.id);
  if (myIdx<0) return false;
  if (!_settings?.rotationAnchorDate) return false;
  const anchor   = new Date(_settings.rotationAnchorDate+'T12:00:00');
  const target   = new Date(dateISO+'T12:00:00');
  const diffDays = Math.round((target-anchor)/(1000*60*60*24));
  const cycleDay = ((diffDays % 6)+6) % 6;
  return cycleDay === myIdx;
}

async function cycleDay(dateISO) {
  const current  = getDayState(dateISO);
  const nextState= STATE_CYCLE[(STATE_CYCLE.indexOf(current)+1)%STATE_CYCLE.length];
  if (nextState===getDefaultState(dateISO)) {
    delete _overrides[dateISO];
    await deleteDoc(doc(db,COLLECTIONS.CALENDAR,dateISO));
  } else {
    _overrides[dateISO]=nextState;
    await setDoc(doc(db,COLLECTIONS.CALENDAR,dateISO),{date:dateISO,dayState:nextState,overriddenBy:currentUser?.id});
  }
  renderCalendarBody();
}

function buildTabBar() {
  if(isChild()){
    return `<nav class="tab-bar">
      <button class="tab-item" data-route="/dashboard"><span class="tab-icon">🏠</span><span class="tab-label">Home</span></button>
      <button class="tab-item" data-route="/meals"><span class="tab-icon">🍽️</span><span class="tab-label">My Meals</span></button>
      <button class="tab-item active" data-route="/calendar"><span class="tab-icon">📆</span><span class="tab-label">Calendar</span><div class="tab-dot"></div></button>
      <button class="tab-item" data-route="/analytics"><span class="tab-icon">📊</span><span class="tab-label">Stats</span></button>
    </nav>`;
  }
  return `<nav class="tab-bar">
    <button class="tab-item" data-route="/dashboard"><span class="tab-icon">🏠</span><span class="tab-label">Home</span></button>
    <button class="tab-item" data-route="/planner"><span class="tab-icon">📅</span><span class="tab-label">Planner</span></button>
    <button class="tab-item" data-route="/meals"><span class="tab-icon">🍽️</span><span class="tab-label">Meals</span></button>
    <button class="tab-item" data-route="/shopping"><span class="tab-icon">🛒</span><span class="tab-label">Shopping</span></button>
    <button class="tab-item active" data-route="/calendar"><span class="tab-icon">📆</span><span class="tab-label">Calendar</span><div class="tab-dot"></div></button>
  </nav>`;
}

function bindTabBar() {
  document.querySelectorAll('.tab-item[data-route]').forEach(btn=>{
    btn.addEventListener('click',()=>navigate(btn.dataset.route));
  });
}

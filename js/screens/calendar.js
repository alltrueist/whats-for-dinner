// js/screens/calendar.js — Calendar (adults edit, kids view)
import { currentUser, isAdult, isChild } from '../state.js';
import { navigate } from '../router.js';
import { getAllUsers, getHouseholdSettings } from '../db.js';
import { isBirthday, todayISO } from '../utils.js';
import { getDocs, doc, setDoc, deleteDoc, collection, query, where } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from '../firebase.js';
import { COLLECTIONS } from '../config.js';

const AC={Owen:'#495057',Hanna:'#2B6940',Jack:'#1864AB',Otto:'#C1440E',Ella:'#6A0DAD'};
const ab=n=>AC[n]||'#868E96';
const ini=n=>n?n.slice(0,2).toUpperCase():'??';

const STATES=['home','away','out'];
let _vd=new Date(), _editMode=false, _overrides={}, _users=[], _settings=null;

export async function renderCalendar(params,container) {
  container.innerHTML=`
    <div class="screen" id="cal-screen">
      <div class="app-header">
        <div class="app-wordmark">What's for Dinner?</div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${isChild()?'<span style="font-size:11px;font-weight:700;color:var(--text-3);background:var(--surface-2);padding:3px 9px;border-radius:10px;">View Only</span>':''}
          <div class="avatar" style="background:${ab(currentUser?.displayName)};color:#fff;">${ini(currentUser?.displayName)}</div>
        </div>
      </div>
      <div id="cal-body" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div style="display:flex;justify-content:center;align-items:center;flex:1;"><div class="spinner"></div></div>
      </div>
      ${buildTabBar()}
    </div>`;
  bindTabBar();
  [_users,_settings]=await Promise.all([getAllUsers(),getHouseholdSettings()]);
  await loadOverrides();
  renderCal();
}

async function loadOverrides() {
  const y=_vd.getFullYear(), m=_vd.getMonth()+1;
  const start=`${y}-${String(m).padStart(2,'0')}-01`;
  const end  =`${y}-${String(m).padStart(2,'0')}-31`;
  // Simple range query on 'date' field — no composite index needed (single field)
  const snap=await getDocs(query(collection(db,COLLECTIONS.CALENDAR),where('date','>=',start),where('date','<=',end)));
  _overrides={};
  snap.forEach(d=>{_overrides[d.id]=d.data().dayState;});
}

function defaultState(iso) {
  if(!_settings?.rotationAnchorDate) return 'home';
  const anchor=new Date(_settings.rotationAnchorDate+'T12:00:00');
  const target=new Date(iso+'T12:00:00');
  const diff=Math.round((target-anchor)/(1000*60*60*24));
  const day=((diff%6)+6)%6;
  return day<4?'home':'away';
}

function dayState(iso){return _overrides[iso]||defaultState(iso);}

function renderCal() {
  const body=document.getElementById('cal-body');
  if(!body) return;
  const y=_vd.getFullYear(), m=_vd.getMonth();
  const days=new Date(y,m+1,0).getDate();
  const firstDay=new Date(y,m,1).getDay();
  const monthLabel=new Date(y,m,1).toLocaleString('en-US',{month:'long',year:'numeric'});
  const today=todayISO();

  let cells='';
  for(let i=0;i<firstDay;i++) cells+=`<div class="cal-cell cal-empty"></div>`;
  for(let d=1;d<=days;d++){
    const iso=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const state=dayState(iso);
    const isToday=iso===today;
    const bday=_users.find(u=>u.dateOfBirth&&isBirthday(iso,u.dateOfBirth));
    const mine=isChild()&&state==='home'&&isMyNight(iso);

    // NOTE: No inline onclick here — we bind via addEventListener after render
    cells+=`<div class="cal-cell cal-${state}${isToday?' cal-today':''}${bday?' cal-bday':''}${mine?' cal-mine':''}" data-iso="${iso}">
      <div class="cal-day-num" style="${isToday?'background:var(--primary);color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;':''}">${d}</div>
      ${bday?`<div style="font-size:10px;">🎂</div>`:''}
      ${state==='out'?`<div style="font-size:9px;color:var(--warning);font-weight:700;">OUT</div>`:''}
      ${mine?`<div style="font-size:9px;color:#fff;font-weight:700;background:var(--primary);border-radius:3px;padding:0 3px;">YOU</div>`:''}
    </div>`;
  }

  body.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px 8px;background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;">
      <button class="icon-btn" id="prev-mo">‹</button>
      <span style="font-size:17px;font-weight:800;color:var(--text);">${monthLabel}</span>
      <button class="icon-btn" id="next-mo">›</button>
    </div>

    ${isAdult()?`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 16px;background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;">
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text);">Edit Calendar</div>
        <div style="font-size:11px;color:var(--text-3);">Tap any day to change its state</div>
      </div>
      <label class="toggle">
        <input type="checkbox" id="edit-tog" ${_editMode?'checked':''}>
        <div class="toggle-track"></div><div class="toggle-thumb"></div>
      </label>
    </div>`:''}

    <div style="display:flex;gap:12px;padding:6px 16px;background:var(--surface-2);border-bottom:1px solid var(--border);flex-shrink:0;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;"><div style="width:10px;height:10px;border-radius:2px;background:var(--primary);"></div>${isChild()?'We\'re home':'Kids Home'}</div>
      <div style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;"><div style="width:10px;height:10px;border-radius:2px;background:var(--border);"></div>${isChild()?'Dad\'s house':'Kids Away'}</div>
      <div style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;"><div style="width:10px;height:10px;border-radius:2px;background:var(--warning);"></div>Dinner Out</div>
    </div>

    <div class="screen-scroll" style="flex:1;">
      <div class="cal-grid">
        ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-dow">${d}</div>`).join('')}
        ${cells}
      </div>
      ${isChild()?buildMyNights(y,m+1,days):''}
      ${isAdult()?`<div style="padding:12px 16px;"><button class="btn-ghost btn-full" id="reset-month">↺ Reset ${monthLabel} to Default Pattern</button></div>`:''}
    </div>`;

  // Month nav
  document.getElementById('prev-mo')?.addEventListener('click',async()=>{_vd.setMonth(_vd.getMonth()-1);await loadOverrides();renderCal();});
  document.getElementById('next-mo')?.addEventListener('click',async()=>{_vd.setMonth(_vd.getMonth()+1);await loadOverrides();renderCal();});

  // Edit toggle
  document.getElementById('edit-tog')?.addEventListener('change',e=>{_editMode=e.target.checked;renderCal();});

  // Day cell taps
  document.querySelectorAll('.cal-cell[data-iso]:not(.cal-empty)').forEach(cell=>{
    if(isAdult()&&_editMode) cell.style.cursor='pointer';
    cell.addEventListener('click',()=>{
      if(isAdult()&&_editMode) cycleDay(cell.dataset.iso);
    });
  });

  // Reset month
  document.getElementById('reset-month')?.addEventListener('click',async()=>{
    if(!confirm(`Reset all of ${monthLabel} to the default pattern?`))return;
    const prefix=`${y}-${String(m+1).padStart(2,'0')}`;
    await Promise.all(Object.keys(_overrides).filter(d=>d.startsWith(prefix)).map(d=>deleteDoc(doc(db,COLLECTIONS.CALENDAR,d))));
    _overrides={};renderCal();
  });
}

function buildMyNights(y,m,days) {
  const nights=[];
  for(let d=1;d<=days;d++){
    const iso=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if(dayState(iso)==='home'&&isMyNight(iso)) nights.push(iso);
  }
  if(!nights.length) return '';
  return `
    <div style="margin:12px 16px 0;background:var(--surface);border-radius:var(--radius-md);padding:12px 14px;box-shadow:var(--shadow-sm);">
      <div class="section-label" style="margin-bottom:8px;">Your nights this month</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${nights.map(iso=>`<div style="background:var(--surface-2);border:1.5px solid var(--primary);border-radius:8px;padding:5px 10px;font-size:12px;font-weight:700;">
          ${new Date(iso+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}
        </div>`).join('')}
      </div>
    </div>`;
}

function isMyNight(iso) {
  const children=_users.filter(u=>u.role==='child'&&u.isActive).sort((a,b)=>a.displayName.localeCompare(b.displayName));
  const myIdx=children.findIndex(u=>u.id===currentUser?.id);
  if(myIdx<0||!_settings?.rotationAnchorDate) return false;
  const anchor=new Date(_settings.rotationAnchorDate+'T12:00:00');
  const target=new Date(iso+'T12:00:00');
  const diff=Math.round((target-anchor)/(1000*60*60*24));
  const cycleDay=((diff%6)+6)%6;
  return cycleDay===myIdx;
}

async function cycleDay(iso) {
  const cur=dayState(iso);
  const next=STATES[(STATES.indexOf(cur)+1)%STATES.length];
  if(next===defaultState(iso)) {
    delete _overrides[iso];
    await deleteDoc(doc(db,COLLECTIONS.CALENDAR,iso));
  } else {
    _overrides[iso]=next;
    await setDoc(doc(db,COLLECTIONS.CALENDAR,iso),{date:iso,dayState:next,overriddenBy:currentUser?.id});
  }
  renderCal();
}

function buildTabBar(){
  if(isChild())return`<nav class="tab-bar">
    <button class="tab-item" data-route="/dashboard"><span class="tab-icon">🏠</span><span class="tab-label">Home</span></button>
    <button class="tab-item" data-route="/meals"><span class="tab-icon">🍽️</span><span class="tab-label">My Meals</span></button>
    <button class="tab-item active" data-route="/calendar"><span class="tab-icon">📆</span><span class="tab-label">Calendar</span><div class="tab-dot"></div></button>
    <button class="tab-item" data-route="/analytics"><span class="tab-icon">📊</span><span class="tab-label">Stats</span></button>
  </nav>`;
  return`<nav class="tab-bar">
    <button class="tab-item" data-route="/dashboard"><span class="tab-icon">🏠</span><span class="tab-label">Home</span></button>
    <button class="tab-item" data-route="/planner"><span class="tab-icon">📅</span><span class="tab-label">Planner</span></button>
    <button class="tab-item" data-route="/meals"><span class="tab-icon">🍽️</span><span class="tab-label">Meals</span></button>
    <button class="tab-item" data-route="/shopping"><span class="tab-icon">🛒</span><span class="tab-label">Shopping</span></button>
    <button class="tab-item active" data-route="/calendar"><span class="tab-icon">📆</span><span class="tab-label">Calendar</span><div class="tab-dot"></div></button>
  </nav>`;}
function bindTabBar(){document.querySelectorAll('.tab-item[data-route]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.route)));}

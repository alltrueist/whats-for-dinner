// js/screens/submission.js — Kid meal submission flow
import { currentUser } from '../state.js';
import { navigate } from '../router.js';
import { getAllUsers, getHouseholdSettings } from '../db.js';
import { formatDate } from '../utils.js';
import {
  getDocs, doc, updateDoc, collection, query,
  where, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from '../firebase.js';
import { COLLECTIONS } from '../config.js';

const MEAL_EMOJIS = ['🍝','🌮','🍕','🍔','🍗','🥩','🥗','🍜','🥪','🍱','🫕','🥘','🍲','🌯','🫔'];
function mealEmoji(title='') {
  const h=[...title].reduce((a,c)=>a+c.charCodeAt(0),0);
  return MEAL_EMOJIS[h%MEAL_EMOJIS.length];
}

const AVATAR_COLORS = { Owen:'#495057', Hanna:'#2B6940', Jack:'#1864AB', Otto:'#C1440E', Ella:'#6A0DAD' };
function avatarBg(n){ return AVATAR_COLORS[n]||'#868E96'; }
function initials(n){ return n?n.slice(0,2).toUpperCase():'??'; }

let _cycle    = null;
let _meals    = [];
let _picks    = []; // Array of meal IDs, max 3, in rank order
let _settings = null;
let _allUsers = [];

export async function renderSubmission(params, container) {
  container.innerHTML = `
    <div class="screen" id="sub-screen">
      <div class="app-header">
        <div class="app-wordmark">What's for Dinner?</div>
        <div class="avatar" style="background:${avatarBg(currentUser?.displayName)};color:#fff;">${initials(currentUser?.displayName)}</div>
      </div>
      <div id="sub-body" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div style="display:flex;justify-content:center;align-items:center;flex:1;"><div class="spinner"></div></div>
      </div>
    </div>`;

  try {
    [_settings, _allUsers] = await Promise.all([getHouseholdSettings(), getAllUsers()]);
    _cycle = await getPlanningCycle();
    _meals = await getMyActiveMeals();

    if (!_cycle) { renderNoActiveCycle(); return; }

    const existing = (_cycle.submissions||{})[currentUser?.id]||[];
    if (existing.length>0) { renderAlreadySubmitted(existing); return; }

    renderPickingScreen();
  } catch(err){
    console.error(err);
    document.getElementById('sub-body').innerHTML=`<div class="note note-warn" style="margin:20px;"><span>⚠</span><div>Failed to load. Try again.</div></div>`;
  }
}

async function getPlanningCycle() {
  const q=query(collection(db,COLLECTIONS.CYCLES),where('status','==','planning'),orderBy('startDate','desc'),limit(1));
  const docs=(await getDocs(q)).docs;
  return docs.length>0?{id:docs[0].id,...docs[0].data()}:null;
}

async function getMyActiveMeals() {
  const q=query(collection(db,COLLECTIONS.MEALS),where('ownerId','==',currentUser?.id),where('status','in',['active','cooldown']));
  const docs=(await getDocs(q)).docs;
  return docs.map(d=>({id:d.id,...d.data()}));
}

function renderNoActiveCycle() {
  const body=document.getElementById('sub-body');
  body.innerHTML=`
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;padding:40px;text-align:center;">
      <div style="font-size:48px;margin-bottom:16px;">😴</div>
      <div style="font-size:18px;font-weight:800;color:var(--text);margin-bottom:8px;">Nothing to pick yet</div>
      <div style="font-size:14px;color:var(--text-3);margin-bottom:24px;">Owen or Mom will let you know when it's time to choose your meals.</div>
      <button class="btn-primary" onclick="navigate('/dashboard')">← Go Home</button>
    </div>`;
}

function renderAlreadySubmitted(picks) {
  const body=document.getElementById('sub-body');
  const deadline=_settings?.submissionDeadlineDay||5;
  const startDate=_cycle?.startDate?.toDate?_cycle.startDate.toDate():new Date(_cycle?.startDate+'T12:00:00');
  const deadlineDate=new Date(startDate); deadlineDate.setDate(deadlineDate.getDate()+deadline-1);

  const otherKids=_allUsers.filter(u=>u.role==='child'&&u.isActive&&u.id!==currentUser?.id);
  const submissions=_cycle?.submissions||{};

  body.innerHTML=`
    <div class="header-strip" style="background:var(--success);">
      <div class="strip-title">Picks submitted! ✓</div>
      <div class="strip-sub">Owen or Mom will finalize everything before shopping day.</div>
    </div>
    <div class="screen-scroll">
      <div class="screen-content">
        <div class="card">
          <div style="padding:14px 16px;font-size:15px;font-weight:800;color:var(--text);">🎉 You're in, ${currentUser?.displayName}!</div>
          <div style="padding:0 16px 14px;font-size:13px;color:var(--text-3);">
            If your #1 gets vetoed, your #2 moves up automatically. No need to do anything.
          </div>
        </div>

        <div>
          <div class="section-label">Your Picks</div>
          <div class="card">
            ${picks.map((mId,i)=>{
              const m=_meals.find(x=>x.id===mId);
              return `<div class="stat-row" style="padding:12px 14px;">
                <div class="stat-rank" style="background:${['var(--primary)','#868E96','#ADB5BD'][i]||'var(--border)'};color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0;">${i+1}</div>
                <div class="stat-info"><div class="stat-name">${m?.title||'Unknown meal'}</div><div class="stat-sub">${['1st choice — wins unless vetoed','Backup #1','Backup #2'][i]}</div></div>
                <div style="font-size:20px;">${mealEmoji(m?.title||'')}</div>
              </div>`;
            }).join('<div class="settings-divider"></div>')}
          </div>
        </div>

        <div>
          <div class="section-label">Sibling Status</div>
          <div class="card">
            ${otherKids.map(kid=>{
              const hasSub=!!(submissions[kid.id]&&submissions[kid.id].length>0);
              return `<div class="stat-row" style="padding:12px 14px;">
                <div class="mini-avatar" style="background:${avatarBg(kid.displayName)};width:28px;height:28px;font-size:10px;">${initials(kid.displayName)}</div>
                <div class="stat-info"><div class="stat-name">${kid.displayName}</div></div>
                <div style="font-size:13px;font-weight:600;color:${hasSub?'var(--success)':'var(--text-3)'};">
                  ${hasSub?'✓ Submitted':'⏳ Pending'}
                </div>
              </div>`;
            }).join('<div class="settings-divider"></div>')}
          </div>
        </div>

        <div class="note note-info">
          <span>ℹ</span>
          <div>You can change your picks until <strong>${formatDate(deadlineDate,{weekday:'long',month:'short',day:'numeric'})}</strong>. After that, only Owen or Mom can make changes.</div>
        </div>

        <button class="btn-ghost btn-full" id="change-picks-btn">↩ Change my picks</button>
        <button class="btn-primary btn-full" onclick="navigate('/dashboard')">← Back to Home</button>
      </div>
    </div>`;

  document.getElementById('change-picks-btn')?.addEventListener('click',()=>{
    _picks=[];
    renderPickingScreen();
  });
}

function renderPickingScreen() {
  const body=document.getElementById('sub-body');
  const deadline=_settings?.submissionDeadlineDay||5;
  const startDate=_cycle?.startDate?.toDate?_cycle.startDate.toDate():new Date((_cycle?.startDate||'')+'T12:00:00');
  const deadlineDate=new Date(startDate); deadlineDate.setDate(deadlineDate.getDate()+deadline-1);
  const daysLeft=Math.ceil((deadlineDate-new Date())/(1000*60*60*24));
  const urgent=daysLeft<=1;

  const activeMeals=_meals.filter(m=>m.status==='active');
  const cooldownMeals=_meals.filter(m=>m.status==='cooldown');
  const allDisplay=[...activeMeals,...cooldownMeals];

  body.innerHTML=`
    <!-- Header -->
    <div class="header-strip">
      <div class="strip-title">Pick your meals, ${currentUser?.displayName}!</div>
      <div class="strip-sub">Tap a meal to rank it. Your #1 pick wins unless vetoed.</div>
      <div class="strip-deadline ${urgent?'urgent':''}">
        Due ${formatDate(deadlineDate,{weekday:'long',month:'short',day:'numeric'})}
        ${urgent?' · TODAY!':''}
      </div>
    </div>

    <!-- Rank slots (sticky) -->
    <div id="rank-slots-bar" style="background:var(--surface);border-bottom:1px solid var(--border);padding:10px 14px;display:flex;gap:8px;">
      ${[0,1,2].map(i=>buildRankSlot(i)).join('')}
    </div>

    <!-- Surprise Me -->
    <div style="padding:8px 14px;background:var(--surface-2);border-bottom:1px solid var(--border);">
      <button class="btn-ghost btn-full" id="surprise-me-btn" style="font-size:13px;">
        🎲 Surprise Me — pick randomly for me
      </button>
    </div>

    <!-- Meal grid -->
    <div class="screen-scroll">
      <div id="meal-pick-grid" class="meal-pick-grid">
        ${allDisplay.length===0 ? `<div style="text-align:center;padding:48px 24px;">
          <div style="font-size:48px;margin-bottom:12px;">🍽️</div>
          <div style="font-size:15px;color:var(--text-3);">Ask Owen or Mom to add meals to your pool!</div>
        </div>` : allDisplay.map(m=>buildPickCard(m)).join('')}
      </div>
    </div>

    <!-- Submit bar -->
    <div id="submit-bar" style="padding:10px 14px max(16px,env(safe-area-inset-bottom));background:var(--surface);border-top:1px solid var(--border);">
      <button class="btn-primary btn-full" id="submit-picks-btn" disabled style="opacity:0.5;">
        Submit Picks (${_picks.length} of 3 chosen)
      </button>
      ${_picks.length<3?`<div style="text-align:center;font-size:11px;color:var(--text-3);margin-top:5px;">Choose ${3-_picks.length} more meal${3-_picks.length!==1?'s':''} to submit</div>`:''}
    </div>
  `;

  bindPickingEvents(activeMeals, cooldownMeals);
}

function buildRankSlot(i) {
  const mealId=_picks[i];
  const meal=mealId?_meals.find(m=>m.id===mealId):null;
  const labels=['1st Choice','2nd Choice','3rd Choice'];
  if (meal) {
    return `<div class="rank-slot rank-slot-filled" data-slot="${i}" id="slot-${i}">
      <div style="font-size:9px;font-weight:700;color:var(--text-3);">${labels[i]}</div>
      <div style="font-size:18px;">${mealEmoji(meal.title)}</div>
      <div style="font-size:10px;font-weight:700;color:var(--text);line-height:1.2;text-align:center;">${meal.title}</div>
      <div style="font-size:9px;color:var(--alert);cursor:pointer;margin-top:2px;" data-remove="${i}">tap to remove</div>
    </div>`;
  }
  return `<div class="rank-slot" id="slot-${i}">
    <div style="font-size:9px;font-weight:700;color:var(--text-3);">${labels[i]}</div>
    <div style="font-size:18px;color:var(--border);">○</div>
    <div style="font-size:9px;color:var(--text-3);">tap a meal</div>
  </div>`;
}

function buildPickCard(meal) {
  const isCooldown=meal.status==='cooldown';
  const rankIdx=_picks.indexOf(meal.id);
  const isSelected=rankIdx>=0;
  const coolDate=meal.cooldownUntil?formatDate(new Date(meal.cooldownUntil+'T12:00:00'),{month:'short',day:'numeric',year:'numeric'}):'';

  return `
    <div class="meal-pick-card-item ${isCooldown?'pick-card-cooldown':''} ${isSelected?'pick-card-selected':''}"
      data-meal="${meal.id}" data-cooldown="${isCooldown}">
      <div class="pick-card-img">
        <div style="font-size:28px;">${mealEmoji(meal.title)}</div>
        ${isSelected?`<div class="rank-badge-overlay">${rankIdx+1}</div>`:''}
        ${isCooldown?`<div class="cooldown-overlay"><div style="font-size:16px;">⏸</div><div style="font-size:10px;font-weight:800;">Cooldown</div></div>`:''}
      </div>
      <div class="pick-card-body">
        <div class="pick-card-name ${isCooldown?'pick-card-name-dim':''}">${meal.title}</div>
        ${isCooldown?`<div style="font-size:10px;color:var(--alert);font-weight:600;">Available ${coolDate}</div>`:`<div class="pick-card-cost">${'$'.repeat(meal.cost||1)}</div>`}
      </div>
    </div>`;
}

function bindPickingEvents(activeMeals) {
  // Remove from slot
  document.querySelectorAll('[data-remove]').forEach(el=>{
    el.addEventListener('click', e=>{
      e.stopPropagation();
      const i=parseInt(el.dataset.remove);
      _picks.splice(i,1);
      refreshPickUI(activeMeals);
    });
  });

  // Meal card tap
  document.querySelectorAll('.meal-pick-card-item').forEach(card=>{
    card.addEventListener('click', ()=>{
      const mealId=card.dataset.meal;
      const isCooldown=card.dataset.cooldown==='true';
      if (isCooldown) {
        const meal=_meals.find(m=>m.id===mealId);
        const until=meal?.cooldownUntil?formatDate(new Date(meal.cooldownUntil+'T12:00:00'),{month:'long',day:'numeric',year:'numeric'}):'soon';
        alert(`${meal?.title} is on cooldown — it was selected recently.\n\nAvailable again: ${until}`);
        return;
      }
      if (_picks.includes(mealId)) {
        _picks=_picks.filter(id=>id!==mealId);
      } else if (_picks.length<3) {
        _picks.push(mealId);
      }
      refreshPickUI(activeMeals);
    });
  });

  // Surprise Me
  document.getElementById('surprise-me-btn')?.addEventListener('click',()=>doSurpriseMe(activeMeals));

  // Submit
  document.getElementById('submit-picks-btn')?.addEventListener('click',()=>{
    if(_picks.length!==3) return;
    showConfirmDialog();
  });
}

function refreshPickUI(activeMeals) {
  // Update rank slots
  const slotsBar=document.getElementById('rank-slots-bar');
  if(slotsBar) slotsBar.innerHTML=[0,1,2].map(i=>buildRankSlot(i)).join('');

  // Re-bind remove buttons
  document.querySelectorAll('[data-remove]').forEach(el=>{
    el.addEventListener('click',e=>{
      e.stopPropagation();
      _picks.splice(parseInt(el.dataset.remove),1);
      refreshPickUI(activeMeals);
    });
  });

  // Update cards
  document.querySelectorAll('.meal-pick-card-item').forEach(card=>{
    const mealId=card.dataset.meal;
    const rankIdx=_picks.indexOf(mealId);
    const isSelected=rankIdx>=0;
    card.classList.toggle('pick-card-selected',isSelected);
    const badge=card.querySelector('.rank-badge-overlay');
    if(badge) badge.remove();
    if(isSelected) {
      const imgArea=card.querySelector('.pick-card-img');
      const b=document.createElement('div');
      b.className='rank-badge-overlay';
      b.textContent=rankIdx+1;
      imgArea?.appendChild(b);
    }
  });

  // Update submit button
  const btn=document.getElementById('submit-picks-btn');
  if(btn){
    btn.disabled=_picks.length!==3;
    btn.style.opacity=_picks.length===3?'1':'0.5';
    btn.textContent=`Submit Picks (${_picks.length} of 3 chosen)`;
  }
}

function doSurpriseMe(activeMeals) {
  const eligible=activeMeals.filter(m=>m.status==='active'&&!_picks.includes(m.id));
  if(eligible.length===0){ alert('No more eligible meals to pick!'); return; }
  let pick=eligible[Math.floor(Math.random()*eligible.length)];
  showSurpriseResult(pick, activeMeals);
}

function showSurpriseResult(meal, activeMeals) {
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`
    <div class="bottom-sheet" style="text-align:center;">
      <div class="sheet-handle"></div>
      <div style="background:var(--primary);padding:20px;">
        <div style="font-size:36px;margin-bottom:8px;">🎲</div>
        <div style="font-size:18px;font-weight:800;color:#fff;">Your random pick!</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:4px;">Not feeling it? Reroll — no limit!</div>
      </div>
      <div style="padding:24px 20px;">
        <div style="font-size:52px;margin-bottom:10px;">${mealEmoji(meal.title)}</div>
        <div style="font-size:22px;font-weight:800;color:var(--text);margin-bottom:4px;">${meal.title}</div>
        <div style="font-size:13px;color:var(--text-3);margin-bottom:24px;">${'$'.repeat(meal.cost||1)} · Active</div>
        <div style="display:flex;gap:10px;">
          <button class="btn-primary" style="flex:1.5;" id="accept-surprise">✓ I'll take it!</button>
          <button class="btn-ghost" style="flex:1;" id="reroll-surprise">🎲 Reroll</button>
        </div>
      </div>
      <div style="height:max(16px,env(safe-area-inset-bottom));"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{ if(e.target===overlay) overlay.remove(); });

  document.getElementById('accept-surprise')?.addEventListener('click',()=>{
    if(_picks.length<3 && !_picks.includes(meal.id)) _picks.push(meal.id);
    overlay.remove();
    refreshPickUI(activeMeals);
  });

  document.getElementById('reroll-surprise')?.addEventListener('click',()=>{
    const eligible=activeMeals.filter(m=>m.status==='active'&&!_picks.includes(m.id)&&m.id!==meal.id);
    if(eligible.length===0){ alert('No more meals to roll!'); return; }
    const newPick=eligible[Math.floor(Math.random()*eligible.length)];
    overlay.remove();
    showSurpriseResult(newPick, activeMeals);
  });
}

function showConfirmDialog() {
  const pickMeals=_picks.map(id=>_meals.find(m=>m.id===id)).filter(Boolean);
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <div style="padding:16px 20px 10px;border-bottom:1px solid var(--border);">
        <div style="font-size:17px;font-weight:800;color:var(--text);margin-bottom:3px;">Submit these picks?</div>
        <div style="font-size:13px;color:var(--text-3);">Owen or Mom can still adjust things before shopping day.</div>
      </div>
      ${pickMeals.map((m,i)=>`
        <div style="display:flex;align-items:center;gap:12px;padding:13px 20px;border-bottom:1px solid var(--border);">
          <div style="width:28px;height:28px;border-radius:50%;background:${['var(--primary)','#868E96','#ADB5BD'][i]};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0;">${i+1}</div>
          <div style="flex:1;"><div style="font-size:14px;font-weight:700;">${m.title}</div><div style="font-size:11px;color:var(--text-3);">${['1st choice — wins unless vetoed','Backup #1','Backup #2'][i]}</div></div>
          <div style="font-size:22px;">${mealEmoji(m.title)}</div>
        </div>`).join('')}
      <div class="note note-info" style="margin:10px 20px;">
        <span>ℹ</span><div><strong>One veto available this cycle.</strong> If a sibling vetoes your #1, your #2 moves up automatically.</div>
      </div>
      <div style="display:flex;gap:8px;padding:10px 20px max(16px,env(safe-area-inset-bottom));">
        <button class="btn-primary" style="flex:1.5;" id="confirm-submit">✓ Submit My Picks</button>
        <button class="btn-ghost" style="flex:1;" onclick="this.closest('.modal-overlay').remove()">Go Back</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{ if(e.target===overlay) overlay.remove(); });

  document.getElementById('confirm-submit')?.addEventListener('click', async ()=>{
    overlay.remove();
    await submitPicks();
  });
}

async function submitPicks() {
  try {
    const submissions={...(_cycle?.submissions||{})};
    submissions[currentUser.id]=_picks;
    await updateDoc(doc(db,COLLECTIONS.CYCLES,_cycle.id),{submissions});
    _cycle.submissions=submissions;
    renderAlreadySubmitted(_picks);
  } catch(err){
    console.error(err);
    alert('Failed to submit picks. Try again.');
  }
}

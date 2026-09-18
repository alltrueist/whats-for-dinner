// js/screens/planner.js — Cycle Planner (adults only)
import { currentUser } from '../state.js';
import { navigate } from '../router.js';
import { getAllUsers, getMeal, getActiveMeals, getHouseholdSettings } from '../db.js';
import { formatDate, costSymbol } from '../utils.js';
import {
  getDocs, addDoc, updateDoc, doc, collection, query,
  where, orderBy, limit, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from '../firebase.js';
import { COLLECTIONS } from '../config.js';

const AVATAR_COLORS = { Owen:'#495057', Hanna:'#2B6940', Jack:'#1864AB', Otto:'#C1440E', Ella:'#6A0DAD' };
function avatarBg(n){ return AVATAR_COLORS[n]||'#868E96'; }
function initials(n){ return n?n.slice(0,2).toUpperCase():'??'; }

export async function renderPlanner(params, container) {
  container.innerHTML = `
    <div class="screen" id="planner-screen">
      <div class="app-header">
        <div class="app-wordmark">What's for Dinner?</div>
        <div class="avatar" style="background:${avatarBg(currentUser?.displayName)};color:#fff;">${initials(currentUser?.displayName)}</div>
      </div>
      <div class="screen-scroll">
        <div class="screen-content" id="planner-content">
          <div style="display:flex;justify-content:center;padding:40px;"><div class="spinner"></div></div>
        </div>
      </div>
      ${buildTabBar()}
    </div>`;
  bindTabBar();
  await loadPlanner();
}

async function loadPlanner() {
  const content = document.getElementById('planner-content');
  try {
    const [allUsers, settings, cycle] = await Promise.all([
      getAllUsers(), getHouseholdSettings(), getCurrentOrPlanningCycle()
    ]);
    if (!cycle) {
      content.innerHTML = buildNoCycleState(allUsers, settings);
      document.getElementById('create-cycle-btn')?.addEventListener('click', () => createNewCycle(allUsers, settings));
      return;
    }
    content.innerHTML = await buildCycleView(cycle, allUsers, settings);
    bindPlannerEvents(cycle, allUsers, settings);
  } catch(err) {
    console.error(err);
    content.innerHTML = `<div class="note note-warn"><span>⚠</span><div>Failed to load planner. Check your connection.</div></div>`;
  }
}

async function getCurrentOrPlanningCycle() {
  for (const status of ['planning','active']) {
    const q = query(collection(db,COLLECTIONS.CYCLES), where('status','==',status), orderBy('startDate','desc'), limit(1));
    const docs = (await getDocs(q)).docs;
    if (docs.length>0) return {id:docs[0].id,...docs[0].data()};
  }
  return null;
}

function buildNoCycleState(allUsers, settings) {
  return `
    <div class="planner-empty">
      <div style="font-size:48px;margin-bottom:16px;">📅</div>
      <div style="font-size:20px;font-weight:800;color:var(--text);margin-bottom:8px;">No active cycle</div>
      <div style="font-size:14px;color:var(--text-3);margin-bottom:24px;line-height:1.6;">
        Create a new 4-night cycle to start planning meals and build a shopping list.
      </div>
      <button class="btn-primary btn-full" id="create-cycle-btn">Create New Cycle →</button>
    </div>`;
}

async function createNewCycle(allUsers, settings) {
  const btn = document.getElementById('create-cycle-btn');
  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    const adults   = allUsers.filter(u=>u.role==='adult'&&u.isActive);
    const children = allUsers.filter(u=>u.role==='child'&&u.isActive);
    const turn     = settings?.night4TurnOrder || adults.map(u=>u.id);
    const idx      = settings?.night4CurrentIndex || 0;
    const adultPicker = turn[idx % turn.length];

    // Get last cycle number
    const q = query(collection(db,COLLECTIONS.CYCLES), orderBy('cycleNumber','desc'), limit(1));
    const last = (await getDocs(q)).docs;
    const nextNum = last.length>0 ? (last[0].data().cycleNumber||0)+1 : 1;

    const today = new Date();
    const nights = [...children, {id: adultPicker, role:'adult'}].map((u,i) => {
      const d = new Date(today); d.setDate(d.getDate()+i);
      return {
        nightNumber:    i+1,
        date:           d.toISOString().slice(0,10),
        pickOwnerId:    u.id,
        selectedMealId: null,
        mealTitle:      null,
        cookId:         null,
        isVetoProof:    false,
        isBirthdayNight:false
      };
    });

    const ref = await addDoc(collection(db,COLLECTIONS.CYCLES), {
      cycleNumber:     nextNum,
      startDate:       nights[0].date,
      endDate:         nights[nights.length-1].date,
      totalDays:       nights.length,
      plannedMealCount:nights.length,
      status:          'planning',
      nights,
      submissions:     {},
      vetoesUsed:      Object.fromEntries(allUsers.map(u=>[u.id,false])),
      vetoLog:         [],
      duplicateResolutionLog:[],
      shoppingListId:  null,
      createdAt:       serverTimestamp()
    });

    await loadPlanner();
  } catch(err) {
    console.error(err);
    btn.disabled=false; btn.textContent='Create New Cycle →';
  }
}

async function buildCycleView(cycle, allUsers, settings) {
  const nights = cycle.nights || [];
  const submissions = cycle.submissions || {};
  const vetoesUsed  = cycle.vetoesUsed  || {};

  const nightsHTML = await Promise.all(nights.map(async (night,i) => {
    const owner = allUsers.find(u=>u.id===night.pickOwnerId);
    const cook  = allUsers.find(u=>u.id===night.cookId);
    const ownerSubs = submissions[night.pickOwnerId] || [];
    const isChild   = owner?.role==='child';
    const veto      = vetoesUsed[currentUser?.id];

    let mealHTML = '';
    if (night.selectedMealId) {
      mealHTML = `<div class="planner-selected-meal">
        <span class="meal-title-pill">🍽️ ${night.mealTitle || 'Selected meal'}</span>
        <span class="cost-pill">${costSymbol(night.mealCost||1)}</span>
      </div>`;
    } else if (isChild && ownerSubs.length>0) {
      mealHTML = `<div class="planner-picks">
        ${ownerSubs.map((mId,ri) => `
          <div class="pick-row">
            <span class="pick-rank">${ri+1}</span>
            <span class="pick-name" data-meal="${mId}" data-night="${night.nightNumber}" data-rank="${ri}">Loading…</span>
            ${ri===0 && !veto ? `<button class="veto-btn" data-meal="${mId}" data-night="${night.nightNumber}" data-owner="${night.pickOwnerId}">Veto</button>` : ''}
          </div>`).join('')}
        <button class="btn-primary select-pick-btn" data-night="${night.nightNumber}" data-owner="${night.pickOwnerId}" style="margin-top:10px;padding:8px 14px;font-size:13px;">
          ✓ Lock In Pick #1
        </button>
      </div>`;
    } else if (!isChild) {
      mealHTML = `<button class="btn-outline select-adult-meal-btn" data-night="${night.nightNumber}" data-owner="${night.pickOwnerId}" style="font-size:13px;padding:8px 14px;">
        Choose from ${owner?.displayName}'s pool →
      </button>`;
    } else {
      mealHTML = `<div style="font-size:13px;color:var(--text-3);font-style:italic;">
        Waiting for ${owner?.displayName}'s picks…
        ${cycle.status==='planning' ? '<br><span style="font-size:11px;">Submission due by Day '+((settings?.submissionDeadlineDay)||5)+'</span>' : ''}
      </div>`;
    }

    const nightDate = night.date?.toDate ? night.date.toDate() : new Date(night.date+'T12:00:00');
    return `
      <div class="planner-night-card card">
        <div class="planner-night-hdr">
          <div class="planner-night-left">
            <div class="night-circle">${night.nightNumber}</div>
            <div>
              <div class="planner-night-date">${formatDate(nightDate,{weekday:'short',month:'short',day:'numeric'})}</div>
              <div class="planner-night-owner">
                <div class="mini-avatar" style="background:${avatarBg(owner?.displayName)}">${initials(owner?.displayName)}</div>
                ${owner?.displayName}'s pick
                ${night.isVetoProof ? '<span class="badge" style="background:#FFF3CD;color:#E67700;margin-left:4px;">👑 Veto-proof</span>':'' }
              </div>
            </div>
          </div>
          <div class="planner-cook-col">
            <div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">COOK</div>
            <select class="cook-select" data-night="${night.nightNumber}">
              <option value="">Assign…</option>
              ${allUsers.filter(u=>u.role==='adult').map(u=>`<option value="${u.id}" ${night.cookId===u.id?'selected':''}>${u.displayName}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="planner-meal-area">${mealHTML}</div>
      </div>`;
  }));

  const allFilled = nights.every(n=>n.selectedMealId);
  const hasShoppingList = !!cycle.shoppingListId;

  return `
    <div class="planner-header-row">
      <div>
        <div class="page-title">Cycle ${cycle.cycleNumber}</div>
        <div style="font-size:13px;color:var(--text-3);margin-top:2px;">
          ${formatDate(new Date((cycle.startDate?.toDate ? cycle.startDate.toDate() : new Date(cycle.startDate+'T12:00:00'))),{month:'short',day:'numeric'})}
          – ${formatDate(new Date((cycle.endDate?.toDate ? cycle.endDate.toDate() : new Date(cycle.endDate+'T12:00:00'))),{month:'short',day:'numeric'})}
          · ${cycle.status==='planning'?'Planning':'Active'}
        </div>
      </div>
      ${cycle.status==='planning' ? `
        <button class="btn-primary" id="finalize-btn" ${allFilled?'':'disabled'} style="padding:10px 16px;font-size:13px;">
          ${hasShoppingList ? '🛒 View List' : '✓ Finalize & Generate List'}
        </button>` : `
        <button class="btn-ghost" id="view-list-btn" style="padding:10px 16px;font-size:13px;">🛒 Shopping List</button>`
      }
    </div>

    ${!allFilled && cycle.status==='planning' ? `
      <div class="note note-info" style="margin-bottom:0;">
        <span>ℹ</span><div>Select a meal for every night to finalize this cycle and generate the shopping list.</div>
      </div>` : ''}

    ${nightsHTML.join('')}
  `;
}

function bindPlannerEvents(cycle, allUsers, settings) {
  // Cook assignment
  document.querySelectorAll('.cook-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const nightNum = parseInt(sel.dataset.night);
      const nights   = [...(cycle.nights||[])];
      const idx      = nights.findIndex(n=>n.nightNumber===nightNum);
      if (idx>=0) { nights[idx].cookId = sel.value || null; }
      await updateDoc(doc(db,COLLECTIONS.CYCLES,cycle.id),{nights});
      cycle.nights = nights;
    });
  });

  // Load meal names for child picks
  document.querySelectorAll('.pick-name[data-meal]').forEach(async el => {
    try {
      const meal = await getMeal(el.dataset.meal);
      el.textContent = meal?.title || 'Unknown meal';
    } catch { el.textContent = 'Unknown meal'; }
  });

  // Lock in pick #1
  document.querySelectorAll('.select-pick-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const nightNum = parseInt(btn.dataset.night);
      const ownerId  = btn.dataset.owner;
      const subs     = (cycle.submissions||{})[ownerId]||[];
      if (!subs[0]) return;
      await selectMealForNight(cycle, nightNum, subs[0]);
    });
  });

  // Adult meal selection
  document.querySelectorAll('.select-adult-meal-btn').forEach(btn => {
    btn.addEventListener('click', () => showAdultMealPicker(cycle, btn.dataset.night, btn.dataset.owner, allUsers));
  });

  // Veto
  document.querySelectorAll('.veto-btn').forEach(btn => {
    btn.addEventListener('click', () => handleVeto(cycle, btn.dataset.night, btn.dataset.meal, btn.dataset.owner, allUsers));
  });

  // Finalize
  document.getElementById('finalize-btn')?.addEventListener('click', async () => {
    if (cycle.shoppingListId) { navigate('/shopping'); return; }
    await finalizeCycle(cycle);
  });

  document.getElementById('view-list-btn')?.addEventListener('click', () => navigate('/shopping'));
}

async function selectMealForNight(cycle, nightNum, mealId) {
  try {
    const meal   = await getMeal(mealId);
    const nights = [...(cycle.nights||[])];
    const idx    = nights.findIndex(n=>n.nightNumber===nightNum);
    if (idx>=0) {
      nights[idx].selectedMealId = mealId;
      nights[idx].mealTitle      = meal?.title||'';
      nights[idx].mealCost       = meal?.cost||1;
    }
    await updateDoc(doc(db,COLLECTIONS.CYCLES,cycle.id),{nights});
    cycle.nights = nights;
    await loadPlanner();
  } catch(err) { console.error(err); }
}

async function showAdultMealPicker(cycle, nightNum, ownerId, allUsers) {
  const owner  = allUsers.find(u=>u.id===ownerId);
  const meals  = await getActiveMeals(ownerId);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <div style="padding:16px 20px 8px;font-size:16px;font-weight:800;color:var(--text);">
        ${owner?.displayName}'s Meals
      </div>
      <div id="adult-meal-list">
        ${meals.length===0 ? '<div style="padding:20px;color:var(--text-3);text-align:center;">No active meals yet.<br><a href="#" onclick="navigate(\'/meals\')">Add meals →</a></div>' :
          meals.map(m=>`
            <button class="menu-item adult-meal-pick" data-id="${m.id}" data-title="${m.title}" data-cost="${m.cost}" style="display:flex;justify-content:space-between;">
              <span>${m.title}</span>
              <span style="color:var(--success);font-weight:700;">${costSymbol(m.cost)}</span>
            </button>`).join('')}
      </div>
      <div style="padding:12px 16px;">
        <button class="btn-ghost btn-full" id="surprise-pick">🎲 Surprise Me</button>
      </div>
      <div style="height:max(16px,env(safe-area-inset-bottom));"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.remove(); });
  overlay.querySelectorAll('.adult-meal-pick').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      overlay.remove();
      await selectMealForNight(cycle, parseInt(nightNum), btn.dataset.id);
    });
  });
  document.getElementById('surprise-pick')?.addEventListener('click', async ()=>{
    const eligible = meals.filter(m=>m.status==='active');
    if (eligible.length===0) return;
    const pick = eligible[Math.floor(Math.random()*eligible.length)];
    overlay.remove();
    await selectMealForNight(cycle, parseInt(nightNum), pick.id);
  });
}

async function handleVeto(cycle, nightNum, mealId, ownerId, allUsers) {
  if (!confirm('Use your one veto this cycle to veto this meal?')) return;
  const vetoesUsed = {...(cycle.vetoesUsed||{})};
  vetoesUsed[currentUser.id] = true;
  const vetoLog = [...(cycle.vetoLog||[]), {
    vetoedBy: currentUser.id,
    targetUserId: ownerId,
    vetoedMealId: mealId,
    timestamp: new Date().toISOString()
  }];
  // Cascade to next pick
  const subs = (cycle.submissions||{})[ownerId]||[];
  const nextIdx = subs.indexOf(mealId)+1;
  const nights  = [...(cycle.nights||[])];
  const nightIdx = nights.findIndex(n=>n.nightNumber===parseInt(nightNum));
  if (nightIdx>=0 && nextIdx<subs.length) {
    const nextMeal = await getMeal(subs[nextIdx]);
    nights[nightIdx].selectedMealId = null;
    nights[nightIdx].mealTitle      = null;
  }
  await updateDoc(doc(db,COLLECTIONS.CYCLES,cycle.id),{vetoesUsed, vetoLog, nights});
  cycle.vetoesUsed = vetoesUsed;
  cycle.vetoLog    = vetoLog;
  cycle.nights     = nights;
  await loadPlanner();
}

async function finalizeCycle(cycle) {
  const btn = document.getElementById('finalize-btn');
  btn.disabled=true; btn.textContent='Generating list…';
  try {
    // Build shopping list from all selected meals
    const nights = cycle.nights||[];
    const mealIds = [...new Set(nights.map(n=>n.selectedMealId).filter(Boolean))];
    const meals = await Promise.all(mealIds.map(id=>getMeal(id)));
    const ingredientMap = {};
    meals.forEach(meal=>{
      if(!meal) return;
      (meal.ingredients||[]).forEach(ing=>{
        const key = ing.name.toLowerCase().trim();
        if (!ingredientMap[key]) {
          ingredientMap[key] = {ingredientName:ing.name, quantity:`${ing.quantity} ${ing.unit}`.trim(), sourceMealIds:[meal.id], quantityConflict:false, pantryStatus:'none', assignedStore:'kroger', storeOverridden:false, checkedOff:false, checkedBy:null, checkedAt:null, category:'Other', isManuallyAdded:false, krogerPrice:null, krogerSalePrice:null, aldiPrice:null};
        } else {
          ingredientMap[key].sourceMealIds.push(meal.id);
          ingredientMap[key].quantityConflict = true;
          ingredientMap[key].quantity += ` + ${ing.quantity} ${ing.unit}`.trim()+' (verify qty — used in 2 meals)';
        }
      });
    });

    const listRef = await addDoc(collection(db,COLLECTIONS.SHOPPING_LISTS),{
      cycleId: cycle.id,
      generatedAt: serverTimestamp(),
      status: 'active',
      items: Object.values(ingredientMap),
      suppressedItems: [],
      krogerSubtotal: null,
      aldiSubtotal: null,
      estimatedSavings: null,
      completedAt: null,
      completedBy: null
    });

    await updateDoc(doc(db,COLLECTIONS.CYCLES,cycle.id),{
      status: 'active',
      shoppingListId: listRef.id,
      finalizedAt: serverTimestamp()
    });

    // Update meal selection counts and cooldowns
    const { addMonths } = await import('../utils.js');
    await Promise.all(meals.filter(Boolean).map(meal=>{
      const updates = { totalSelections: (meal.totalSelections||0)+1, lastSelectedDate: new Date().toISOString().slice(0,10) };
      if (meal.cost===3) { updates.status='cooldown'; updates.cooldownUntil = addMonths(new Date(),4); }
      return updateDoc(doc(db,COLLECTIONS.MEALS,meal.id), updates);
    }));

    navigate('/shopping');
  } catch(err) {
    console.error(err);
    btn.disabled=false; btn.textContent='✓ Finalize & Generate List';
    alert('Failed to finalize cycle. Check console for details.');
  }
}

function buildTabBar() {
  return `<nav class="tab-bar">
    <button class="tab-item" data-route="/dashboard"><span class="tab-icon">🏠</span><span class="tab-label">Home</span></button>
    <button class="tab-item active" data-route="/planner"><span class="tab-icon">📅</span><span class="tab-label">Planner</span><div class="tab-dot"></div></button>
    <button class="tab-item" data-route="/meals"><span class="tab-icon">🍽️</span><span class="tab-label">Meals</span></button>
    <button class="tab-item" data-route="/shopping"><span class="tab-icon">🛒</span><span class="tab-label">Shopping</span></button>
    <button class="tab-item" data-route="/calendar"><span class="tab-icon">📆</span><span class="tab-label">Calendar</span></button>
  </nav>`;
}

function bindTabBar() {
  document.querySelectorAll('.tab-item[data-route]').forEach(btn=>{
    btn.addEventListener('click',()=>navigate(btn.dataset.route));
  });
}

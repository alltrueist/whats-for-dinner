// js/screens/planner.js — Cycle Planner (adults only)
import { currentUser } from '../state.js';
import { navigate } from '../router.js';
import { getAllUsers, getMeal, getActiveMeals, getHouseholdSettings } from '../db.js';
import { getCurrentCycle, loadAllCycles } from '../cycles.js';
import { formatDate, costSymbol, addMonths } from '../utils.js';
import {
  addDoc, updateDoc, doc, collection, serverTimestamp, getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from '../firebase.js';
import { COLLECTIONS } from '../config.js';

const AC={Owen:'#495057',Hanna:'#2B6940',Jack:'#1864AB',Otto:'#C1440E',Ella:'#6A0DAD'};
const ab=n=>AC[n]||'#868E96';
const ini=n=>n?n.slice(0,2).toUpperCase():'??';

export async function renderPlanner(params, container) {
  container.innerHTML=`
    <div class="screen" id="planner-screen">
      <div class="app-header">
        <div class="app-wordmark">What's for Dinner?</div>
        <div class="avatar" style="background:${ab(currentUser?.displayName)};color:#fff;">${ini(currentUser?.displayName)}</div>
      </div>
      <div class="screen-scroll"><div class="screen-content" id="planner-content">
        <div style="display:flex;justify-content:center;padding:40px;"><div class="spinner"></div></div>
      </div></div>
      ${buildTabBar()}
    </div>`;
  bindTabBar();
  await loadPlanner();
}

async function loadPlanner() {
  const content = document.getElementById('planner-content');
  if (!content) return;
  try {
    const [allUsers, settings, cycle] = await Promise.all([getAllUsers(), getHouseholdSettings(), getCurrentCycle()]);
    if (!cycle) { content.innerHTML = buildNoCycleState(); document.getElementById('create-cycle-btn')?.addEventListener('click',()=>createNewCycle(allUsers,settings)); return; }
    content.innerHTML = await buildCycleView(cycle, allUsers, settings);
    bindPlannerEvents(cycle, allUsers, settings);
  } catch(e) {
    console.error('[Planner]',e);
    content.innerHTML=`<div class="note note-warn"><span>⚠</span><div>Failed to load planner: ${e.message}</div></div>`;
  }
}

function buildNoCycleState() {
  return `
    <div class="planner-empty">
      <div style="font-size:48px;margin-bottom:16px;">📅</div>
      <div style="font-size:20px;font-weight:800;color:var(--text);margin-bottom:8px;">No active cycle</div>
      <div style="font-size:14px;color:var(--text-3);margin-bottom:24px;line-height:1.6;">Create a new cycle to plan meals and build a shopping list.</div>
      <button class="btn-primary btn-full" id="create-cycle-btn">Create New Cycle →</button>
    </div>`;
}

async function createNewCycle(allUsers, settings) {
  const btn = document.getElementById('create-cycle-btn');
  btn.disabled=true; btn.textContent='Creating…';
  try {
    const adults   = allUsers.filter(u=>u.role==='adult'&&u.isActive);
    const children = allUsers.filter(u=>u.role==='child'&&u.isActive);
    const turnOrder= settings?.night4TurnOrder||adults.map(u=>u.id);
    const adultPick= turnOrder[(settings?.night4CurrentIndex||0)%turnOrder.length];
    const allCycles= await loadAllCycles();
    const nextNum  = allCycles.length>0 ? Math.max(...allCycles.map(c=>c.cycleNumber||0))+1 : 1;
    const today    = new Date();
    const nights   = [...children, {id:adultPick,role:'adult'}].map((u,i)=>{
      const d=new Date(today); d.setDate(d.getDate()+i);
      return {nightNumber:i+1,date:d.toISOString().slice(0,10),pickOwnerId:u.id,selectedMealId:null,mealTitle:null,mealCost:null,cookId:null,isVetoProof:false,isBirthdayNight:false};
    });
    await addDoc(collection(db,COLLECTIONS.CYCLES),{
      cycleNumber:nextNum, startDate:nights[0].date, endDate:nights[nights.length-1].date,
      totalDays:nights.length, plannedMealCount:nights.length, status:'planning',
      nights, submissions:{}, vetoesUsed:Object.fromEntries(allUsers.map(u=>[u.id,false])),
      vetoLog:[], duplicateResolutionLog:[], shoppingListId:null, createdAt:serverTimestamp()
    });
    await loadPlanner();
  } catch(e) { console.error(e); btn.disabled=false; btn.textContent='Create New Cycle →'; alert('Failed to create cycle: '+e.message); }
}

async function buildCycleView(cycle, allUsers, settings) {
  const nights      = cycle.nights||[];
  const submissions = cycle.submissions||{};
  const vetoesUsed  = cycle.vetoesUsed||{};
  const myVetoUsed  = vetoesUsed[currentUser?.id];

  const nightsHTML = await Promise.all(nights.map(async night=>{
    const owner   = allUsers.find(u=>u.id===night.pickOwnerId);
    const isOwnerChild = owner?.role==='child';
    const subs    = submissions[night.pickOwnerId]||[];
    let mealHTML  = '';

    if (night.selectedMealId) {
      mealHTML=`<div class="planner-selected-meal"><span class="meal-title-pill">✓ ${night.mealTitle||'Selected'}</span><span class="cost-pill">${costSymbol(night.mealCost||1)}</span><button class="btn-ghost" style="font-size:12px;padding:4px 10px;" data-unselect="${night.nightNumber}">Change</button></div>`;
    } else if (isOwnerChild&&subs.length>0) {
      const pickRows = await Promise.all(subs.map(async(mId,ri)=>{
        let title='Loading…';
        try{ const m=await getMeal(mId); title=m?.title||'Unknown'; }catch{}
        return `<div class="pick-row">
          <span class="pick-rank">${ri+1}</span>
          <span style="font-size:13px;color:var(--text);flex:1;">${title}</span>
          ${ri===0&&!night.isVetoProof&&!myVetoUsed?`<button class="veto-btn" data-veto-night="${night.nightNumber}" data-veto-meal="${mId}" data-veto-owner="${night.pickOwnerId}">Veto</button>`:''}
        </div>`;
      }));
      mealHTML=`<div class="planner-picks">${pickRows.join('')}<button class="btn-primary" style="margin-top:10px;padding:8px 14px;font-size:13px;" data-select-pick="${night.nightNumber}" data-owner-id="${night.pickOwnerId}">✓ Lock In Pick #1</button></div>`;
    } else if (!isOwnerChild) {
      mealHTML=`<button class="btn-outline" style="font-size:13px;padding:8px 14px;" data-adult-pick="${night.nightNumber}" data-owner-id="${night.pickOwnerId}">Choose from ${owner?.displayName}'s pool →</button>`;
    } else {
      mealHTML=`<div style="font-size:13px;color:var(--text-3);font-style:italic;">Waiting for ${owner?.displayName}'s submission…</div>`;
    }

    const nd = night.date?.toDate ? night.date.toDate() : new Date((night.date||'')+'T12:00:00');
    return `
      <div class="planner-night-card card">
        <div class="planner-night-hdr">
          <div class="planner-night-left">
            <div class="night-circle">${night.nightNumber}</div>
            <div>
              <div class="planner-night-date">${formatDate(nd,{weekday:'short',month:'short',day:'numeric'})}</div>
              <div class="planner-night-owner">
                <div class="mini-avatar" style="background:${ab(owner?.displayName)};width:16px;height:16px;font-size:7px;">${ini(owner?.displayName)}</div>
                <span style="font-size:12px;color:var(--text-3);">${owner?.displayName}'s pick</span>
                ${night.isVetoProof?'<span class="badge" style="background:#FFF3CD;color:#E67700;margin-left:4px;">👑 Veto-proof</span>':''}
              </div>
            </div>
          </div>
          <select class="cook-select" data-night="${night.nightNumber}">
            <option value="">Cook: assign…</option>
            ${allUsers.filter(u=>u.role==='adult').map(u=>`<option value="${u.id}" ${night.cookId===u.id?'selected':''}>${u.displayName}</option>`).join('')}
          </select>
        </div>
        <div class="planner-meal-area">${mealHTML}</div>
      </div>`;
  }));

  const allFilled = nights.every(n=>n.selectedMealId);
  const nd0 = cycle.startDate?.toDate?cycle.startDate.toDate():new Date((cycle.startDate||'')+'T12:00:00');
  const nd1 = cycle.endDate?.toDate?cycle.endDate.toDate():new Date((cycle.endDate||'')+'T12:00:00');

  return `
    <div class="planner-header-row">
      <div>
        <div class="page-title">Cycle ${cycle.cycleNumber||'?'}</div>
        <div style="font-size:13px;color:var(--text-3);margin-top:2px;">${formatDate(nd0,{month:'short',day:'numeric'})} – ${formatDate(nd1,{month:'short',day:'numeric'})} · ${cycle.status==='planning'?'Planning':'Active'}</div>
      </div>
      ${cycle.status==='planning'?`
        <button class="btn-primary" id="finalize-btn" ${allFilled?'':'disabled'} style="padding:10px 16px;font-size:13px;">
          ${cycle.shoppingListId?'🛒 View List':'✓ Finalize Cycle'}
        </button>`:
        `<button class="btn-ghost" id="view-list-btn" style="padding:10px 16px;font-size:13px;">🛒 Shopping List</button>`}
    </div>
    ${!allFilled&&cycle.status==='planning'?`<div class="note note-info"><span>ℹ</span><div>Select a meal for each night, then finalize to generate the shopping list.</div></div>`:''}
    ${nightsHTML.join('')}`;
}

function bindPlannerEvents(cycle, allUsers, settings) {
  // Cook assignment
  document.querySelectorAll('.cook-select').forEach(sel=>{
    sel.addEventListener('change', async ()=>{
      const nights=[...(cycle.nights||[])];
      const idx=nights.findIndex(n=>n.nightNumber===parseInt(sel.dataset.night));
      if(idx>=0) nights[idx].cookId=sel.value||null;
      await updateDoc(doc(db,COLLECTIONS.CYCLES,cycle.id),{nights});
      cycle.nights=nights;
    });
  });

  // Lock in pick #1
  document.querySelectorAll('[data-select-pick]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const nightNum=parseInt(btn.dataset.selectPick);
      const subs=(cycle.submissions||{})[btn.dataset.ownerId]||[];
      if(subs[0]) await selectMeal(cycle, nightNum, subs[0]);
    });
  });

  // Unselect / change meal
  document.querySelectorAll('[data-unselect]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const nights=[...(cycle.nights||[])];
      const idx=nights.findIndex(n=>n.nightNumber===parseInt(btn.dataset.unselect));
      if(idx>=0){nights[idx].selectedMealId=null;nights[idx].mealTitle=null;nights[idx].mealCost=null;}
      await updateDoc(doc(db,COLLECTIONS.CYCLES,cycle.id),{nights});
      cycle.nights=nights;
      await loadPlanner();
    });
  });

  // Adult pool picker
  document.querySelectorAll('[data-adult-pick]').forEach(btn=>{
    btn.addEventListener('click',()=>showAdultPicker(cycle,btn.dataset.adultPick,btn.dataset.ownerId,allUsers));
  });

  // Veto
  document.querySelectorAll('[data-veto-night]').forEach(btn=>{
    btn.addEventListener('click',()=>handleVeto(cycle,btn.dataset.vetoNight,btn.dataset.vetoMeal,btn.dataset.vetoOwner,allUsers));
  });

  // Finalize
  document.getElementById('finalize-btn')?.addEventListener('click', async ()=>{
    if(cycle.shoppingListId){navigate('/shopping');return;}
    await finalizeCycle(cycle);
  });
  document.getElementById('view-list-btn')?.addEventListener('click',()=>navigate('/shopping'));
}

async function selectMeal(cycle, nightNum, mealId) {
  try {
    const meal=await getMeal(mealId);
    const nights=[...(cycle.nights||[])];
    const idx=nights.findIndex(n=>n.nightNumber===nightNum);
    if(idx>=0){nights[idx].selectedMealId=mealId;nights[idx].mealTitle=meal?.title||'';nights[idx].mealCost=meal?.cost||1;}
    await updateDoc(doc(db,COLLECTIONS.CYCLES,cycle.id),{nights});
    cycle.nights=nights;
    await loadPlanner();
  } catch(e){console.error(e);}
}

async function showAdultPicker(cycle, nightNum, ownerId, allUsers) {
  const owner=allUsers.find(u=>u.id===ownerId);
  const meals=await getActiveMeals(ownerId);
  const ov=document.createElement('div');
  ov.className='modal-overlay';
  ov.innerHTML=`
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <div style="padding:16px 20px 8px;font-size:16px;font-weight:800;">${owner?.displayName}'s Meals</div>
      ${meals.length===0?`<div style="padding:20px;text-align:center;color:var(--text-3);">No active meals yet.<br><button class="btn-text" onclick="navigate('/meals')">Add meals →</button></div>`:
        meals.map(m=>`<button class="menu-item" data-mid="${m.id}" style="display:flex;justify-content:space-between;">${m.title}<span style="color:var(--success);font-weight:700;">${costSymbol(m.cost)}</span></button>`).join('')}
      <div style="padding:10px 16px;">
        <button class="btn-ghost btn-full" id="surprise-adult">🎲 Surprise Me</button>
      </div>
      <div style="height:max(16px,env(safe-area-inset-bottom));"></div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
  ov.querySelectorAll('[data-mid]').forEach(btn=>{
    btn.addEventListener('click',async()=>{ov.remove();await selectMeal(cycle,parseInt(nightNum),btn.dataset.mid);});
  });
  document.getElementById('surprise-adult')?.addEventListener('click',async()=>{
    const eligible=meals.filter(m=>m.status==='active');
    if(!eligible.length)return;
    const pick=eligible[Math.floor(Math.random()*eligible.length)];
    ov.remove();
    await selectMeal(cycle,parseInt(nightNum),pick.id);
  });
}

async function handleVeto(cycle, nightNum, mealId, ownerId, allUsers) {
  if(!confirm('Use your one veto this cycle?')) return;
  const vetoesUsed={...(cycle.vetoesUsed||{})};
  vetoesUsed[currentUser.id]=true;
  const vetoLog=[...(cycle.vetoLog||[]),{vetoedBy:currentUser.id,targetUserId:ownerId,vetoedMealId:mealId,timestamp:new Date().toISOString()}];
  const nights=[...(cycle.nights||[])];
  const nIdx=nights.findIndex(n=>n.nightNumber===parseInt(nightNum));
  if(nIdx>=0){nights[nIdx].selectedMealId=null;nights[nIdx].mealTitle=null;}
  await updateDoc(doc(db,COLLECTIONS.CYCLES,cycle.id),{vetoesUsed,vetoLog,nights});
  cycle.vetoesUsed=vetoesUsed;cycle.vetoLog=vetoLog;cycle.nights=nights;
  await loadPlanner();
}

async function finalizeCycle(cycle) {
  const btn=document.getElementById('finalize-btn');
  btn.disabled=true;btn.textContent='Generating…';
  try {
    const nights=cycle.nights||[];
    const mealIds=[...new Set(nights.map(n=>n.selectedMealId).filter(Boolean))];
    const meals=await Promise.all(mealIds.map(id=>getMeal(id)));
    const ingMap={};
    meals.forEach(meal=>{
      if(!meal)return;
      (meal.ingredients||[]).forEach(ing=>{
        const k=ing.name.toLowerCase().trim();
        if(!ingMap[k]) ingMap[k]={ingredientName:ing.name,quantity:`${ing.quantity||''} ${ing.unit||''}`.trim(),sourceMealIds:[meal.id],quantityConflict:false,pantryStatus:'none',assignedStore:'kroger',storeOverridden:false,checkedOff:false,checkedBy:null,checkedAt:null,category:'Other',isManuallyAdded:false,krogerPrice:null,krogerSalePrice:null,aldiPrice:null};
        else{ingMap[k].sourceMealIds.push(meal.id);ingMap[k].quantityConflict=true;ingMap[k].quantity+=' + '+`${ing.quantity||''} ${ing.unit||''}`.trim()+' (2 meals — verify qty)';}
      });
    });
    const listRef=await addDoc(collection(db,COLLECTIONS.SHOPPING_LISTS),{
      cycleId:cycle.id,generatedAt:serverTimestamp(),status:'active',
      items:Object.values(ingMap),suppressedItems:[],
      krogerSubtotal:null,aldiSubtotal:null,estimatedSavings:null,
      completedAt:null,completedBy:null
    });
    await updateDoc(doc(db,COLLECTIONS.CYCLES,cycle.id),{status:'active',shoppingListId:listRef.id,finalizedAt:serverTimestamp()});
    await Promise.all(meals.filter(Boolean).map(meal=>{
      const u={totalSelections:(meal.totalSelections||0)+1,lastSelectedDate:new Date().toISOString().slice(0,10)};
      if(meal.cost===3){u.status='cooldown';u.cooldownUntil=addMonths(new Date(),4);}
      return updateDoc(doc(db,COLLECTIONS.MEALS,meal.id),u);
    }));
    navigate('/shopping');
  } catch(e){console.error(e);btn.disabled=false;btn.textContent='✓ Finalize Cycle';alert('Failed: '+e.message);}
}

function buildTabBar(){return`<nav class="tab-bar">
  <button class="tab-item" data-route="/dashboard"><span class="tab-icon">🏠</span><span class="tab-label">Home</span></button>
  <button class="tab-item active" data-route="/planner"><span class="tab-icon">📅</span><span class="tab-label">Planner</span><div class="tab-dot"></div></button>
  <button class="tab-item" data-route="/meals"><span class="tab-icon">🍽️</span><span class="tab-label">Meals</span></button>
  <button class="tab-item" data-route="/shopping"><span class="tab-icon">🛒</span><span class="tab-label">Shopping</span></button>
  <button class="tab-item" data-route="/calendar"><span class="tab-icon">📆</span><span class="tab-label">Calendar</span></button>
</nav>`;}
function bindTabBar(){document.querySelectorAll('.tab-item[data-route]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.route)));}

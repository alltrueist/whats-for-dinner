// js/screens/meals.js — Meal Library
import { currentUser, isAdult, isChild } from '../state.js';
import { navigate } from '../router.js';
import { getAllUsers, getAllMeals, createMeal, updateMeal, getMeal, addMealToUser, archiveMealForUser, restoreMealForUser, reactToMeal } from '../db.js';
import { costSymbol, formatDate } from '../utils.js';

const AC={Owen:'#495057',Hanna:'#2B6940',Jack:'#1864AB',Otto:'#C1440E',Ella:'#6A0DAD'};
const ab=n=>AC[n]||'#868E96';
const ini=n=>n?n.slice(0,2).toUpperCase():'??';
const EMOJIS=['🍝','🌮','🍕','🍔','🍗','🥩','🥗','🍜','🥪','🍱','🫕','🥘','🍲','🌯','🫔'];
const emoji=t=>{const h=[...t].reduce((a,c)=>a+c.charCodeAt(0),0);return EMOJIS[h%EMOJIS.length];};

let _meals=[];let _users=[];let _filterOwner='all';let _viewMode='card';let _filterStatus='active';

export async function renderMeals(params,container) {
  // Set default filter for kids
  if(isChild()) _filterOwner=currentUser.id;

  container.innerHTML=`
    <div class="screen" id="meals-screen">
      <div class="app-header">
        <div class="app-wordmark">What's for Dinner?</div>
        <div class="avatar" style="background:${ab(currentUser?.displayName)};color:#fff;">${ini(currentUser?.displayName)}</div>
      </div>
      <div id="meals-body" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div style="display:flex;justify-content:center;align-items:center;flex:1;"><div class="spinner"></div></div>
      </div>
      ${isAdult()?`<button class="fab-fixed" id="add-meal-fab" aria-label="Add meal">+</button>`:''}
    </div>`;

  try {
    [_meals, _users] = await Promise.all([getAllMeals(), getAllUsers()]);
    renderMealsBody();
    if(isAdult()) document.getElementById('add-meal-fab')?.addEventListener('click',()=>showMealForm(null));
  } catch(e) {
    console.error('[Meals]',e);
    document.getElementById('meals-body').innerHTML=`<div class="note note-warn" style="margin:20px;"><span>⚠</span><div>Failed to load meals: ${e.message}</div></div>`;
  }
}

function renderMealsBody() {
  const body=document.getElementById('meals-body');
  if(!body) return;
  const activeUsers=_users.filter(u=>u.isActive);
  const filtered=getFiltered();

  body.innerHTML=`
    <div class="person-tabs">
      ${isAdult()?`<button class="ptab ${_filterOwner==='all'?'active':''}" data-owner="all">All</button>`:''}
      ${activeUsers.map(u=>`<button class="ptab ${_filterOwner===u.id?'active':''}" data-owner="${u.id}">${u.displayName}</button>`).join('')}
    </div>
    <div class="sort-bar">
      <select class="sort-chip" id="status-filter">
        <option value="active" ${_filterStatus==='active'?'selected':''}>Active</option>
        <option value="all"    ${_filterStatus==='all'?'selected':''}>All</option>
        <option value="cooldown" ${_filterStatus==='cooldown'?'selected':''}>On Cooldown</option>
        <option value="archived" ${_filterStatus==='archived'?'selected':''}>Archived</option>
      </select>
      <div style="display:flex;gap:4px;">
        <button class="vt-btn ${_viewMode==='card'?'active':''}" id="view-card">⊞</button>
        <button class="vt-btn ${_viewMode==='list'?'active':''}" id="view-list">☰</button>
      </div>
    </div>
    <div class="screen-scroll">
      <div id="meal-grid" class="${_viewMode==='list'?'meal-list-container':'meal-grid-container'}">
        ${filtered.length===0 ? buildEmpty() : filtered.map(m=>buildCard(m)).join('')}
      </div>
    </div>
    ${buildTabBar()}`;

  bindEvents();
}

function getFiltered() {
  let m=_meals;
  if(_filterOwner!=='all') m=m.filter(x=>x.ownerId===_filterOwner);
  if(_filterStatus!=='all') m=m.filter(x=>x.status===_filterStatus);
  return m.sort((a,b)=>a.title.localeCompare(b.title));
}

function buildEmpty() {
  return `<div style="text-align:center;padding:48px 24px;">
    <div style="font-size:48px;margin-bottom:12px;">🍽️</div>
    <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:6px;">No meals here yet</div>
    <div style="font-size:13px;color:var(--text-3);">${isAdult()?'Tap the + button to add your first meal.':'Ask Owen or Mom to add meals to your pool.'}</div>
  </div>`;
}

function buildCard(meal) {
  const owner=_users.find(u=>u.id===meal.ownerId);
  const reacted=(meal.reactedBy||[]).includes(currentUser?.id);
  const dim=meal.status!=='active';
  const cd=meal.status==='cooldown'&&meal.cooldownUntil?`Available ${formatDate(new Date(meal.cooldownUntil+'T12:00:00'),{month:'short',day:'numeric',year:'numeric'})}`:null;

  if(_viewMode==='list') return `
    <div class="meal-list-row ${dim?'meal-faded':''}" data-meal="${meal.id}">
      <div style="font-size:22px;flex-shrink:0;">${emoji(meal.title)}</div>
      <div style="flex:1;min-width:0;">
        <div class="meal-list-name">${meal.title}</div>
        <div class="meal-list-meta">${owner?.displayName} · ${costSymbol(meal.cost)}${cd?` · ⏸ ${cd}`:''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        ${buildBadge(meal)}
        ${buildReact(meal,reacted)}
        ${isAdult()&&meal.ownerId===currentUser?.id?`<button class="icon-btn meal-edit-btn" data-meal="${meal.id}" style="font-size:13px;">✏️</button>`:''}
      </div>
    </div>`;

  return `
    <div class="meal-card-item ${dim?'meal-faded':''}" data-meal="${meal.id}">
      <div class="meal-card-img-area"><div style="font-size:32px;">${emoji(meal.title)}</div><div class="meal-card-badge">${buildBadge(meal)}</div></div>
      <div class="meal-card-info">
        <div class="meal-card-title">${meal.title}</div>
        <div class="meal-card-meta">
          <div class="mini-avatar" style="background:${ab(owner?.displayName)};width:16px;height:16px;font-size:7px;">${ini(owner?.displayName)}</div>
          <span style="font-size:11px;color:var(--text-3);">${owner?.displayName}</span>
          <span style="font-size:11px;font-weight:700;color:var(--success);">${costSymbol(meal.cost)}</span>
        </div>
        ${cd?`<div style="font-size:10px;color:var(--alert);margin-top:2px;">⏸ ${cd}</div>`:''}
        <div style="display:flex;align-items:center;gap:6px;margin-top:8px;">
          ${buildReact(meal,reacted)}
          ${isAdult()&&meal.ownerId===currentUser?.id?`<button class="icon-btn meal-edit-btn" data-meal="${meal.id}" style="font-size:12px;padding:3px 7px;border-radius:6px;">✏️ Edit</button>`:''}
        </div>
      </div>
    </div>`;
}

function buildBadge(m){
  if(m.status==='cooldown') return `<span class="badge badge-cooldown">Cooldown</span>`;
  if(m.status==='archived') return `<span class="badge badge-archived">Archived</span>`;
  return `<span class="badge badge-active">Active</span>`;
}
function buildReact(m,reacted){
  return `<button class="react-btn ${reacted?'reacted':''}" data-meal="${m.id}" ${reacted?'disabled':''}>${reacted?'❤️':'🤍'} ${m.reactionCount||0}</button>`;
}

function bindEvents() {
  document.querySelectorAll('.ptab').forEach(t=>t.addEventListener('click',()=>{_filterOwner=t.dataset.owner;renderMealsBody();}));
  document.getElementById('status-filter')?.addEventListener('change',e=>{_filterStatus=e.target.value;renderMealsBody();});
  document.getElementById('view-card')?.addEventListener('click',()=>{_viewMode='card';renderMealsBody();});
  document.getElementById('view-list')?.addEventListener('click',()=>{_viewMode='list';renderMealsBody();});

  document.querySelectorAll('.react-btn:not([disabled])').forEach(btn=>{
    btn.addEventListener('click',async e=>{
      e.stopPropagation();
      await reactToMeal(btn.dataset.meal,currentUser.id);
      const idx=_meals.findIndex(m=>m.id===btn.dataset.meal);
      if(idx>=0){_meals[idx].reactionCount=(_meals[idx].reactionCount||0)+1;(_meals[idx].reactedBy=_meals[idx].reactedBy||[]).push(currentUser.id);}
      renderMealsBody();
    });
  });

  document.querySelectorAll('.meal-edit-btn').forEach(btn=>{
    btn.addEventListener('click',e=>{e.stopPropagation();showMealForm(_meals.find(m=>m.id===btn.dataset.meal));});
  });

  document.querySelectorAll('[data-meal]').forEach(el=>{
    el.addEventListener('click',e=>{
      if(e.target.closest('button')) return;
      showDetail(_meals.find(m=>m.id===el.dataset.meal));
    });
  });

  bindTabBar();
}

// ─── Meal Detail ────────────────────────────────────────────────────────────

function showDetail(meal) {
  if(!meal) return;
  const owner=_users.find(u=>u.id===meal.ownerId);
  const ov=document.createElement('div');
  ov.className='modal-overlay';
  ov.innerHTML=`
    <div class="bottom-sheet" style="padding-bottom:max(20px,env(safe-area-inset-bottom));">
      <div class="sheet-handle"></div>
      <div style="padding:16px 20px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
          <div>
            <div style="font-size:20px;font-weight:800;color:var(--text);letter-spacing:-0.3px;">${meal.title}</div>
            <div style="font-size:13px;color:var(--text-3);margin-top:3px;">${owner?.displayName} · ${costSymbol(meal.cost)}</div>
          </div>
          <div style="font-size:36px;">${emoji(meal.title)}</div>
        </div>
        ${meal.status==='cooldown'&&meal.cooldownUntil?`<div class="note note-warn" style="margin-bottom:12px;"><span>⏸</span><div>On cooldown until ${formatDate(new Date(meal.cooldownUntil+'T12:00:00'),{month:'long',day:'numeric',year:'numeric'})}</div></div>`:''}
        ${meal.recipeUrl?`<a class="btn-outline btn-full" href="${meal.recipeUrl}" target="_blank" rel="noopener" style="display:flex;margin-bottom:12px;">🔗 View Recipe</a>`:''}
        ${(meal.ingredients||[]).length>0?`
          <div style="margin-bottom:12px;">
            <div class="section-label" style="margin-bottom:6px;">Ingredients</div>
            <div class="card">${meal.ingredients.map(i=>`<div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--surface-2);">
              <span style="font-size:13px;">${i.name}</span><span style="font-size:13px;color:var(--text-3);">${i.quantity||''} ${i.unit||''}</span>
            </div>`).join('')}</div>
          </div>`:''}
        ${Object.keys(meal.personNotes||{}).length>0?`
          <div style="margin-bottom:12px;">
            <div class="section-label" style="margin-bottom:6px;">Notes</div>
            ${Object.entries(meal.personNotes).map(([uid,note])=>{const u=_users.find(x=>x.id===uid);return `<div style="font-size:13px;padding:3px 0;"><strong>${u?.displayName||uid}:</strong> ${note}</div>`;}).join('')}
          </div>`:''}
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button class="btn-ghost" style="flex:1;" id="close-detail">Close</button>
          ${isAdult()&&meal.ownerId===currentUser?.id?`<button class="btn-primary" style="flex:1;" id="edit-detail">Edit Meal</button>`:''}
        </div>
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
  document.getElementById('close-detail')?.addEventListener('click',()=>ov.remove());
  document.getElementById('edit-detail')?.addEventListener('click',()=>{ov.remove();showMealForm(meal);});
}

// ─── Add/Edit Form ──────────────────────────────────────────────────────────

function showMealForm(existing=null) {
  const isEdit=!!existing;
  const activeUsers=_users.filter(u=>u.isActive);
  const ov=document.createElement('div');
  ov.className='modal-overlay';
  ov.innerHTML=`
    <div class="bottom-sheet" style="max-height:95dvh;">
      <div class="sheet-handle"></div>
      <div style="padding:12px 20px 6px;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:17px;font-weight:800;">${isEdit?'Edit Meal':'Add Meal'}</div>
        <button style="font-size:20px;color:var(--text-3);background:none;border:none;cursor:pointer;" id="close-meal-form">✕</button>
      </div>
      <form id="meal-form" style="padding:0 20px 80px;display:flex;flex-direction:column;gap:14px;overflow-y:auto;max-height:80dvh;" novalidate>

        <div class="form-group">
          <label class="form-label">Meal Name *</label>
          <input class="form-input" id="f-title" type="text" value="${existing?.title||''}" placeholder="e.g. Homemade Mac & Cheese" required />
        </div>

        <div class="form-group">
          <label class="form-label">Owner *</label>
          <select class="form-input" id="f-owner">
            ${activeUsers.map(u=>`<option value="${u.id}" ${(existing?.ownerId||currentUser?.id)===u.id?'selected':''}>${u.displayName}</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Cost</label>
          <div style="display:flex;gap:8px;" id="cost-pills">
            ${[1,2,3].map(c=>`<button type="button" class="cost-pill-btn" data-cost="${c}"
              style="flex:1;padding:10px 0;border-radius:var(--radius-sm);font-weight:700;font-size:14px;cursor:pointer;border:1.5px solid ${(existing?.cost||1)===c?'var(--primary)':'var(--border)'};background:${(existing?.cost||1)===c?'var(--primary)':'var(--surface)'};color:${(existing?.cost||1)===c?'#fff':'var(--text-3)'};">
              ${'$'.repeat(c)}<div style="font-size:10px;opacity:0.7;">${['Cheap','Average','Expensive'][c-1]}</div>
            </button>`).join('')}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Recipe URL (optional)</label>
          <div style="display:flex;gap:8px;">
            <input class="form-input" id="f-url" type="url" placeholder="https://…" value="${existing?.recipeUrl||''}" style="flex:1;" />
            <button type="button" class="btn-primary" id="import-btn" style="padding:11px 14px;font-size:13px;white-space:nowrap;">⬇ Import</button>
          </div>
          <div id="import-status" style="font-size:12px;color:var(--text-3);margin-top:4px;"></div>
        </div>

        <div class="form-group">
          <label class="form-label">Ingredients</label>
          <div id="ing-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:6px;">
            ${(existing?.ingredients||[]).map(ingRow).join('')}
          </div>
          <button type="button" class="btn-ghost" id="add-ing" style="font-size:13px;padding:8px;">+ Add Ingredient</button>
        </div>

        <div class="form-group">
          <label class="form-label">Notes per Person</label>
          ${activeUsers.map(u=>`
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <div class="mini-avatar" style="background:${ab(u.displayName)};width:26px;height:26px;font-size:9px;flex-shrink:0;">${ini(u.displayName)}</div>
              <input class="form-input" data-uid="${u.id}" placeholder="${u.displayName} — any notes?" value="${existing?.personNotes?.[u.id]||''}" style="flex:1;font-size:14px;padding:8px 10px;" />
            </div>`).join('')}
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--surface-2);border-radius:var(--radius-sm);">
          <div><div style="font-size:14px;font-weight:600;">Good leftovers</div><div style="font-size:11px;color:var(--text-3);">Plan accordingly next day</div></div>
          <label class="toggle"><input type="checkbox" id="f-leftovers" ${existing?.hasLeftovers?'checked':''} /><div class="toggle-track"></div><div class="toggle-thumb"></div></label>
        </div>

        <div id="f-error" class="form-error hidden"></div>

        <div style="display:flex;gap:8px;">
          <button type="submit" class="btn-primary" style="flex:1.5;" id="save-btn">${isEdit?'Save Changes':'Save Meal'}</button>
          ${!isEdit?`<button type="button" class="btn-ghost" style="flex:1;" id="save-add-btn">Save & Add Another</button>`:''}
        </div>
        ${isEdit&&existing.status!=='archived'?`<button type="button" class="btn-ghost btn-full" id="archive-btn" style="color:var(--alert);border-color:var(--alert);">Archive This Meal</button>`:''}
        ${isEdit&&existing.status==='archived'?`<button type="button" class="btn-ghost btn-full" id="restore-btn">Restore to Active</button>`:''}
      </form>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
  document.getElementById('close-meal-form')?.addEventListener('click',()=>ov.remove());

  let selectedCost=existing?.cost||1;
  ov.querySelectorAll('.cost-pill-btn').forEach(b=>{
    b.addEventListener('click',()=>{
      selectedCost=parseInt(b.dataset.cost);
      ov.querySelectorAll('.cost-pill-btn').forEach(x=>{
        const sel=x.dataset.cost==selectedCost;
        x.style.background=sel?'var(--primary)':'var(--surface)';
        x.style.color=sel?'#fff':'var(--text-3)';
        x.style.borderColor=sel?'var(--primary)':'var(--border)';
      });
    });
  });

  let ingIdx=(existing?.ingredients||[]).length;
  document.getElementById('add-ing')?.addEventListener('click',()=>{
    const list=document.getElementById('ing-list');
    const el=document.createElement('div');
    el.innerHTML=ingRow({name:'',quantity:'',unit:''},ingIdx++);
    list.appendChild(el.firstElementChild);
    bindDelBtns();
  });
  bindDelBtns();

  document.getElementById('import-btn')?.addEventListener('click',async()=>{
    const url=document.getElementById('f-url').value.trim();
    const st=document.getElementById('import-status');
    if(!url){st.textContent='Enter a URL first.';return;}
    st.textContent='Importing…';st.style.color='var(--text-3)';
    try{
      const ings=await importRecipe(url);
      if(!ings.length){st.textContent='No ingredients found — enter manually.';return;}
      document.getElementById('ing-list').innerHTML=ings.map(ingRow).join('');
      ingIdx=ings.length;bindDelBtns();
      st.textContent=`✓ ${ings.length} ingredients imported`;st.style.color='var(--success)';
    }catch{st.textContent='Import failed — enter manually.';}
  });

  document.getElementById('archive-btn')?.addEventListener('click',async()=>{
    if(!confirm('Archive this meal?'))return;
    await updateMeal(existing.id,{status:'archived'});
    await archiveMealForUser(existing.ownerId,existing.id);
    _meals=await getAllMeals();ov.remove();renderMealsBody();
  });
  document.getElementById('restore-btn')?.addEventListener('click',async()=>{
    const owner=_users.find(u=>u.id===existing.ownerId);
    if((owner?.activeMealIds||[]).length>=10){alert('Max 10 active meals — archive one first.');return;}
    await updateMeal(existing.id,{status:'active'});
    await restoreMealForUser(existing.ownerId,existing.id);
    _meals=await getAllMeals();ov.remove();renderMealsBody();
  });

  const doSave=async(addAnother)=>{
    const errEl=document.getElementById('f-error');errEl.classList.add('hidden');
    const title=document.getElementById('f-title').value.trim();
    const ownerId=document.getElementById('f-owner').value;
    if(!title){errEl.textContent='Name is required.';errEl.classList.remove('hidden');return;}
    const ings=[];
    document.querySelectorAll('.ing-row-item').forEach(row=>{
      const n=row.querySelector('.ing-name-in')?.value?.trim();
      const q=row.querySelector('.ing-qty-in')?.value?.trim();
      const u=row.querySelector('.ing-unit-in')?.value?.trim();
      if(n)ings.push({name:n,quantity:q||'',unit:u||''});
    });
    const notes={};
    ov.querySelectorAll('input[data-uid]').forEach(i=>{if(i.value.trim())notes[i.dataset.uid]=i.value.trim();});
    const data={title,ownerId,cost:selectedCost,recipeUrl:document.getElementById('f-url').value.trim()||null,ingredients:ings,personNotes:notes,hasLeftovers:document.getElementById('f-leftovers').checked,ingredientsImported:false};
    const btn=document.getElementById('save-btn');btn.disabled=true;btn.textContent='Saving…';
    try{
      if(isEdit){await updateMeal(existing.id,data);const i=_meals.findIndex(m=>m.id===existing.id);if(i>=0)_meals[i]={..._meals[i],...data};}
      else{const id=await createMeal(data);await addMealToUser(ownerId,id);_meals=await getAllMeals();}
      if(addAnother){
        btn.disabled=false;btn.textContent='Save Meal';
        document.getElementById('f-title').value='';
        document.getElementById('f-url').value='';
        document.getElementById('ing-list').innerHTML='';
        ov.querySelectorAll('input[data-uid]').forEach(i=>i.value='');
        document.getElementById('f-leftovers').checked=false;
        document.getElementById('import-status').textContent='';
        ingIdx=0;
      } else ov.remove();
      renderMealsBody();
    }catch(e){btn.disabled=false;btn.textContent=isEdit?'Save Changes':'Save Meal';errEl.textContent='Failed to save: '+e.message;errEl.classList.remove('hidden');}
  };

  ov.querySelector('#meal-form')?.addEventListener('submit',e=>{e.preventDefault();doSave(false);});
  document.getElementById('save-add-btn')?.addEventListener('click',()=>doSave(true));

  function bindDelBtns(){document.querySelectorAll('.ing-del-btn').forEach(b=>{b.onclick=()=>b.closest('.ing-row-item')?.remove();});}
}

function ingRow(ing,i){
  return `<div class="ing-row-item" style="display:flex;gap:6px;align-items:center;">
    <input class="form-input ing-qty-in" type="text" placeholder="Qty" value="${ing.quantity||''}" style="width:60px;flex-shrink:0;padding:8px;font-size:14px;" />
    <input class="form-input ing-unit-in" type="text" placeholder="Unit" value="${ing.unit||''}" style="width:70px;flex-shrink:0;padding:8px;font-size:14px;" />
    <input class="form-input ing-name-in" type="text" placeholder="Name" value="${ing.name||''}" style="flex:1;padding:8px;font-size:14px;" />
    <button type="button" class="ing-del-btn" style="color:var(--alert);font-size:18px;background:none;border:none;cursor:pointer;flex-shrink:0;">✕</button>
  </div>`;
}

async function importRecipe(url) {
  const proxy=`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const resp=await fetch(proxy);const html=await resp.text();
  const dom=new DOMParser().parseFromString(html,'text/html');
  for(const s of dom.querySelectorAll('script[type="application/ld+json"]')){
    try{
      const data=JSON.parse(s.textContent);
      const r=Array.isArray(data)?data.find(d=>d['@type']==='Recipe'):data['@type']==='Recipe'?data:null;
      if(r?.recipeIngredient) return r.recipeIngredient.map(parseIng);
    }catch{}
  }
  return [];
}

function parseIng(str){
  const m=str.match(/^([\d./\s¼½¾⅓⅔⅛]+)?\s*(cup|cups|tbsp|tsp|oz|ounce|lb|lbs|pound|g|gram|ml|clove|cloves|can|cans|slice|piece|bunch|head|packet)s?\s+(.+)$/i);
  if(m)return{quantity:m[1]?.trim()||'',unit:m[2]?.trim()||'',name:m[3]?.trim()||str};
  return{quantity:'',unit:'',name:str};
}

function buildTabBar(){
  if(isAdult())return`<nav class="tab-bar">
    <button class="tab-item" data-route="/dashboard"><span class="tab-icon">🏠</span><span class="tab-label">Home</span></button>
    <button class="tab-item" data-route="/planner"><span class="tab-icon">📅</span><span class="tab-label">Planner</span></button>
    <button class="tab-item active" data-route="/meals"><span class="tab-icon">🍽️</span><span class="tab-label">Meals</span><div class="tab-dot"></div></button>
    <button class="tab-item" data-route="/shopping"><span class="tab-icon">🛒</span><span class="tab-label">Shopping</span></button>
    <button class="tab-item" data-route="/calendar"><span class="tab-icon">📆</span><span class="tab-label">Calendar</span></button>
  </nav>`;
  return`<nav class="tab-bar">
    <button class="tab-item" data-route="/dashboard"><span class="tab-icon">🏠</span><span class="tab-label">Home</span></button>
    <button class="tab-item active" data-route="/meals"><span class="tab-icon">🍽️</span><span class="tab-label">My Meals</span><div class="tab-dot"></div></button>
    <button class="tab-item" data-route="/calendar"><span class="tab-icon">📆</span><span class="tab-label">Calendar</span></button>
    <button class="tab-item" data-route="/analytics"><span class="tab-icon">📊</span><span class="tab-label">Stats</span></button>
  </nav>`;}
function bindTabBar(){document.querySelectorAll('.tab-item[data-route]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.route)));}

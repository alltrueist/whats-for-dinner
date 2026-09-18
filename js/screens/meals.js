// js/screens/meals.js — Meal Library (all users)
import { currentUser, isAdult, isChild } from '../state.js';
import { navigate } from '../router.js';
import { getAllUsers, getAllMeals, createMeal, updateMeal, getMeal, addMealToUser, archiveMealForUser, restoreMealForUser, reactToMeal } from '../db.js';
import { costSymbol, formatDate } from '../utils.js';

const AVATAR_COLORS = { Owen:'#495057', Hanna:'#2B6940', Jack:'#1864AB', Otto:'#C1440E', Ella:'#6A0DAD' };
function avatarBg(n){ return AVATAR_COLORS[n]||'#868E96'; }
function initials(n){ return n?n.slice(0,2).toUpperCase():'??'; }

const MEAL_EMOJIS = ['🍝','🌮','🍕','🍔','🍗','🥩','🥗','🍜','🥪','🍱','🫕','🥘','🍲','🌯','🫔'];
function mealEmoji(title='') {
  const h = [...title].reduce((a,c)=>a+c.charCodeAt(0),0);
  return MEAL_EMOJIS[h % MEAL_EMOJIS.length];
}

let _allMeals = [];
let _allUsers = [];
let _filterOwner = 'all';
let _viewMode = 'card'; // 'card' or 'list'
let _filterStatus = 'active';

export async function renderMeals(params, container) {
  container.innerHTML = `
    <div class="screen" id="meals-screen">
      <div class="app-header">
        <div class="app-wordmark">What's for Dinner?</div>
        <div class="avatar" style="background:${avatarBg(currentUser?.displayName)};color:#fff;">${initials(currentUser?.displayName)}</div>
      </div>
      <div id="meals-body" style="display:flex;flex-direction:column;flex:1;overflow:hidden;">
        <div style="display:flex;justify-content:center;align-items:center;flex:1;"><div class="spinner"></div></div>
      </div>
    </div>`;

  try {
    [_allMeals, _allUsers] = await Promise.all([getAllMeals(), getAllUsers()]);
    // For kids, default filter to own meals
    if (isChild()) _filterOwner = currentUser.id;
    renderMealsBody();
  } catch(err) {
    console.error(err);
    document.getElementById('meals-body').innerHTML = `<div class="note note-warn" style="margin:20px;"><span>⚠</span><div>Failed to load meals.</div></div>`;
  }
}

function renderMealsBody() {
  const body = document.getElementById('meals-body');
  if (!body) return;

  const activeUsers = _allUsers.filter(u=>u.isActive);
  const filtered = getFilteredMeals();

  body.innerHTML = `
    <!-- Person filter tabs -->
    <div class="person-tabs" id="person-tabs">
      ${isAdult() ? `<button class="ptab ${_filterOwner==='all'?'active':''}" data-owner="all">All</button>` : ''}
      ${activeUsers.map(u=>`
        <button class="ptab ${_filterOwner===u.id?'active':''}" data-owner="${u.id}">${u.displayName}</button>
      `).join('')}
    </div>

    <!-- Sort/filter/view bar -->
    <div class="sort-bar">
      <div style="display:flex;gap:6px;">
        <select class="sort-chip" id="status-filter">
          <option value="active" ${_filterStatus==='active'?'selected':''}>Active</option>
          <option value="all"    ${_filterStatus==='all'?'selected':''}>All</option>
          <option value="cooldown" ${_filterStatus==='cooldown'?'selected':''}>Cooldown</option>
          <option value="archived" ${_filterStatus==='archived'?'selected':''}>Archived</option>
        </select>
      </div>
      <div style="display:flex;gap:4px;">
        <button class="vt-btn ${_viewMode==='card'?'active':''}" id="view-card">⊞</button>
        <button class="vt-btn ${_viewMode==='list'?'active':''}" id="view-list">☰</button>
      </div>
    </div>

    <!-- Meal grid/list -->
    <div class="screen-scroll">
      <div id="meal-grid" class="meal-grid-container ${_viewMode==='list'?'meal-list-mode':''}">
        ${filtered.length===0 ? buildEmptyState() : filtered.map(m=>buildMealCard(m)).join('')}
      </div>
      ${isAdult() ? `<div style="display:flex;justify-content:flex-end;padding:0 16px 16px;">
        <button class="fab-btn" id="add-meal-btn">+</button>
      </div>` : ''}
    </div>

    ${buildTabBar()}
  `;

  bindMealsEvents();
}

function getFilteredMeals() {
  let meals = _allMeals;
  if (_filterOwner!=='all') meals = meals.filter(m=>m.ownerId===_filterOwner);
  if (_filterStatus!=='all') meals = meals.filter(m=>m.status===_filterStatus);
  return meals.sort((a,b)=>a.title.localeCompare(b.title));
}

function buildEmptyState() {
  return `<div style="text-align:center;padding:48px 24px;">
    <div style="font-size:48px;margin-bottom:12px;">🍽️</div>
    <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:6px;">No meals here yet</div>
    <div style="font-size:13px;color:var(--text-3);">
      ${isAdult() ? 'Tap + to add your first meal.' : 'Ask Owen or Mom to add meals to your pool.'}
    </div>
  </div>`;
}

function buildMealCard(meal) {
  const owner    = _allUsers.find(u=>u.id===meal.ownerId);
  const reacted  = (meal.reactedBy||[]).includes(currentUser?.id);
  const isMine   = meal.ownerId === currentUser?.id;
  const isCooldown = meal.status==='cooldown';
  const coolStr  = meal.cooldownUntil ? `Available ${formatDate(new Date(meal.cooldownUntil+'T12:00:00'),{month:'short',day:'numeric',year:'numeric'})}` : '';

  if (_viewMode==='list') {
    return `
      <div class="meal-list-row ${isCooldown?'meal-faded':''}" data-meal="${meal.id}">
        <div class="meal-list-emoji">${mealEmoji(meal.title)}</div>
        <div class="meal-list-info">
          <div class="meal-list-name">${meal.title}</div>
          <div class="meal-list-meta">${owner?.displayName} · ${costSymbol(meal.cost)} ${isCooldown?'· ⏸ '+coolStr:''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          ${buildStatusBadge(meal)}
          ${buildReactBtn(meal, reacted)}
          ${isAdult()&&isMine ? `<button class="icon-btn meal-edit-btn" data-meal="${meal.id}" style="font-size:14px;">✏️</button>` : ''}
        </div>
      </div>`;
  }

  return `
    <div class="meal-card-item ${isCooldown?'meal-faded':''}" data-meal="${meal.id}">
      <div class="meal-card-img-area" style="${isCooldown?'filter:grayscale(0.5);':''}">
        <div class="meal-emoji-large">${mealEmoji(meal.title)}</div>
        <div class="meal-card-badge">${buildStatusBadge(meal)}</div>
      </div>
      <div class="meal-card-info">
        <div class="meal-card-title">${meal.title}</div>
        <div class="meal-card-meta">
          <div class="mini-avatar" style="background:${avatarBg(owner?.displayName)};width:16px;height:16px;font-size:7px;">${initials(owner?.displayName)}</div>
          <span style="font-size:11px;color:var(--text-3);">${owner?.displayName}</span>
          <span style="font-size:11px;font-weight:700;color:var(--success);">${costSymbol(meal.cost)}</span>
        </div>
        ${isCooldown ? `<div style="font-size:10px;color:var(--alert);margin-top:2px;">⏸ ${coolStr}</div>` : ''}
        <div style="display:flex;align-items:center;gap:6px;margin-top:8px;">
          ${buildReactBtn(meal,reacted)}
          ${isAdult()&&isMine ? `<button class="icon-btn meal-edit-btn" data-meal="${meal.id}" style="font-size:13px;padding:4px 8px;border-radius:6px;">✏️ Edit</button>` : ''}
        </div>
      </div>
    </div>`;
}

function buildStatusBadge(meal) {
  if (meal.status==='cooldown') return `<span class="badge badge-cooldown">Cooldown</span>`;
  if (meal.status==='archived') return `<span class="badge badge-archived">Archived</span>`;
  return `<span class="badge badge-active">Active</span>`;
}

function buildReactBtn(meal, reacted) {
  return `<button class="react-btn ${reacted?'reacted':''}" data-meal="${meal.id}" ${reacted?'disabled':''}>
    ${reacted?'❤️':'🤍'} ${meal.reactionCount||0}
  </button>`;
}

function bindMealsEvents() {
  // Person filter tabs
  document.querySelectorAll('.ptab').forEach(tab=>{
    tab.addEventListener('click',()=>{ _filterOwner=tab.dataset.owner; renderMealsBody(); });
  });

  // Status filter
  document.getElementById('status-filter')?.addEventListener('change', e=>{
    _filterStatus=e.target.value; renderMealsBody();
  });

  // View toggle
  document.getElementById('view-card')?.addEventListener('click',()=>{ _viewMode='card'; renderMealsBody(); });
  document.getElementById('view-list')?.addEventListener('click',()=>{ _viewMode='list'; renderMealsBody(); });

  // Reactions
  document.querySelectorAll('.react-btn:not([disabled])').forEach(btn=>{
    btn.addEventListener('click', async e=>{
      e.stopPropagation();
      if (!currentUser) return;
      await reactToMeal(btn.dataset.meal, currentUser.id);
      const idx = _allMeals.findIndex(m=>m.id===btn.dataset.meal);
      if (idx>=0) { _allMeals[idx].reactionCount=(_allMeals[idx].reactionCount||0)+1; (_allMeals[idx].reactedBy||[]).push(currentUser.id); }
      renderMealsBody();
    });
  });

  // Edit buttons
  document.querySelectorAll('.meal-edit-btn').forEach(btn=>{
    btn.addEventListener('click', e=>{ e.stopPropagation(); showMealForm(_allMeals.find(m=>m.id===btn.dataset.meal)); });
  });

  // Card clicks → meal detail
  document.querySelectorAll('.meal-card-item[data-meal], .meal-list-row[data-meal]').forEach(el=>{
    el.addEventListener('click', e=>{
      if (e.target.closest('button')) return;
      showMealDetail(_allMeals.find(m=>m.id===el.dataset.meal));
    });
  });

  // Add meal
  document.getElementById('add-meal-btn')?.addEventListener('click',()=>showMealForm(null));

  bindTabBar();
}

// ─── Meal Detail Sheet ──────────────────────────────────────────────────────

function showMealDetail(meal) {
  if (!meal) return;
  const owner = _allUsers.find(u=>u.id===meal.ownerId);
  const overlay = document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`
    <div class="bottom-sheet" style="padding:0 0 max(16px,env(safe-area-inset-bottom));">
      <div class="sheet-handle"></div>
      <div style="padding:16px 20px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
          <div>
            <div style="font-size:22px;font-weight:800;color:var(--text);letter-spacing:-0.3px;">${meal.title}</div>
            <div style="font-size:13px;color:var(--text-3);margin-top:3px;">${owner?.displayName} · ${costSymbol(meal.cost)} · ${meal.status}</div>
          </div>
          <div style="font-size:36px;">${mealEmoji(meal.title)}</div>
        </div>

        ${meal.status==='cooldown'&&meal.cooldownUntil ? `
          <div class="note note-warn" style="margin-bottom:12px;">
            <span>⏸</span><div>On cooldown — available ${formatDate(new Date(meal.cooldownUntil+'T12:00:00'),{month:'long',day:'numeric',year:'numeric'})}</div>
          </div>` : ''}

        ${meal.recipeUrl ? `<a class="btn-outline btn-full" href="${meal.recipeUrl}" target="_blank" rel="noopener" style="display:flex;margin-bottom:12px;">🔗 View Recipe</a>` : ''}

        ${(meal.ingredients||[]).length>0 ? `
          <div style="margin-bottom:12px;">
            <div class="section-label" style="margin-bottom:6px;">Ingredients</div>
            <div class="card">
              ${meal.ingredients.map(ing=>`
                <div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--surface-2);">
                  <span style="font-size:13px;">${ing.name}</span>
                  <span style="font-size:13px;color:var(--text-3);">${ing.quantity} ${ing.unit||''}</span>
                </div>`).join('')}
            </div>
          </div>` : ''}

        ${Object.keys(meal.personNotes||{}).length>0 ? `
          <div style="margin-bottom:12px;">
            <div class="section-label" style="margin-bottom:6px;">Notes per person</div>
            ${Object.entries(meal.personNotes).map(([uid,note])=>{
              const u=_allUsers.find(x=>x.id===uid);
              return `<div style="font-size:13px;padding:4px 0;"><strong>${u?.displayName||uid}:</strong> ${note}</div>`;
            }).join('')}
          </div>` : ''}

        <div style="display:flex;gap:8px;margin-top:4px;">
          ${isAdult() && meal.ownerId===currentUser?.id ? `
            <button class="btn-ghost" style="flex:1;" onclick="this.closest('.modal-overlay').remove()">Close</button>
            <button class="btn-primary" style="flex:1;" id="edit-from-detail">Edit Meal</button>` : `
            <button class="btn-primary btn-full" onclick="this.closest('.modal-overlay').remove()">Close</button>`}
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{ if(e.target===overlay) overlay.remove(); });
  document.getElementById('edit-from-detail')?.addEventListener('click',()=>{ overlay.remove(); showMealForm(meal); });
}

// ─── Add / Edit Meal Form ──────────────────────────────────────────────────

function showMealForm(existingMeal=null) {
  const isEdit    = !!existingMeal;
  const activeUsers = _allUsers.filter(u=>u.isActive);
  const overlay   = document.createElement('div');
  overlay.className='modal-overlay';

  overlay.innerHTML=`
    <div class="bottom-sheet" style="max-height:95dvh;">
      <div class="sheet-handle"></div>
      <div style="padding:14px 20px 6px;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:17px;font-weight:800;color:var(--text);">${isEdit?'Edit Meal':'Add Meal'}</div>
        <button style="font-size:20px;color:var(--text-3);background:none;border:none;cursor:pointer;" id="close-form">✕</button>
      </div>

      <form id="meal-form" style="padding:0 20px 20px;display:flex;flex-direction:column;gap:14px;overflow-y:auto;max-height:80dvh;">

        <div class="form-group">
          <label class="form-label">Meal Name *</label>
          <input class="form-input" id="meal-title" type="text" placeholder="e.g. Homemade Mac & Cheese" value="${existingMeal?.title||''}" required />
        </div>

        <div class="form-group">
          <label class="form-label">Owner *</label>
          <select class="form-input" id="meal-owner">
            ${activeUsers.map(u=>`<option value="${u.id}" ${(existingMeal?.ownerId||currentUser?.id)===u.id?'selected':''}>${u.displayName}</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Cost</label>
          <div style="display:flex;gap:8px;">
            ${[1,2,3].map(c=>`
              <button type="button" class="cost-pill-btn ${(existingMeal?.cost||1)===c?'cost-pill-active':''}" data-cost="${c}" style="flex:1;padding:10px 0;border-radius:var(--radius-sm);border:1.5px solid var(--border);background:${(existingMeal?.cost||1)===c?'var(--primary)':'var(--surface)'};color:${(existingMeal?.cost||1)===c?'#fff':'var(--text-3)'};font-weight:700;font-size:14px;cursor:pointer;">
                ${'$'.repeat(c)}<div style="font-size:10px;opacity:0.75;">${['Cheap','Average','Expensive'][c-1]}</div>
              </button>`).join('')}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Recipe URL (optional)</label>
          <div style="display:flex;gap:8px;">
            <input class="form-input" id="meal-url" type="url" placeholder="https://..." value="${existingMeal?.recipeUrl||''}" style="flex:1;" />
            <button type="button" class="btn-primary" id="import-btn" style="padding:11px 14px;font-size:13px;white-space:nowrap;">⬇ Import</button>
          </div>
          <div id="import-status" style="font-size:12px;color:var(--text-3);margin-top:4px;"></div>
        </div>

        <div class="form-group">
          <label class="form-label">Ingredients</label>
          <div id="ingredient-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:6px;">
            ${(existingMeal?.ingredients||[]).map((ing,i)=>buildIngredientRow(ing,i)).join('')}
          </div>
          <button type="button" class="btn-ghost" id="add-ingredient" style="font-size:13px;padding:8px;">+ Add Ingredient</button>
        </div>

        <div class="form-group">
          <label class="form-label">Notes per Person (optional)</label>
          ${activeUsers.map(u=>`
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <div class="mini-avatar" style="background:${avatarBg(u.displayName)};width:26px;height:26px;font-size:9px;flex-shrink:0;">${initials(u.displayName)}</div>
              <input class="form-input" data-uid="${u.id}" placeholder="${u.displayName} — any notes?" value="${existingMeal?.personNotes?.[u.id]||''}" style="flex:1;font-size:14px;padding:8px 10px;" />
            </div>`).join('')}
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--surface-2);border-radius:var(--radius-sm);">
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--text);">Good leftovers</div>
            <div style="font-size:11px;color:var(--text-3);">Plan accordingly the next day</div>
          </div>
          <label class="toggle">
            <input type="checkbox" id="has-leftovers" ${existingMeal?.hasLeftovers?'checked':''} />
            <div class="toggle-track"></div><div class="toggle-thumb"></div>
          </label>
        </div>

        <div id="meal-form-error" class="form-error hidden"></div>

        <div style="display:flex;gap:8px;">
          <button type="submit" class="btn-primary" style="flex:1.5;" id="save-meal-btn">
            ${isEdit?'Save Changes':'Save Meal'}
          </button>
          ${!isEdit?`<button type="button" class="btn-ghost" style="flex:1;" id="save-add-another">Save & Add Another</button>`:''}
        </div>

        ${isEdit && existingMeal.status!=='archived' ? `
          <button type="button" class="btn-ghost" id="archive-meal-btn" style="color:var(--alert);border-color:var(--alert);">Archive This Meal</button>` : ''}
        ${isEdit && existingMeal.status==='archived' ? `
          <button type="button" class="btn-ghost" id="restore-meal-btn">Restore to Active</button>` : ''}

      </form>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.remove(); });
  document.getElementById('close-form')?.addEventListener('click',()=>overlay.remove());

  // Cost pills
  let selectedCost = existingMeal?.cost||1;
  overlay.querySelectorAll('.cost-pill-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      selectedCost=parseInt(btn.dataset.cost);
      overlay.querySelectorAll('.cost-pill-btn').forEach(b=>{
        b.style.background=b.dataset.cost==selectedCost?'var(--primary)':'var(--surface)';
        b.style.color=b.dataset.cost==selectedCost?'#fff':'var(--text-3)';
        b.style.borderColor=b.dataset.cost==selectedCost?'var(--primary)':'var(--border)';
      });
    });
  });

  // Add ingredient row
  let ingCount = (existingMeal?.ingredients||[]).length;
  document.getElementById('add-ingredient')?.addEventListener('click',()=>{
    const list=document.getElementById('ingredient-list');
    const row=document.createElement('div');
    row.innerHTML=buildIngredientRow({name:'',quantity:'',unit:''},ingCount++);
    list.appendChild(row.firstElementChild);
    bindIngredientRowDel();
  });
  bindIngredientRowDel();

  // Import
  document.getElementById('import-btn')?.addEventListener('click', async ()=>{
    const url=document.getElementById('meal-url').value.trim();
    const status=document.getElementById('import-status');
    if(!url){ status.textContent='Enter a URL first.'; return; }
    status.textContent='Importing…';
    try {
      const ingredients=await importRecipe(url);
      if(ingredients.length===0){ status.textContent='No ingredients found — try entering manually.'; return; }
      const list=document.getElementById('ingredient-list');
      list.innerHTML=ingredients.map((ing,i)=>buildIngredientRow(ing,i)).join('');
      ingCount=ingredients.length;
      bindIngredientRowDel();
      status.textContent=`✓ ${ingredients.length} ingredients imported.`;
      status.style.color='var(--success)';
    } catch(e){ status.textContent='Import failed — enter ingredients manually.'; }
  });

  // Archive / restore
  document.getElementById('archive-meal-btn')?.addEventListener('click', async ()=>{
    if(!confirm('Archive this meal? You can restore it later.')) return;
    await updateMeal(existingMeal.id,{status:'archived'});
    await archiveMealForUser(existingMeal.ownerId, existingMeal.id);
    _allMeals = await getAllMeals();
    overlay.remove();
    renderMealsBody();
  });

  document.getElementById('restore-meal-btn')?.addEventListener('click', async ()=>{
    const owner=_allUsers.find(u=>u.id===existingMeal.ownerId);
    if((owner?.activeMealIds||[]).length>=10){ alert('Max 10 active meals. Archive another first.'); return; }
    await updateMeal(existingMeal.id,{status:'active'});
    await restoreMealForUser(existingMeal.ownerId, existingMeal.id);
    _allMeals = await getAllMeals();
    overlay.remove();
    renderMealsBody();
  });

  // Form submit
  const submitForm = async (saveAndAdd=false) => {
    const errEl=document.getElementById('meal-form-error');
    errEl.classList.add('hidden');
    const title=document.getElementById('meal-title').value.trim();
    const ownerId=document.getElementById('meal-owner').value;
    if(!title){ showFormError('Meal name is required.'); return; }

    const ingredients=[];
    document.querySelectorAll('.ing-row').forEach(row=>{
      const name=row.querySelector('.ing-name-input')?.value?.trim();
      const qty =row.querySelector('.ing-qty-input')?.value?.trim();
      const unit=row.querySelector('.ing-unit-input')?.value?.trim();
      if(name) ingredients.push({name,quantity:qty||'',unit:unit||''});
    });

    const personNotes={};
    overlay.querySelectorAll('input[data-uid]').forEach(inp=>{
      const v=inp.value.trim();
      if(v) personNotes[inp.dataset.uid]=v;
    });

    const mealData={
      title, ownerId, cost:selectedCost,
      recipeUrl:document.getElementById('meal-url').value.trim()||null,
      ingredients, personNotes,
      hasLeftovers:document.getElementById('has-leftovers').checked,
      ingredientsImported:false
    };

    const btn=document.getElementById('save-meal-btn');
    btn.disabled=true; btn.textContent='Saving…';

    try {
      if(isEdit){
        await updateMeal(existingMeal.id,mealData);
        const idx=_allMeals.findIndex(m=>m.id===existingMeal.id);
        if(idx>=0) _allMeals[idx]={..._allMeals[idx],...mealData};
      } else {
        const id=await createMeal(mealData);
        await addMealToUser(ownerId,id);
        _allMeals=await getAllMeals();
      }
      if(saveAndAdd){
        btn.disabled=false; btn.textContent='Save Meal';
        overlay.querySelector('#meal-title').value='';
        overlay.querySelector('#meal-url').value='';
        overlay.querySelector('#ingredient-list').innerHTML='';
        overlay.querySelectorAll('input[data-uid]').forEach(i=>i.value='');
        overlay.querySelector('#has-leftovers').checked=false;
        overlay.querySelector('#import-status').textContent='';
        ingCount=0;
      } else {
        overlay.remove();
      }
      renderMealsBody();
    } catch(err){
      console.error(err);
      btn.disabled=false; btn.textContent=isEdit?'Save Changes':'Save Meal';
      showFormError('Failed to save. Try again.');
    }
  };

  overlay.querySelector('#meal-form')?.addEventListener('submit',e=>{ e.preventDefault(); submitForm(false); });
  document.getElementById('save-add-another')?.addEventListener('click',()=>submitForm(true));

  function showFormError(msg){ const e=document.getElementById('meal-form-error'); e.textContent=msg; e.classList.remove('hidden'); }
}

function buildIngredientRow(ing, i) {
  return `<div class="ing-row" style="display:flex;gap:6px;align-items:center;">
    <input class="form-input ing-qty-input" type="text" placeholder="Qty" value="${ing.quantity||''}" style="width:64px;flex-shrink:0;padding:8px;" />
    <input class="form-input ing-unit-input" type="text" placeholder="Unit" value="${ing.unit||''}" style="width:72px;flex-shrink:0;padding:8px;" />
    <input class="form-input ing-name-input" type="text" placeholder="Ingredient name" value="${ing.name||''}" style="flex:1;padding:8px;" />
    <button type="button" class="ing-del-btn" style="color:var(--alert);font-size:18px;flex-shrink:0;background:none;border:none;cursor:pointer;">✕</button>
  </div>`;
}

function bindIngredientRowDel() {
  document.querySelectorAll('.ing-del-btn').forEach(btn=>{
    btn.onclick=()=>btn.closest('.ing-row')?.remove();
  });
}

async function importRecipe(url) {
  // Attempt to fetch via a CORS proxy and parse schema.org Recipe markup
  const proxyUrl=`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const resp=await fetch(proxyUrl);
  const html=await resp.text();
  const parser=new DOMParser();
  const dom=parser.parseFromString(html,'text/html');
  // Try JSON-LD first
  const scripts=[...dom.querySelectorAll('script[type="application/ld+json"]')];
  for(const s of scripts){
    try{
      const data=JSON.parse(s.textContent);
      const recipe=Array.isArray(data)?data.find(d=>d['@type']==='Recipe'):data['@type']==='Recipe'?data:null;
      if(recipe?.recipeIngredient){
        return recipe.recipeIngredient.map(parseIngredientString);
      }
    }catch{}
  }
  return [];
}

function parseIngredientString(str) {
  const m=str.match(/^([\d./¼½¾⅓⅔⅛⅜⅝⅞\s]+)?\s*(cup|cups|tbsp|tsp|oz|ounce|ounces|lb|lbs|pound|pounds|g|gram|grams|kg|ml|liter|liters|clove|cloves|can|cans|slice|slices|piece|pieces|bunch|bunches|head|heads|large|medium|small|packet|packets)s?\s+(.+)$/i);
  if(m) return {quantity:m[1]?.trim()||'',unit:m[2]?.trim()||'',name:m[3]?.trim()||str};
  return {quantity:'',unit:'',name:str};
}

function buildTabBar() {
  return `<nav class="tab-bar">
    <button class="tab-item" data-route="/dashboard"><span class="tab-icon">🏠</span><span class="tab-label">Home</span></button>
    ${isAdult()?`<button class="tab-item" data-route="/planner"><span class="tab-icon">📅</span><span class="tab-label">Planner</span></button>`:''}
    <button class="tab-item active" data-route="/meals"><span class="tab-icon">🍽️</span><span class="tab-label">Meals</span><div class="tab-dot"></div></button>
    ${isAdult()?`<button class="tab-item" data-route="/shopping"><span class="tab-icon">🛒</span><span class="tab-label">Shopping</span></button>`:''}
    <button class="tab-item" data-route="/calendar"><span class="tab-icon">📆</span><span class="tab-label">Calendar</span></button>
    ${isChild()?`<button class="tab-item" data-route="/analytics"><span class="tab-icon">📊</span><span class="tab-label">Stats</span></button>`:''}
  </nav>`;
}

function bindTabBar() {
  document.querySelectorAll('.tab-item[data-route]').forEach(btn=>{
    btn.addEventListener('click',()=>navigate(btn.dataset.route));
  });
}

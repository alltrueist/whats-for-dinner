// js/screens/shopping.js — Shopping List (adults only)
import { currentUser } from '../state.js';
import { navigate } from '../router.js';
import { getHouseholdSettings, markPurchased } from '../db.js';
import {
  getDocs, doc, updateDoc, collection, query,
  where, orderBy, limit, onSnapshot, serverTimestamp, addDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from '../firebase.js';
import { COLLECTIONS } from '../config.js';

const AVATAR_COLORS = { Owen:'#495057', Hanna:'#2B6940' };
function avatarBg(n){ return AVATAR_COLORS[n]||'#868E96'; }
function initials(n){ return n?n.slice(0,2).toUpperCase():'??'; }

let _listId = null;
let _unsubscribe = null;

export async function renderShopping(params, container) {
  container.innerHTML = `
    <div class="screen" id="shopping-screen">
      <div class="app-header">
        <div class="app-wordmark">What's for Dinner?</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="icon-btn" id="silence-btn" title="Silence notifications">🔔</button>
          <div class="avatar" style="background:${avatarBg(currentUser?.displayName)};color:#fff;">${initials(currentUser?.displayName)}</div>
        </div>
      </div>
      <div id="shopping-body" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div style="display:flex;justify-content:center;align-items:center;flex:1;"><div class="spinner"></div></div>
      </div>
      ${buildTabBar()}
    </div>`;

  bindTabBar();
  document.getElementById('silence-btn')?.addEventListener('click', showSilenceMenu);
  await loadShoppingList(container);
}

async function loadShoppingList(container) {
  const body = document.getElementById('shopping-body');
  try {
    // Find active shopping list from active cycle
    const cycleQ = query(collection(db,COLLECTIONS.CYCLES), where('status','in',['active','planning']), orderBy('startDate','desc'), limit(1));
    const cycles  = (await getDocs(cycleQ)).docs;
    if (cycles.length===0 || !cycles[0].data().shoppingListId) {
      body.innerHTML = buildNoListState();
      document.getElementById('go-planner-btn')?.addEventListener('click',()=>navigate('/planner'));
      return;
    }

    _listId = cycles[0].data().shoppingListId;

    // Subscribe to real-time updates
    if (_unsubscribe) _unsubscribe();
    _unsubscribe = onSnapshot(doc(db,COLLECTIONS.SHOPPING_LISTS,_listId), snap=>{
      if (!snap.exists()) return;
      const list = {id:snap.id,...snap.data()};
      renderList(list, body);
    });

  } catch(err) {
    console.error(err);
    body.innerHTML = `<div class="note note-warn" style="margin:20px;"><span>⚠</span><div>Failed to load shopping list.</div></div>`;
  }

  // Return cleanup
  return () => { if(_unsubscribe) _unsubscribe(); };
}

function buildNoListState() {
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;padding:40px;text-align:center;">
    <div style="font-size:48px;margin-bottom:16px;">🛒</div>
    <div style="font-size:18px;font-weight:800;color:var(--text);margin-bottom:8px;">No shopping list yet</div>
    <div style="font-size:14px;color:var(--text-3);margin-bottom:24px;line-height:1.6;">
      Finalize a cycle in the Planner to auto-generate your shopping list.
    </div>
    <button class="btn-primary" id="go-planner-btn">Go to Planner →</button>
  </div>`;
}

function renderList(list, body) {
  const items    = list.items || [];
  const aldis    = items.filter(i=>i.assignedStore==='aldi');
  const krogers  = items.filter(i=>i.assignedStore!=='aldi');
  const staples  = items.filter(i=>i.isStaple||i.fromStaples);
  const checked  = items.filter(i=>i.checkedOff).length;
  const total    = items.length;

  body.innerHTML = `
    <!-- Gen info -->
    <div class="gen-bar">
      Generated from ${total} ingredient${total!==1?'s':''} · ${checked} of ${total} checked
    </div>

    <!-- Sync bar -->
    <div class="sync-bar" id="sync-bar">
      <div class="sync-dot"></div>
      <span class="sync-text" id="sync-text">Synced — changes update instantly for both shoppers</span>
      <button class="notif-btn" id="bell-btn">🔔</button>
    </div>

    <!-- List -->
    <div class="screen-scroll" id="list-scroll">
      <div id="list-content">
        ${buildStoreSection('🛒 Aldi', aldis, 'aldi')}
        ${buildStoreSection('🛒 Kroger', krogers, 'kroger')}
        ${buildStaplesSection(staples)}
      </div>

      <!-- Add item -->
      <div class="add-item-row">
        <input class="form-input add-item-input" id="add-item-input" type="text" placeholder="Add an item…" />
        <button class="add-item-btn" id="add-item-submit">+</button>
      </div>
    </div>

    <!-- Complete button -->
    <div style="padding:10px 16px max(16px,env(safe-area-inset-bottom));background:var(--surface);border-top:1px solid var(--border);">
      <button class="btn-primary btn-full ${list.status==='complete'?'':'active'}" id="complete-btn"
        style="background:var(--success);">
        ${list.status==='complete' ? '✓ Shopping Complete' : '✓ Mark List Done'}
      </button>
    </div>
  `;

  bindListEvents(list, items);
}

function buildStoreSection(label, items, store) {
  if (items.length===0) return '';
  const byCategory = {};
  items.forEach(item=>{
    const cat = item.category||'Other';
    if (!byCategory[cat]) byCategory[cat]=[];
    byCategory[cat].push(item);
  });

  return `
    <div class="store-section">
      <div class="store-header">
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="store-logo ${store}-logo">${store==='aldi'?'A':'K'}</div>
          <span class="store-label">${label}</span>
          <span class="store-count">${items.length} items</span>
        </div>
        ${buildStoreSubtotal(items)}
      </div>
      ${Object.entries(byCategory).map(([cat,catItems])=>`
        <div class="cat-divider"><span class="cat-label">${cat}</span><div class="cat-line"></div></div>
        ${catItems.map(item=>buildItemRow(item)).join('')}
      `).join('')}
    </div>`;
}

function buildStoreSubtotal(items) {
  const total = items.reduce((sum,i)=>{
    const p=i.assignedStore==='aldi'?i.aldiPrice:i.krogerSalePrice||i.krogerPrice;
    return sum+(p||0);
  },0);
  if (total===0) return '';
  return `<span class="store-subtotal">~$${total.toFixed(2)}</span>`;
}

function buildStaplesSection(staples) {
  if(staples.length===0) return '';
  return `
    <div class="store-section">
      <div class="store-header">
        <div style="display:flex;align-items:center;gap:8px;">
          <span>⭐</span>
          <span class="store-label">Always Buy</span>
        </div>
      </div>
      ${staples.map(item=>buildItemRow(item)).join('')}
    </div>`;
}

function buildItemRow(item) {
  const isLow    = item.pantryStatus==='low';
  const hasSale  = item.krogerSalePrice && item.krogerPrice && item.krogerSalePrice<item.krogerPrice;
  const price    = item.assignedStore==='aldi' ? item.aldiPrice : item.krogerSalePrice||item.krogerPrice;
  const origPrice= item.assignedStore!=='aldi' && hasSale ? item.krogerPrice : null;
  const otherStore = item.assignedStore==='aldi'?'Kroger':'Aldi';

  return `
    <div class="item-row ${item.checkedOff?'item-checked':''} ${isLow?'item-low':''}"
         data-item="${encodeURIComponent(JSON.stringify({name:item.ingredientName||item.name,store:item.assignedStore}))}">
      <button class="checkbox ${item.checkedOff?'checkbox-checked':''}" data-name="${item.ingredientName||item.name}">
        ${item.checkedOff?'✓':''}
      </button>
      <div class="item-info">
        <div class="item-name ${item.checkedOff?'item-name-crossed':''}">${item.ingredientName||item.name||'Item'}</div>
        <div class="item-sub">
          ${item.quantity||''}
          ${isLow?'<span class="badge badge-low" style="margin-left:4px;">LOW</span>':''}
          ${item.quantityConflict?'<span style="font-size:10px;color:var(--warning);margin-left:4px;">verify qty</span>':''}
        </div>
      </div>
      <div class="item-right">
        ${origPrice?`<span class="price-original">$${origPrice.toFixed(2)}</span>`:''}
        ${price?`<span class="${hasSale?'price-sale':'price-reg'}">$${price.toFixed(2)}</span>`:''}
        ${hasSale?'<span class="badge badge-sale">Sale</span>':''}
        <button class="move-pill" data-name="${item.ingredientName||item.name}" data-store="${item.assignedStore}">→ ${otherStore}</button>
      </div>
    </div>`;
}

function bindListEvents(list, items) {
  // Check off items
  document.querySelectorAll('.checkbox[data-name]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const name  = btn.dataset.name;
      const newItems = items.map(i=>{
        if((i.ingredientName||i.name)===name){
          return {...i, checkedOff:!i.checkedOff, checkedBy:currentUser?.id, checkedAt:new Date().toISOString()};
        }
        return i;
      });
      try {
        await updateDoc(doc(db,COLLECTIONS.SHOPPING_LISTS,_listId),{items:newItems});
        // Update sync bar
        const syncText=document.getElementById('sync-text');
        if(syncText) syncText.textContent=`${currentUser?.displayName} checked off "${name}"`;
      } catch(err){ console.error(err); }
    });
  });

  // Move store
  document.querySelectorAll('.move-pill[data-name]').forEach(btn=>{
    btn.addEventListener('click', async e=>{
      e.stopPropagation();
      const name     = btn.dataset.name;
      const curStore = btn.dataset.store;
      const newStore = curStore==='aldi'?'kroger':'aldi';
      const newItems = items.map(i=>{
        if((i.ingredientName||i.name)===name) return {...i,assignedStore:newStore,storeOverridden:true};
        return i;
      });
      await updateDoc(doc(db,COLLECTIONS.SHOPPING_LISTS,_listId),{items:newItems});
    });
  });

  // Add item manually
  document.getElementById('add-item-submit')?.addEventListener('click', async ()=>{
    const input=document.getElementById('add-item-input');
    const name=input.value.trim();
    if(!name) return;
    const newItem={ingredientName:name,quantity:'',sourceMealIds:[],quantityConflict:false,pantryStatus:'none',assignedStore:'kroger',storeOverridden:false,checkedOff:false,checkedBy:null,checkedAt:null,category:'Other',isManuallyAdded:true,krogerPrice:null,krogerSalePrice:null,aldiPrice:null};
    const newItems=[...items,newItem];
    await updateDoc(doc(db,COLLECTIONS.SHOPPING_LISTS,_listId),{items:newItems});
    input.value='';
  });

  document.getElementById('add-item-input')?.addEventListener('keydown',e=>{
    if(e.key==='Enter') document.getElementById('add-item-submit')?.click();
  });

  // Complete list
  document.getElementById('complete-btn')?.addEventListener('click',()=>{
    if(list.status==='complete') return;
    showCompleteConfirmation(list,items);
  });
}

function showCompleteConfirmation(list, items) {
  const checked   = items.filter(i=>i.checkedOff);
  const unchecked = items.filter(i=>!i.checkedOff);
  const savings   = list.estimatedSavings;
  const overlay   = document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <div style="background:var(--success);padding:20px;text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">🛒</div>
        <div style="font-size:18px;font-weight:800;color:#fff;">Mark Shopping Done?</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:4px;">This will update your pantry automatically</div>
      </div>
      <div style="padding:16px 20px;">
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:14px;">
          <span style="color:var(--text-3);">Items checked</span>
          <span style="font-weight:700;">${checked.length} of ${items.length}</span>
        </div>
        ${savings?`<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:14px;">
          <span style="color:var(--text-3);">Estimated savings</span>
          <span style="font-weight:700;color:var(--success);">−$${savings.toFixed(2)}</span>
        </div>`:''}
        ${unchecked.length>0?`<div class="note note-warn" style="margin-top:12px;">
          <span>⚠</span><div><strong>${unchecked.length} item${unchecked.length!==1?'s':''} unchecked</strong> — pantry won't update for: ${unchecked.map(i=>i.ingredientName||i.name).join(', ')}</div>
        </div>`:''}
        <div style="display:flex;gap:8px;margin-top:16px;">
          <button class="btn-primary" id="confirm-complete" style="flex:1.5;background:var(--success);">✓ Confirm & Update Pantry</button>
          <button class="btn-ghost" style="flex:1;" onclick="this.closest('.modal-overlay').remove()">Go Back</button>
        </div>
      </div>
      <div style="height:max(16px,env(safe-area-inset-bottom));"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{ if(e.target===overlay) overlay.remove(); });
  document.getElementById('confirm-complete')?.addEventListener('click', async ()=>{
    overlay.remove();
    await updateDoc(doc(db,COLLECTIONS.SHOPPING_LISTS,_listId),{
      status:'complete', completedAt:serverTimestamp(), completedBy:currentUser?.id
    });
    // Update pantry for checked items
    const purchasedNames=checked.map(i=>i.ingredientName||i.name).filter(Boolean);
    if(purchasedNames.length>0) await markPurchased(purchasedNames);
    navigate('/dashboard');
  });
}

function showSilenceMenu() {
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <div style="padding:16px 20px 8px;font-size:16px;font-weight:800;color:var(--text);">Silence Notifications</div>
      <button class="menu-item" id="silence-trip">🛒 Silence this trip</button>
      <button class="menu-item" id="silence-1hr">⏱ Silence for 1 hour</button>
      <button class="menu-item" id="silence-manual">🔕 Silence until I turn it back on</button>
      <button class="menu-item" style="color:var(--text-3);" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <div style="height:max(16px,env(safe-area-inset-bottom));"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{ if(e.target===overlay) overlay.remove(); });
  ['silence-trip','silence-1hr','silence-manual'].forEach(id=>{
    document.getElementById(id)?.addEventListener('click',()=>{ overlay.remove(); alert('Notifications silenced. (Push notification integration coming soon.)'); });
  });
}

function buildTabBar() {
  return `<nav class="tab-bar">
    <button class="tab-item" data-route="/dashboard"><span class="tab-icon">🏠</span><span class="tab-label">Home</span></button>
    <button class="tab-item" data-route="/planner"><span class="tab-icon">📅</span><span class="tab-label">Planner</span></button>
    <button class="tab-item" data-route="/meals"><span class="tab-icon">🍽️</span><span class="tab-label">Meals</span></button>
    <button class="tab-item active" data-route="/shopping"><span class="tab-icon">🛒</span><span class="tab-label">Shopping</span><div class="tab-dot"></div></button>
    <button class="tab-item" data-route="/calendar"><span class="tab-icon">📆</span><span class="tab-label">Calendar</span></button>
  </nav>`;
}

function bindTabBar() {
  document.querySelectorAll('.tab-item[data-route]').forEach(btn=>{
    btn.addEventListener('click',()=>{ if(_unsubscribe) _unsubscribe(); navigate(btn.dataset.route); });
  });
}

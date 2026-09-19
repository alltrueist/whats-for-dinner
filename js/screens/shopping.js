// js/screens/shopping.js — Shopping List (adults only)
import { currentUser } from '../state.js';
import { navigate } from '../router.js';
import { markPurchased } from '../db.js';
import { getCurrentCycle } from '../cycles.js';
import { doc, updateDoc, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from '../firebase.js';
import { COLLECTIONS } from '../config.js';

const AC={Owen:'#495057',Hanna:'#2B6940'};
const ab=n=>AC[n]||'#868E96';
const ini=n=>n?n.slice(0,2).toUpperCase():'??';
let _listId=null, _unsub=null;

export async function renderShopping(params,container) {
  container.innerHTML=`
    <div class="screen" id="shop-screen">
      <div class="app-header">
        <div class="app-wordmark">What's for Dinner?</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="icon-btn" id="silence-btn">🔔</button>
          <div class="avatar" style="background:${ab(currentUser?.displayName)};color:#fff;">${ini(currentUser?.displayName)}</div>
        </div>
      </div>
      <div id="shop-body" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div style="display:flex;justify-content:center;align-items:center;flex:1;"><div class="spinner"></div></div>
      </div>
      ${buildTabBar()}
    </div>`;
  bindTabBar();
  document.getElementById('silence-btn')?.addEventListener('click',showSilence);
  await loadList();
  return ()=>{if(_unsub)_unsub();};
}

async function loadList() {
  const body=document.getElementById('shop-body');
  try {
    const cycle=await getCurrentCycle();
    if(!cycle?.shoppingListId) { body.innerHTML=buildNoList(); document.getElementById('go-plan-btn')?.addEventListener('click',()=>navigate('/planner')); return; }
    _listId=cycle.shoppingListId;
    if(_unsub) _unsub();
    _unsub=onSnapshot(doc(db,COLLECTIONS.SHOPPING_LISTS,_listId),snap=>{
      if(!snap.exists())return;
      renderList({id:snap.id,...snap.data()},body);
    });
  } catch(e) {
    console.error('[Shopping]',e);
    body.innerHTML=`<div class="note note-warn" style="margin:20px;"><span>⚠</span><div>Failed to load: ${e.message}</div></div>`;
  }
}

function buildNoList(){
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;padding:40px;text-align:center;">
    <div style="font-size:48px;margin-bottom:16px;">🛒</div>
    <div style="font-size:18px;font-weight:800;color:var(--text);margin-bottom:8px;">No shopping list yet</div>
    <div style="font-size:14px;color:var(--text-3);margin-bottom:24px;line-height:1.6;">Finalize a cycle in the Planner to generate your list.</div>
    <button class="btn-primary" id="go-plan-btn">Go to Planner →</button>
  </div>`;
}

function renderList(list,body) {
  const items=list.items||[];
  const aldi=items.filter(i=>i.assignedStore==='aldi');
  const kroger=items.filter(i=>i.assignedStore!=='aldi');
  const checked=items.filter(i=>i.checkedOff).length;
  body.innerHTML=`
    <div class="gen-bar"><strong>${checked}</strong> of <strong>${items.length}</strong> items checked</div>
    <div class="sync-bar" id="sync-bar">
      <div class="sync-dot"></div>
      <span class="sync-text" id="sync-text">Live sync active</span>
      <button class="notif-btn" id="bell2">🔔</button>
    </div>
    <div class="screen-scroll" id="list-scroll">
      <div id="list-body">
        ${storeSection('A','aldi','Aldi',aldi)}
        ${storeSection('K','kroger','Kroger',kroger)}
        ${staplesSection(items.filter(i=>i.isManuallyAdded===false&&i.pantryStatus==='stocked'))}
      </div>
      <div class="add-item-row">
        <input class="form-input add-item-input" id="add-input" type="text" placeholder="Add an item…" />
        <button class="add-item-btn" id="add-submit">+</button>
      </div>
    </div>
    <div style="padding:10px 16px max(16px,env(safe-area-inset-bottom));background:var(--surface);border-top:1px solid var(--border);">
      <button class="btn-primary btn-full" id="done-btn" style="background:var(--success);">
        ${list.status==='complete'?'✓ Shopping Complete':'✓ Mark List Done'}
      </button>
    </div>`;
  document.getElementById('bell2')?.addEventListener('click',showSilence);
  bindListEvents(list,items);
}

function storeSection(letter,store,label,items){
  if(!items.length) return '';
  const bycat={};
  items.forEach(i=>{const c=i.category||'Other';(bycat[c]=bycat[c]||[]).push(i);});
  return `
    <div class="store-section">
      <div class="store-header">
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="store-logo ${store}-logo">${letter}</div>
          <span class="store-label">${label}</span>
          <span class="store-count">${items.length} items</span>
        </div>
      </div>
      ${Object.entries(bycat).map(([cat,ci])=>`
        <div class="cat-divider"><span class="cat-label">${cat}</span><div class="cat-line"></div></div>
        ${ci.map(item=>itemRow(item,store)).join('')}`).join('')}
    </div>`;
}

function staplesSection(suppressed){
  if(!suppressed.length) return '';
  return `<div style="padding:8px 14px;background:var(--surface-2);border-top:1px solid var(--border);">
    <div style="font-size:11px;color:var(--text-3);">✓ ${suppressed.length} pantry item${suppressed.length!==1?'s':''} suppressed (in stock)</div>
  </div>`;
}

function itemRow(item,store){
  const low=item.pantryStatus==='low';
  const hasSale=item.krogerSalePrice&&item.krogerPrice&&item.krogerSalePrice<item.krogerPrice;
  const price=store==='aldi'?item.aldiPrice:(item.krogerSalePrice||item.krogerPrice);
  const orig=store!=='aldi'&&hasSale?item.krogerPrice:null;
  const other=store==='aldi'?'Kroger':'Aldi';
  const name=item.ingredientName||item.name||'Item';
  return `
    <div class="item-row ${item.checkedOff?'item-checked':''} ${low?'item-low':''}">
      <button class="checkbox ${item.checkedOff?'checkbox-checked':''}" data-check="${encodeURIComponent(name)}">${item.checkedOff?'✓':''}</button>
      <div class="item-info">
        <div class="item-name ${item.checkedOff?'item-name-crossed':''}">${name}</div>
        <div class="item-sub">
          ${item.quantity||''}
          ${low?'<span class="badge badge-low" style="margin-left:4px;">LOW</span>':''}
          ${item.quantityConflict?'<span style="font-size:10px;color:var(--warning);margin-left:4px;">verify qty</span>':''}
        </div>
      </div>
      <div class="item-right">
        ${orig?`<span class="price-original">$${orig.toFixed(2)}</span>`:''}
        ${price?`<span class="${hasSale?'price-sale':'price-reg'}">$${price.toFixed(2)}</span>`:''}
        ${hasSale?'<span class="badge badge-sale">Sale</span>':''}
        <button class="move-pill" data-move="${encodeURIComponent(name)}" data-from="${store}">→ ${other}</button>
      </div>
    </div>`;
}

function bindListEvents(list,items) {
  document.querySelectorAll('[data-check]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      const name=decodeURIComponent(btn.dataset.check);
      const newItems=items.map(i=>(i.ingredientName||i.name)===name?{...i,checkedOff:!i.checkedOff,checkedBy:currentUser?.id,checkedAt:new Date().toISOString()}:i);
      await updateDoc(doc(db,COLLECTIONS.SHOPPING_LISTS,_listId),{items:newItems});
      const st=document.getElementById('sync-text');
      if(st)st.textContent=`${currentUser?.displayName} checked off "${name}"`;
    });
  });

  document.querySelectorAll('[data-move]').forEach(btn=>{
    btn.addEventListener('click',async e=>{
      e.stopPropagation();
      const name=decodeURIComponent(btn.dataset.move);
      const from=btn.dataset.from;
      const to=from==='aldi'?'kroger':'aldi';
      const newItems=items.map(i=>(i.ingredientName||i.name)===name?{...i,assignedStore:to,storeOverridden:true}:i);
      await updateDoc(doc(db,COLLECTIONS.SHOPPING_LISTS,_listId),{items:newItems});
    });
  });

  document.getElementById('add-submit')?.addEventListener('click',async()=>{
    const inp=document.getElementById('add-input');
    const name=inp.value.trim();
    if(!name)return;
    const newItem={ingredientName:name,quantity:'',sourceMealIds:[],quantityConflict:false,pantryStatus:'none',assignedStore:'kroger',storeOverridden:false,checkedOff:false,checkedBy:null,checkedAt:null,category:'Other',isManuallyAdded:true,krogerPrice:null,krogerSalePrice:null,aldiPrice:null};
    await updateDoc(doc(db,COLLECTIONS.SHOPPING_LISTS,_listId),{items:[...items,newItem]});
    inp.value='';
  });
  document.getElementById('add-input')?.addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('add-submit')?.click();});

  document.getElementById('done-btn')?.addEventListener('click',()=>{
    if(list.status==='complete')return;
    showComplete(list,items);
  });
}

function showComplete(list,items){
  const checked=items.filter(i=>i.checkedOff);
  const unchecked=items.filter(i=>!i.checkedOff);
  const ov=document.createElement('div');ov.className='modal-overlay';
  ov.innerHTML=`
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <div style="background:var(--success);padding:20px;text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">🛒</div>
        <div style="font-size:18px;font-weight:800;color:#fff;">Mark Shopping Done?</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:4px;">This will update your pantry automatically</div>
      </div>
      <div style="padding:16px 20px;">
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:14px;">
          <span style="color:var(--text-3);">Items checked</span><span style="font-weight:700;">${checked.length} of ${items.length}</span>
        </div>
        ${unchecked.length?`<div class="note note-warn" style="margin-top:12px;"><span>⚠</span><div><strong>${unchecked.length} item${unchecked.length!==1?'s':''} unchecked</strong> — pantry won't update for: ${unchecked.map(i=>i.ingredientName||i.name).slice(0,3).join(', ')}${unchecked.length>3?'…':''}</div></div>`:''}
        <div style="display:flex;gap:8px;margin-top:16px;">
          <button class="btn-primary" style="flex:1.5;background:var(--success);" id="confirm-done">✓ Confirm & Update Pantry</button>
          <button class="btn-ghost" style="flex:1;" id="cancel-done">Go Back</button>
        </div>
      </div>
      <div style="height:max(16px,env(safe-area-inset-bottom));"></div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
  document.getElementById('cancel-done')?.addEventListener('click',()=>ov.remove());
  document.getElementById('confirm-done')?.addEventListener('click',async()=>{
    ov.remove();
    await updateDoc(doc(db,COLLECTIONS.SHOPPING_LISTS,_listId),{status:'complete',completedAt:serverTimestamp(),completedBy:currentUser?.id});
    const names=checked.map(i=>i.ingredientName||i.name).filter(Boolean);
    if(names.length) await markPurchased(names);
    navigate('/dashboard');
  });
}

function showSilence(){
  const ov=document.createElement('div');ov.className='modal-overlay';
  ov.innerHTML=`
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <div style="padding:16px 20px 8px;font-size:16px;font-weight:800;">Silence Notifications</div>
      <button class="menu-item">🛒 Silence this trip</button>
      <button class="menu-item">⏱ Silence for 1 hour</button>
      <button class="menu-item">🔕 Silence until I turn it back on</button>
      <button class="menu-item" style="color:var(--text-3);" id="cancel-silence">Cancel</button>
      <div style="height:max(16px,env(safe-area-inset-bottom));"></div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
  ov.querySelectorAll('.menu-item').forEach(b=>b.addEventListener('click',()=>ov.remove()));
}

function buildTabBar(){return`<nav class="tab-bar">
  <button class="tab-item" data-route="/dashboard"><span class="tab-icon">🏠</span><span class="tab-label">Home</span></button>
  <button class="tab-item" data-route="/planner"><span class="tab-icon">📅</span><span class="tab-label">Planner</span></button>
  <button class="tab-item" data-route="/meals"><span class="tab-icon">🍽️</span><span class="tab-label">Meals</span></button>
  <button class="tab-item active" data-route="/shopping"><span class="tab-icon">🛒</span><span class="tab-label">Shopping</span><div class="tab-dot"></div></button>
  <button class="tab-item" data-route="/calendar"><span class="tab-icon">📆</span><span class="tab-label">Calendar</span></button>
</nav>`;}
function bindTabBar(){document.querySelectorAll('.tab-item[data-route]').forEach(b=>b.addEventListener('click',()=>{if(_unsub)_unsub();navigate(b.dataset.route);}));}

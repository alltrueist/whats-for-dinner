// js/screens/settings.js
import { currentUser, isAdult, isChild, applyPalette } from '../state.js';
import { navigate } from '../router.js';
import { getAllUsers, getHouseholdSettings, setHouseholdSettings, updateUserPalette, updateChildPin, updateNotificationPrefs } from '../db.js';
import { hashPin } from '../utils.js';
import { signOut } from '../auth.js';
import { clearCurrentUser } from '../state.js';
import { PALETTES } from '../config.js';

const AC={Owen:'#495057',Hanna:'#2B6940',Jack:'#1864AB',Otto:'#C1440E',Ella:'#6A0DAD'};
const ab=n=>AC[n]||'#868E96';const ini=n=>n?n.slice(0,2).toUpperCase():'??';
const PL={slate:'Slate (Default)',obsidian:'Obsidian (Dark)',azure:'Azure (Blue)',sage:'Sage (Green)',terracotta:'Terracotta (Warm)',violet:'Violet (Bold)'};

export async function renderSettings(params,container){
  container.innerHTML=`
    <div class="screen">
      <div class="app-header">
        <button class="panel-back" id="back-btn" style="font-size:16px;font-weight:600;color:var(--primary);background:none;border:none;cursor:pointer;">‹ Back</button>
        <div class="app-wordmark">Settings</div>
        <div class="avatar" style="background:${ab(currentUser?.displayName)};color:#fff;">${ini(currentUser?.displayName)}</div>
      </div>
      <div class="screen-scroll"><div class="screen-content" id="settings-content">
        <div style="display:flex;justify-content:center;padding:40px;"><div class="spinner"></div></div>
      </div></div>
    </div>`;
  document.getElementById('back-btn')?.addEventListener('click',()=>navigate('/dashboard'));
  const [allUsers,settings]=await Promise.all([getAllUsers(),getHouseholdSettings()]);
  renderContent(allUsers,settings);
}

function renderContent(allUsers,settings){
  const content=document.getElementById('settings-content');if(!content)return;
  const prefs=currentUser?.notificationPrefs||{};
  const adults=allUsers.filter(u=>u.role==='adult'&&u.isActive);
  const children=allUsers.filter(u=>u.role==='child'&&u.isActive);

  content.innerHTML=`
    <!-- Account -->
    <div><div class="section-label">Account</div><div class="card">
      <div class="settings-row">
        <div class="avatar" style="background:${ab(currentUser?.displayName)};color:#fff;width:48px;height:48px;font-size:16px;">${ini(currentUser?.displayName)}</div>
        <div><div style="font-size:16px;font-weight:700;">${currentUser?.displayName}</div>
        <div style="font-size:13px;color:var(--text-3);">${currentUser?.role==='adult'?currentUser?.email||'Adult account':'Kid account'}</div></div>
      </div>
      <div class="settings-divider"></div>
      <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:6px;">
        <div class="form-label">Color Palette</div>
        <select class="form-input" id="palette-sel">
          ${PALETTES.map(p=>`<option value="${p}" ${currentUser?.palette===p?'selected':''}>${PL[p]||p}</option>`).join('')}
        </select>
      </div>
    </div></div>

    ${isChild()?`
    <div><div class="section-label">PIN</div><div class="card">
      <button class="settings-row settings-btn" id="change-pin-btn">
        <span>🔢 Change My PIN</span><span style="color:var(--text-3);">›</span>
      </button>
    </div></div>`:''}

    ${isAdult()?`
    <!-- Notifications -->
    <div><div class="section-label">Notifications</div><div class="card">
      ${togRow('Shopping list sync','n-shopping',prefs.shoppingSync!==false,'When your partner checks off an item')}
      ${togRow('Submission deadline passed','n-deadline',prefs.submissionDeadlinePassed!==false,'When a child misses the soft deadline')}
      ${togRow('All submissions in','n-allsubs',prefs.allSubmissionsIn!==false,'When all kids have submitted picks')}
      ${togRow('Restock suggestions','n-restock',prefs.restockSuggestions!==false,'When a pantry item is running low')}
    </div></div>

    <!-- Household members -->
    <div><div class="section-label">Household Members</div><div class="card">
      ${allUsers.filter(u=>u.isActive).map((u,i,arr)=>`
        <div class="settings-row">
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="mini-avatar" style="background:${ab(u.displayName)};width:32px;height:32px;font-size:11px;">${ini(u.displayName)}</div>
            <div><div style="font-size:14px;font-weight:600;">${u.displayName}</div>
            <div style="font-size:11px;color:var(--text-3);">${u.role==='adult'?u.email||'Adult':'Kid · PIN protected'}</div></div>
          </div>
          ${u.role==='child'?`<button class="btn-ghost" style="font-size:12px;padding:6px 10px;" data-reset-pin="${u.id}" data-name="${u.displayName}">Reset PIN</button>`:''}
        </div>
        ${i<arr.length-1?'<div class="settings-divider"></div>':''}`).join('')}
    </div></div>

    <!-- Cycle settings -->
    <div><div class="section-label">Cycle Settings</div><div class="card">
      <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:6px;">
        <div class="form-label">Submission reminder (cycle day)</div>
        <select class="form-input" id="reminder-day">
          ${[1,2,3,4,5].map(d=>`<option value="${d}" ${(settings?.submissionReminderDay||2)===d?'selected':''}>${d===1?'Day 1 (cycle start)':'Day '+d}</option>`).join('')}
        </select>
      </div>
      <div class="settings-divider"></div>
      <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:6px;">
        <div class="form-label">Soft deadline (cycle day)</div>
        <select class="form-input" id="deadline-day">
          ${[3,4,5,6].map(d=>`<option value="${d}" ${(settings?.submissionDeadlineDay||5)===d?'selected':''}>${'Day '+d}</option>`).join('')}
        </select>
      </div>
    </div></div>`:''}

    <!-- App info + sign out -->
    <div><div class="section-label">App</div><div class="card">
      <div class="settings-row">
        <span style="font-size:14px;color:var(--text-3);">What's for Dinner?</span>
        <span style="font-size:13px;color:var(--text-3);">v0.1.0</span>
      </div>
      <div class="settings-divider"></div>
      <button class="settings-row settings-btn" id="signout-btn" style="color:var(--alert);">
        <span>Sign Out</span><span style="color:var(--text-3);">›</span>
      </button>
    </div></div>`;

  // Palette
  document.getElementById('palette-sel')?.addEventListener('change',async e=>{
    const p=e.target.value;applyPalette(p);await updateUserPalette(currentUser.id,p);if(currentUser)currentUser.palette=p;
  });

  // Notification toggles
  [['n-shopping','shoppingSync'],['n-deadline','submissionDeadlinePassed'],['n-allsubs','allSubmissionsIn'],['n-restock','restockSuggestions']].forEach(([id,key])=>{
    document.getElementById(id)?.addEventListener('change',async e=>{
      const p={...currentUser?.notificationPrefs||{}};p[key]=e.target.checked;
      await updateNotificationPrefs(currentUser.id,p);if(currentUser)currentUser.notificationPrefs=p;
    });
  });

  // Cycle settings
  document.getElementById('reminder-day')?.addEventListener('change',async e=>{await setHouseholdSettings({submissionReminderDay:parseInt(e.target.value)});});
  document.getElementById('deadline-day')?.addEventListener('change',async e=>{await setHouseholdSettings({submissionDeadlineDay:parseInt(e.target.value)});});

  // Reset child PINs
  document.querySelectorAll('[data-reset-pin]').forEach(btn=>{
    btn.addEventListener('click',()=>showPinReset({id:btn.dataset.resetPin,displayName:btn.dataset.name}));
  });

  // Kid change own PIN
  document.getElementById('change-pin-btn')?.addEventListener('click',()=>showPinReset(currentUser));

  // Sign out
  document.getElementById('signout-btn')?.addEventListener('click',async()=>{clearCurrentUser();await signOut();navigate('/login');});
}

function togRow(label,id,checked,sub){
  return `<div class="settings-row"><div>
    <div style="font-size:14px;font-weight:500;">${label}</div>
    <div style="font-size:11px;color:var(--text-3);">${sub}</div>
  </div>
  <label class="toggle"><input type="checkbox" id="${id}" ${checked?'checked':''}><div class="toggle-track"></div><div class="toggle-thumb"></div></label>
  </div><div class="settings-divider"></div>`;
}

function showPinReset(user){
  let pin='';
  const ov=document.createElement('div');ov.className='modal-overlay';
  ov.innerHTML=`
    <div class="bottom-sheet" style="text-align:center;">
      <div class="sheet-handle"></div>
      <div style="padding:20px;">
        <div style="font-size:18px;font-weight:800;margin-bottom:6px;">New PIN for ${user.displayName}</div>
        <div style="font-size:13px;color:var(--text-3);margin-bottom:20px;">Enter a 4-digit PIN</div>
        <div class="pin-dots" style="justify-content:center;" id="new-dots">
          ${[0,1,2,3].map(i=>`<div class="pin-dot" data-index="${i}"></div>`).join('')}
        </div>
        <div id="pin-err" class="form-error hidden" style="margin:12px 0 0;text-align:left;"></div>
        <div class="pin-pad" style="margin:16px auto;">
          ${[1,2,3,4,5,6,7,8,9].map(n=>`<button class="pin-key" data-digit="${n}">${n}</button>`).join('')}
          <button class="pin-key pin-key-del" id="new-del">⌫</button>
          <button class="pin-key" data-digit="0">0</button>
          <button class="pin-key pin-key-hidden"></button>
        </div>
        <div id="pin-saving" class="hidden" style="font-size:13px;color:var(--text-3);margin-bottom:10px;">Saving…</div>
        <button class="btn-ghost btn-full" id="cancel-pin">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
  document.getElementById('cancel-pin')?.addEventListener('click',()=>ov.remove());

  function updDots(){ov.querySelectorAll('.pin-dot').forEach((d,i)=>d.classList.toggle('filled',i<pin.length));}

  ov.querySelectorAll('.pin-key[data-digit]').forEach(k=>{
    k.addEventListener('click',async()=>{
      if(pin.length>=4)return;pin+=k.dataset.digit;updDots();
      if(pin.length===4){
        ov.querySelector('#pin-saving').classList.remove('hidden');
        try{const hash=await hashPin(pin,user.id);await updateChildPin(user.id,hash);ov.remove();alert(`PIN updated for ${user.displayName}!`);}
        catch(e){const err=ov.querySelector('#pin-err');err.textContent='Failed: '+e.message;err.classList.remove('hidden');ov.querySelector('#pin-saving').classList.add('hidden');pin='';updDots();}
      }
    });
  });
  document.getElementById('new-del')?.addEventListener('click',()=>{pin=pin.slice(0,-1);updDots();});
  updDots();
}

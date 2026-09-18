// js/screens/settings.js — Settings (adults; simplified version for kids)
import { currentUser, isAdult, isChild, applyPalette } from '../state.js';
import { navigate } from '../router.js';
import { getAllUsers, getHouseholdSettings, setHouseholdSettings, updateUserPalette, updateChildPin, updateNotificationPrefs } from '../db.js';
import { hashPin } from '../utils.js';
import { signOut } from '../auth.js';
import { clearCurrentUser } from '../state.js';
import {
  updateDoc, doc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from '../firebase.js';
import { COLLECTIONS, PALETTES } from '../config.js';

const AVATAR_COLORS = { Owen:'#495057', Hanna:'#2B6940', Jack:'#1864AB', Otto:'#C1440E', Ella:'#6A0DAD' };
const PALETTE_LABELS = { slate:'Slate (Default)', obsidian:'Obsidian (Dark)', azure:'Azure (Blue)', sage:'Sage (Green)', terracotta:'Terracotta (Warm)', violet:'Violet (Bold)' };
function avatarBg(n){ return AVATAR_COLORS[n]||'#868E96'; }
function initials(n){ return n?n.slice(0,2).toUpperCase():'??'; }

export async function renderSettings(params, container) {
  container.innerHTML = `
    <div class="screen" id="settings-screen">
      <div class="app-header">
        <button class="panel-back" onclick="navigate('/dashboard')" style="font-size:16px;font-weight:600;color:var(--primary);">‹ Back</button>
        <div class="app-wordmark">Settings</div>
        <div class="avatar" style="background:${avatarBg(currentUser?.displayName)};color:#fff;">${initials(currentUser?.displayName)}</div>
      </div>
      <div class="screen-scroll">
        <div class="screen-content" id="settings-content">
          <div style="display:flex;justify-content:center;padding:40px;"><div class="spinner"></div></div>
        </div>
      </div>
    </div>`;

  const [allUsers, settings] = await Promise.all([getAllUsers(), getHouseholdSettings()]);
  renderSettingsContent(allUsers, settings);
}

function renderSettingsContent(allUsers, settings) {
  const content = document.getElementById('settings-content');
  if (!content) return;

  // ── Account section ──
  const paletteOptions = PALETTES.map(p=>`<option value="${p}" ${currentUser?.palette===p?'selected':''}>${PALETTE_LABELS[p]||p}</option>`).join('');

  let html = `
    <!-- Account -->
    <div>
      <div class="section-label">Account</div>
      <div class="card" style="overflow:visible;">
        <div class="settings-row">
          <div class="avatar" style="background:${avatarBg(currentUser?.displayName)};color:#fff;width:48px;height:48px;font-size:16px;">${initials(currentUser?.displayName)}</div>
          <div>
            <div style="font-size:16px;font-weight:700;">${currentUser?.displayName}</div>
            <div style="font-size:13px;color:var(--text-3);">${currentUser?.role==='adult'?currentUser?.email||'Adult account':'Kid account'}</div>
          </div>
        </div>
        <div class="settings-divider"></div>
        <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:6px;">
          <div class="form-label">Color Palette</div>
          <select class="form-input" id="palette-select">${paletteOptions}</select>
        </div>
      </div>
    </div>`;

  if (isChild()) {
    // ── Kid: Change PIN ──
    html += `
      <div>
        <div class="section-label">PIN</div>
        <div class="card">
          <button class="settings-row settings-btn" id="change-pin-btn">
            <span>🔢 Change My PIN</span>
            <span style="color:var(--text-3);">›</span>
          </button>
        </div>
      </div>`;
  }

  if (isAdult()) {
    // ── Notifications ──
    const prefs = currentUser?.notificationPrefs || {};
    html += `
      <div>
        <div class="section-label">Notifications</div>
        <div class="card">
          ${buildToggleRow('Shopping list sync','notif-shopping',prefs.shoppingSync!==false,'When your partner checks off an item')}
          ${buildToggleRow('Submission deadline passed','notif-deadline',prefs.submissionDeadlinePassed!==false,'When a child misses the soft deadline')}
          ${buildToggleRow('All submissions in','notif-allsubs',prefs.allSubmissionsIn!==false,'When all kids have submitted their picks')}
          ${buildToggleRow('Restock suggestions','notif-restock',prefs.restockSuggestions!==false,'When a pantry item is running low')}
        </div>
      </div>`;

    // ── Household Management ──
    const children = allUsers.filter(u=>u.role==='child'&&u.isActive);
    html += `
      <div>
        <div class="section-label">Household Members</div>
        <div class="card">
          ${allUsers.filter(u=>u.isActive).map(u=>`
            <div class="settings-row">
              <div style="display:flex;align-items:center;gap:10px;">
                <div class="mini-avatar" style="background:${avatarBg(u.displayName)};width:32px;height:32px;font-size:11px;">${initials(u.displayName)}</div>
                <div>
                  <div style="font-size:14px;font-weight:600;">${u.displayName}</div>
                  <div style="font-size:11px;color:var(--text-3);">${u.role==='adult'?u.email||'Adult':'Kid · PIN protected'}</div>
                </div>
              </div>
              ${u.role==='child' ? `<button class="btn-ghost" style="font-size:12px;padding:6px 10px;" data-uid="${u.id}" data-name="${u.displayName}" id="reset-pin-${u.id}">Reset PIN</button>` : ''}
            </div>`).join('<div class="settings-divider"></div>')}
        </div>
      </div>`;

    // ── Cycle Settings ──
    html += `
      <div>
        <div class="section-label">Cycle Settings</div>
        <div class="card" style="overflow:visible;">
          <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:6px;">
            <div class="form-label">Submission reminder (cycle day)</div>
            <select class="form-input" id="reminder-day-select">
              ${[1,2,3,4,5].map(d=>`<option value="${d}" ${(settings?.submissionReminderDay||2)===d?'selected':''}>${d===1?'Day 1 (cycle start)':'Day '+d}</option>`).join('')}
            </select>
          </div>
          <div class="settings-divider"></div>
          <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:6px;">
            <div class="form-label">Submission soft deadline (cycle day)</div>
            <select class="form-input" id="deadline-day-select">
              ${[3,4,5,6].map(d=>`<option value="${d}" ${(settings?.submissionDeadlineDay||5)===d?'selected':''}>${'Day '+d}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>`;

    // ── Night 4 Turn Order ──
    const adults   = allUsers.filter(u=>u.role==='adult'&&u.isActive);
    const turnOrder= settings?.night4TurnOrder||adults.map(u=>u.id);
    const nextTurn = adults.find(u=>u.id===turnOrder[((settings?.night4CurrentIndex||0))%turnOrder.length]);
    html += `
      <div>
        <div class="section-label">Adult Night Turn Order</div>
        <div class="card">
          <div class="settings-row">
            <div style="font-size:14px;color:var(--text);">Next adult night</div>
            <div style="font-weight:700;color:var(--primary);">${nextTurn?.displayName||'?'}'s turn</div>
          </div>
          <div class="settings-divider"></div>
          <div class="settings-row">
            <div style="font-size:13px;color:var(--text-3);">Rotation order: ${turnOrder.map(id=>adults.find(u=>u.id===id)?.displayName||id).join(' → ')}</div>
          </div>
        </div>
      </div>`;
  }

  // ── App Info & Sign Out ──
  html += `
    <div>
      <div class="section-label">App</div>
      <div class="card">
        <div class="settings-row">
          <span style="font-size:14px;color:var(--text-3);">What's for Dinner?</span>
          <span style="font-size:13px;color:var(--text-3);">v0.1.0</span>
        </div>
        <div class="settings-divider"></div>
        <button class="settings-row settings-btn" id="sign-out-btn" style="color:var(--alert);">
          <span>Sign Out</span>
          <span style="color:var(--text-3);">›</span>
        </button>
      </div>
    </div>
  `;

  content.innerHTML = html;
  bindSettingsEvents(allUsers, settings);
}

function buildToggleRow(label, id, checked, sub='') {
  return `
    <div class="settings-row">
      <div>
        <div style="font-size:14px;font-weight:500;">${label}</div>
        ${sub?`<div style="font-size:11px;color:var(--text-3);">${sub}</div>`:''}
      </div>
      <label class="toggle">
        <input type="checkbox" id="${id}" ${checked?'checked':''} />
        <div class="toggle-track"></div><div class="toggle-thumb"></div>
      </label>
    </div>
    <div class="settings-divider"></div>`;
}

function bindSettingsEvents(allUsers, settings) {
  // Palette
  document.getElementById('palette-select')?.addEventListener('change', async e=>{
    const p=e.target.value;
    applyPalette(p);
    await updateUserPalette(currentUser.id, p);
    currentUser.palette=p;
  });

  // Notification toggles (adults)
  ['shopping','deadline','allsubs','restock'].forEach(key=>{
    const el=document.getElementById(`notif-${key}`);
    if(!el) return;
    el.addEventListener('change', async ()=>{
      const prefs={...currentUser?.notificationPrefs||{}};
      const map={shopping:'shoppingSync',deadline:'submissionDeadlinePassed',allsubs:'allSubmissionsIn',restock:'restockSuggestions'};
      prefs[map[key]]=el.checked;
      await updateNotificationPrefs(currentUser.id,prefs);
      if(currentUser) currentUser.notificationPrefs=prefs;
    });
  });

  // Cycle settings
  document.getElementById('reminder-day-select')?.addEventListener('change', async e=>{
    await setHouseholdSettings({submissionReminderDay:parseInt(e.target.value)});
  });
  document.getElementById('deadline-day-select')?.addEventListener('change', async e=>{
    await setHouseholdSettings({submissionDeadlineDay:parseInt(e.target.value)});
  });

  // Reset child PINs
  allUsers.filter(u=>u.role==='child').forEach(u=>{
    document.getElementById(`reset-pin-${u.id}`)?.addEventListener('click', ()=>showResetPinDialog(u));
  });

  // Kid change own PIN
  document.getElementById('change-pin-btn')?.addEventListener('click', ()=>showResetPinDialog(currentUser));

  // Sign out
  document.getElementById('sign-out-btn')?.addEventListener('click', async ()=>{
    clearCurrentUser();
    await signOut();
    navigate('/login');
  });
}

function showResetPinDialog(user) {
  let pin='';
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <div style="padding:20px;text-align:center;">
        <div style="font-size:18px;font-weight:800;margin-bottom:6px;">New PIN for ${user.displayName}</div>
        <div style="font-size:13px;color:var(--text-3);margin-bottom:20px;">Enter a new 4-digit PIN</div>
        <div class="pin-dots" style="justify-content:center;" id="new-pin-dots">
          ${[0,1,2,3].map(i=>`<div class="pin-dot" data-index="${i}"></div>`).join('')}
        </div>
        <div id="pin-err" class="form-error hidden" style="margin:12px 0 0;text-align:left;"></div>
        <div class="pin-pad" style="margin:16px auto;">
          ${[1,2,3,4,5,6,7,8,9].map(n=>`<button class="pin-key" data-digit="${n}">${n}</button>`).join('')}
          <button class="pin-key pin-key-del" id="new-pin-del">⌫</button>
          <button class="pin-key" data-digit="0">0</button>
          <button class="pin-key pin-key-hidden"></button>
        </div>
        <div id="pin-saving" class="hidden" style="font-size:13px;color:var(--text-3);">Saving…</div>
        <button class="btn-ghost btn-full" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{ if(e.target===overlay) overlay.remove(); });

  function updateDots(){
    overlay.querySelectorAll('.pin-dot').forEach((d,i)=>d.classList.toggle('filled',i<pin.length));
  }

  overlay.querySelectorAll('.pin-key[data-digit]').forEach(k=>{
    k.addEventListener('click',async ()=>{
      if(pin.length>=4) return;
      pin+=k.dataset.digit;
      updateDots();
      if(pin.length===4){
        overlay.querySelector('#pin-saving').classList.remove('hidden');
        try{
          const hash=await hashPin(pin,user.id);
          await updateChildPin(user.id,hash);
          overlay.remove();
          alert(`PIN updated for ${user.displayName}!`);
        }catch(err){
          console.error(err);
          const errEl=overlay.querySelector('#pin-err');
          errEl.textContent='Failed to save. Try again.';
          errEl.classList.remove('hidden');
          overlay.querySelector('#pin-saving').classList.add('hidden');
          pin=''; updateDots();
        }
      }
    });
  });

  document.getElementById('new-pin-del')?.addEventListener('click',()=>{ pin=pin.slice(0,-1); updateDots(); });
  updateDots();
}

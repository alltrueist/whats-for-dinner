// js/screens/submission.js — Kid meal submission
import { currentUser } from '../state.js';
import { navigate } from '../router.js';
import { getAllUsers, getHouseholdSettings } from '../db.js';
import { getPlanningCycle } from '../cycles.js';
import { formatDate } from '../utils.js';
import { doc, updateDoc, getDocs, query, where, collection } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from '../firebase.js';
import { COLLECTIONS } from '../config.js';

const EMOJIS=['🍝','🌮','🍕','🍔','🍗','🥩','🥗','🍜','🥪','🍱','🫕','🥘','🍲','🌯','🫔'];
const emoji=t=>{const h=[...t].reduce((a,c)=>a+c.charCodeAt(0),0);return EMOJIS[h%EMOJIS.length];};
const AC={Owen:'#495057',Hanna:'#2B6940',Jack:'#1864AB',Otto:'#C1440E',Ella:'#6A0DAD'};
const ab=n=>AC[n]||'#868E96';const ini=n=>n?n.slice(0,2).toUpperCase():'??';

let _cycle=null,_meals=[],_picks=[],_settings=null,_users=[];

export async function renderSubmission(params,container){
  container.innerHTML=`
    <div class="screen">
      <div class="app-header">
        <div class="app-wordmark">What's for Dinner?</div>
        <div class="avatar" style="background:${ab(currentUser?.displayName)};color:#fff;">${ini(currentUser?.displayName)}</div>
      </div>
      <div id="sub-body" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div style="display:flex;justify-content:center;align-items:center;flex:1;"><div class="spinner"></div></div>
      </div>
    </div>`;

  try{
    [_settings,_users,_cycle]=await Promise.all([getHouseholdSettings(),getAllUsers(),getPlanningCycle()]);
    _meals=await getMyMeals();
    if(!_cycle){renderNoActive();return;}
    const existing=(_cycle.submissions||{})[currentUser?.id]||[];
    if(existing.length>0){renderSubmitted(existing);return;}
    renderPicking();
  }catch(e){
    console.error('[Sub]',e);
    document.getElementById('sub-body').innerHTML=`<div class="note note-warn" style="margin:20px;"><span>⚠</span><div>Failed to load: ${e.message}</div></div>`;
  }
}

async function getMyMeals(){
  // Simple single-field where — no composite index needed
  const snap=await getDocs(query(collection(db,COLLECTIONS.MEALS),where('ownerId','==',currentUser?.id)));
  return snap.docs.map(d=>({id:d.id,...d.data()})).filter(m=>m.status==='active'||m.status==='cooldown');
}

function renderNoActive(){
  document.getElementById('sub-body').innerHTML=`
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;padding:40px;text-align:center;">
      <div style="font-size:48px;margin-bottom:16px;">😴</div>
      <div style="font-size:18px;font-weight:800;color:var(--text);margin-bottom:8px;">Nothing to pick yet</div>
      <div style="font-size:14px;color:var(--text-3);margin-bottom:24px;">Owen or Mom will let you know when it's time.</div>
      <button class="btn-primary" id="home-btn">← Go Home</button>
    </div>`;
  document.getElementById('home-btn')?.addEventListener('click',()=>navigate('/dashboard'));
}

function renderSubmitted(picks){
  const body=document.getElementById('sub-body');
  const deadline=_settings?.submissionDeadlineDay||5;
  const start=_cycle?.startDate?.toDate?_cycle.startDate.toDate():new Date((_cycle?.startDate||'')+'T12:00:00');
  const deadlineDate=new Date(start);deadlineDate.setDate(deadlineDate.getDate()+deadline-1);
  const otherKids=_users.filter(u=>u.role==='child'&&u.isActive&&u.id!==currentUser?.id);
  const subs=_cycle?.submissions||{};

  body.innerHTML=`
    <div class="header-strip" style="background:var(--success);">
      <div class="strip-title">Picks submitted! ✓</div>
      <div class="strip-sub">Owen or Mom will finalize everything before shopping day.</div>
    </div>
    <div class="screen-scroll"><div class="screen-content">
      <div class="card">
        <div style="padding:14px 16px;font-size:15px;font-weight:800;">🎉 You're in, ${currentUser?.displayName}!</div>
        <div style="padding:0 16px 14px;font-size:13px;color:var(--text-3);">If your #1 gets vetoed, your #2 moves up automatically.</div>
      </div>
      <div><div class="section-label">Your Picks</div><div class="card">
        ${picks.map((mId,i)=>{
          const m=_meals.find(x=>x.id===mId);
          return `<div class="stat-row" style="padding:12px 14px;">
            <div style="width:26px;height:26px;border-radius:50%;background:${['var(--primary)','#868E96','#ADB5BD'][i]};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0;">${i+1}</div>
            <div class="stat-info"><div class="stat-name">${m?.title||'Unknown meal'}</div><div class="stat-sub">${['1st choice — wins unless vetoed','Backup #1','Backup #2'][i]}</div></div>
            <div style="font-size:20px;">${emoji(m?.title||'')}</div>
          </div>`;
        }).join('<div style="height:1px;background:var(--surface-2);"></div>')}
      </div></div>
      ${otherKids.length?`<div><div class="section-label">Sibling Status</div><div class="card">
        ${otherKids.map(kid=>{
          const has=!!(subs[kid.id]&&subs[kid.id].length);
          return `<div class="stat-row" style="padding:12px 14px;">
            <div class="mini-avatar" style="background:${ab(kid.displayName)};width:28px;height:28px;font-size:10px;">${ini(kid.displayName)}</div>
            <div class="stat-info"><div class="stat-name">${kid.displayName}</div></div>
            <div style="font-size:13px;font-weight:600;color:${has?'var(--success)':'var(--text-3)'};">${has?'✓ Submitted':'⏳ Pending'}</div>
          </div>`;
        }).join('<div style="height:1px;background:var(--surface-2);"></div>')}
      </div></div>`:''}
      <div class="note note-info"><span>ℹ</span><div>You can change picks until <strong>${formatDate(deadlineDate,{weekday:'long',month:'short',day:'numeric'})}</strong>.</div></div>
      <button class="btn-ghost btn-full" id="change-btn">↩ Change my picks</button>
      <button class="btn-primary btn-full" id="home-btn2">← Back to Home</button>
    </div></div>`;
  document.getElementById('change-btn')?.addEventListener('click',()=>{_picks=[];renderPicking();});
  document.getElementById('home-btn2')?.addEventListener('click',()=>navigate('/dashboard'));
}

function renderPicking(){
  const body=document.getElementById('sub-body');
  const deadline=_settings?.submissionDeadlineDay||5;
  const start=_cycle?.startDate?.toDate?_cycle.startDate.toDate():new Date((_cycle?.startDate||'')+'T12:00:00');
  const dld=new Date(start);dld.setDate(dld.getDate()+deadline-1);
  const daysLeft=Math.ceil((dld-new Date())/(1000*60*60*24));
  const urgent=daysLeft<=1;
  const active=_meals.filter(m=>m.status==='active');
  const cooldown=_meals.filter(m=>m.status==='cooldown');

  body.innerHTML=`
    <div class="header-strip">
      <div class="strip-title">Pick your meals, ${currentUser?.displayName}!</div>
      <div class="strip-sub">Tap to rank. Your #1 wins unless vetoed.</div>
      <div class="strip-deadline ${urgent?'urgent':''}">Due ${formatDate(dld,{weekday:'long',month:'short',day:'numeric'})}${urgent?' · TODAY!':''}</div>
    </div>
    <div id="rank-slots-bar" style="background:var(--surface);border-bottom:1px solid var(--border);padding:10px 14px;display:flex;gap:8px;flex-shrink:0;">
      ${[0,1,2].map(i=>slotHTML(i)).join('')}
    </div>
    <div style="padding:8px 14px;background:var(--surface-2);border-bottom:1px solid var(--border);flex-shrink:0;">
      <button class="btn-ghost btn-full" id="surprise-btn" style="font-size:13px;">🎲 Surprise Me — pick randomly</button>
    </div>
    <div class="screen-scroll">
      <div class="meal-pick-grid">
        ${[...active,...cooldown].map(pickCard).join('')}
        ${active.length===0?`<div style="grid-column:1/-1;text-align:center;padding:48px 24px;"><div style="font-size:48px;margin-bottom:12px;">🍽️</div><div style="font-size:15px;color:var(--text-3);">Ask Owen or Mom to add meals!</div></div>`:''}
      </div>
    </div>
    <div style="padding:10px 14px max(16px,env(safe-area-inset-bottom));background:var(--surface);border-top:1px solid var(--border);flex-shrink:0;">
      <button class="btn-primary btn-full" id="submit-btn" ${_picks.length===3?'':'disabled'} style="opacity:${_picks.length===3?1:0.5};">
        Submit Picks (${_picks.length} of 3)
      </button>
      ${_picks.length<3?`<div style="text-align:center;font-size:11px;color:var(--text-3);margin-top:5px;">Choose ${3-_picks.length} more</div>`:''}
    </div>`;

  bindPickingEvents(active);
}

function slotHTML(i){
  const mId=_picks[i];
  const m=mId?_meals.find(x=>x.id===mId):null;
  const labels=['1st','2nd','3rd'];
  if(m) return `<div class="rank-slot rank-slot-filled" id="slot-${i}">
    <div style="font-size:9px;font-weight:700;color:var(--text-3);">${labels[i]}</div>
    <div style="font-size:18px;">${emoji(m.title)}</div>
    <div style="font-size:10px;font-weight:700;color:var(--text);text-align:center;line-height:1.2;">${m.title}</div>
    <div style="font-size:9px;color:var(--alert);cursor:pointer;" data-remove="${i}">tap to remove</div>
  </div>`;
  return `<div class="rank-slot" id="slot-${i}">
    <div style="font-size:9px;font-weight:700;color:var(--text-3);">${labels[i]}</div>
    <div style="font-size:18px;color:var(--border);">○</div>
    <div style="font-size:9px;color:var(--text-3);">tap a meal</div>
  </div>`;
}

function pickCard(meal){
  const cd=meal.status==='cooldown';
  const sel=_picks.includes(meal.id);
  const rank=_picks.indexOf(meal.id);
  const cdDate=meal.cooldownUntil?formatDate(new Date(meal.cooldownUntil+'T12:00:00'),{month:'short',day:'numeric',year:'numeric'}):'';
  return `
    <div class="meal-pick-card-item ${cd?'pick-card-cooldown':''} ${sel?'pick-card-selected':''}" data-pick-meal="${meal.id}" data-cd="${cd}">
      <div class="pick-card-img">
        <div style="font-size:28px;">${emoji(meal.title)}</div>
        ${sel?`<div class="rank-badge-overlay">${rank+1}</div>`:''}
        ${cd?`<div class="cooldown-overlay"><div style="font-size:16px;">⏸</div><div style="font-size:10px;font-weight:800;">Cooldown</div></div>`:''}
      </div>
      <div class="pick-card-body">
        <div class="pick-card-name ${cd?'pick-card-name-dim':''}">${meal.title}</div>
        ${cd?`<div style="font-size:10px;color:var(--alert);">Available ${cdDate}</div>`:`<div class="pick-card-cost">${'$'.repeat(meal.cost||1)}</div>`}
      </div>
    </div>`;
}

function refreshUI(active){
  const bar=document.getElementById('rank-slots-bar');
  if(bar) bar.innerHTML=[0,1,2].map(slotHTML).join('');
  document.querySelectorAll('[data-remove]').forEach(el=>{
    el.addEventListener('click',e=>{e.stopPropagation();_picks.splice(parseInt(el.dataset.remove),1);refreshUI(active);});
  });
  document.querySelectorAll('.meal-pick-card-item').forEach(card=>{
    const mId=card.dataset.pickMeal;
    const rank=_picks.indexOf(mId);
    card.classList.toggle('pick-card-selected',rank>=0);
    const old=card.querySelector('.rank-badge-overlay');if(old)old.remove();
    if(rank>=0){const b=document.createElement('div');b.className='rank-badge-overlay';b.textContent=rank+1;card.querySelector('.pick-card-img')?.appendChild(b);}
  });
  const btn=document.getElementById('submit-btn');
  if(btn){btn.disabled=_picks.length!==3;btn.style.opacity=_picks.length===3?1:0.5;btn.textContent=`Submit Picks (${_picks.length} of 3)`;}
}

function bindPickingEvents(active){
  document.querySelectorAll('[data-remove]').forEach(el=>{
    el.addEventListener('click',e=>{e.stopPropagation();_picks.splice(parseInt(el.dataset.remove),1);refreshUI(active);});
  });
  document.querySelectorAll('.meal-pick-card-item').forEach(card=>{
    card.addEventListener('click',()=>{
      const mId=card.dataset.pickMeal;
      const cd=card.dataset.cd==='true';
      if(cd){const m=_meals.find(x=>x.id===mId);const u=m?.cooldownUntil?formatDate(new Date(m.cooldownUntil+'T12:00:00'),{month:'long',day:'numeric',year:'numeric'}):'soon';alert(`${m?.title} is on cooldown.\nAvailable: ${u}`);return;}
      if(_picks.includes(mId)) _picks=_picks.filter(id=>id!==mId);
      else if(_picks.length<3) _picks.push(mId);
      refreshUI(active);
    });
  });
  document.getElementById('surprise-btn')?.addEventListener('click',()=>{
    const eligible=active.filter(m=>!_picks.includes(m.id));
    if(!eligible.length){alert('No more meals to pick!');return;}
    showSurprise(eligible[Math.floor(Math.random()*eligible.length)],active);
  });
  document.getElementById('submit-btn')?.addEventListener('click',()=>{if(_picks.length===3)showConfirm();});
}

function showSurprise(meal,active){
  const ov=document.createElement('div');ov.className='modal-overlay';
  ov.innerHTML=`
    <div class="bottom-sheet" style="text-align:center;">
      <div class="sheet-handle"></div>
      <div style="background:var(--primary);padding:20px;">
        <div style="font-size:36px;margin-bottom:8px;">🎲</div>
        <div style="font-size:18px;font-weight:800;color:#fff;">Your random pick!</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:4px;">Reroll as many times as you want.</div>
      </div>
      <div style="padding:24px 20px;">
        <div style="font-size:52px;margin-bottom:10px;">${emoji(meal.title)}</div>
        <div style="font-size:22px;font-weight:800;color:var(--text);margin-bottom:20px;">${meal.title}</div>
        <div style="display:flex;gap:10px;">
          <button class="btn-primary" style="flex:1.5;" id="accept-s">✓ I'll take it!</button>
          <button class="btn-ghost" style="flex:1;" id="reroll-s">🎲 Reroll</button>
        </div>
      </div>
      <div style="height:max(16px,env(safe-area-inset-bottom));"></div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
  document.getElementById('accept-s')?.addEventListener('click',()=>{if(_picks.length<3&&!_picks.includes(meal.id))_picks.push(meal.id);ov.remove();refreshUI(active);});
  document.getElementById('reroll-s')?.addEventListener('click',()=>{
    const el=active.filter(m=>!_picks.includes(m.id)&&m.id!==meal.id);
    if(!el.length){alert('No more meals!');return;}
    ov.remove();showSurprise(el[Math.floor(Math.random()*el.length)],active);
  });
}

function showConfirm(){
  const picks=_picks.map(id=>_meals.find(m=>m.id===id)).filter(Boolean);
  const ov=document.createElement('div');ov.className='modal-overlay';
  ov.innerHTML=`
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <div style="padding:16px 20px 10px;border-bottom:1px solid var(--border);">
        <div style="font-size:17px;font-weight:800;color:var(--text);margin-bottom:3px;">Submit these picks?</div>
        <div style="font-size:13px;color:var(--text-3);">Owen or Mom can still adjust before shopping day.</div>
      </div>
      ${picks.map((m,i)=>`
        <div style="display:flex;align-items:center;gap:12px;padding:13px 20px;border-bottom:1px solid var(--border);">
          <div style="width:28px;height:28px;border-radius:50%;background:${['var(--primary)','#868E96','#ADB5BD'][i]};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0;">${i+1}</div>
          <div style="flex:1;"><div style="font-size:14px;font-weight:700;">${m.title}</div><div style="font-size:11px;color:var(--text-3);">${['1st choice','Backup #1','Backup #2'][i]}</div></div>
          <div style="font-size:22px;">${emoji(m.title)}</div>
        </div>`).join('')}
      <div class="note note-info" style="margin:10px 20px;"><span>ℹ</span><div>One veto per cycle — if your #1 gets vetoed, #2 moves up automatically.</div></div>
      <div style="display:flex;gap:8px;padding:10px 20px max(16px,env(safe-area-inset-bottom));">
        <button class="btn-primary" style="flex:1.5;" id="confirm-sub">✓ Submit My Picks</button>
        <button class="btn-ghost" style="flex:1;" id="back-sub">Go Back</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
  document.getElementById('back-sub')?.addEventListener('click',()=>ov.remove());
  document.getElementById('confirm-sub')?.addEventListener('click',async()=>{
    ov.remove();
    try{
      const subs={...(_cycle?.submissions||{})};
      subs[currentUser.id]=_picks;
      await updateDoc(doc(db,COLLECTIONS.CYCLES,_cycle.id),{submissions:subs});
      _cycle.submissions=subs;
      renderSubmitted(_picks);
    }catch(e){alert('Failed to submit: '+e.message);}
  });
}

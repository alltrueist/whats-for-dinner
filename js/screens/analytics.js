// js/screens/analytics.js — Analytics & Stats (all users)
import { currentUser, isAdult, isChild } from '../state.js';
import { navigate } from '../router.js';
import { getAllMeals, getAllUsers } from '../db.js';
import { costSymbol, formatDate } from '../utils.js';
import {
  getDocs, collection, query, where, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from '../firebase.js';
import { COLLECTIONS } from '../config.js';

const AVATAR_COLORS = { Owen:'#495057', Hanna:'#2B6940', Jack:'#1864AB', Otto:'#C1440E', Ella:'#6A0DAD' };
function avatarBg(n){ return AVATAR_COLORS[n]||'#868E96'; }
function initials(n){ return n?n.slice(0,2).toUpperCase():'??'; }

export async function renderAnalytics(params, container) {
  container.innerHTML = `
    <div class="screen" id="analytics-screen">
      <div class="app-header">
        <div class="app-wordmark">${isAdult()?'Analytics':'Stats'}</div>
        <div class="avatar" style="background:${avatarBg(currentUser?.displayName)};color:#fff;">${initials(currentUser?.displayName)}</div>
      </div>
      <div class="screen-scroll">
        <div class="screen-content" id="analytics-content">
          <div style="display:flex;justify-content:center;padding:40px;"><div class="spinner"></div></div>
        </div>
      </div>
      ${buildTabBar()}
    </div>`;
  bindTabBar();
  await loadAnalytics();
}

async function loadAnalytics() {
  const content = document.getElementById('analytics-content');
  try {
    const [allMeals, allUsers, completedCycles] = await Promise.all([
      getAllMeals(),
      getAllUsers(),
      getCompletedCycles()
    ]);
    content.innerHTML = buildAnalyticsContent(allMeals, allUsers, completedCycles);
    bindViewToggle();
  } catch(err){
    console.error(err);
    content.innerHTML=`<div class="note note-warn"><span>⚠</span><div>Failed to load analytics.</div></div>`;
  }
}

async function getCompletedCycles() {
  const q=query(collection(db,COLLECTIONS.CYCLES),where('status','==','complete'),orderBy('startDate','desc'),limit(50));
  return (await getDocs(q)).docs.map(d=>({id:d.id,...d.data()}));
}

function buildAnalyticsContent(meals, users, cycles) {
  // Compute metrics
  const activeUsers  = users.filter(u=>u.isActive);
  const myMeals      = meals.filter(m=>m.ownerId===currentUser?.id);
  const topReacted   = [...meals].sort((a,b)=>(b.reactionCount||0)-(a.reactionCount||0)).slice(0,5);
  const mostSelected = [...meals].filter(m=>m.totalSelections>0).sort((a,b)=>b.totalSelections-a.totalSelections).slice(0,5);
  const cooldowns    = meals.filter(m=>m.status==='cooldown');
  const vetoLog      = cycles.flatMap(c=>c.vetoLog||[]);
  const repickLog    = cycles.flatMap(c=>c.duplicateResolutionLog||[]);
  const cookLog      = cycles.flatMap(c=>(c.nights||[]).filter(n=>n.cookId&&n.selectedMealId));

  // Cook split
  const cookCounts = {};
  cookLog.forEach(n=>{ cookCounts[n.cookId]=(cookCounts[n.cookId]||0)+1; });

  // Veto counts
  const vetoesCast  = {};
  const vetoesRecvd = {};
  vetoLog.forEach(v=>{
    vetoesCast[v.vetoedBy]  =(vetoesCast[v.vetoedBy]||0)+1;
    vetoesRecvd[v.targetUserId]=(vetoesRecvd[v.targetUserId]||0)+1;
  });

  // Re-pick burden
  const repickCounts = {};
  repickLog.forEach(r=>{ repickCounts[r.askedToRepickUserId]=(repickCounts[r.askedToRepickUserId]||0)+1; });

  const sections = [];

  if (isAdult()) {
    // ── Meal Frequency ──
    sections.push(`
      <div>
        <div class="section-label">Most Selected Meals</div>
        <div class="card">
          ${mostSelected.length===0 ? emptyRow('No meals selected yet') : mostSelected.map((m,i)=>{
            const owner=users.find(u=>u.id===m.ownerId);
            return `<div class="stat-row">
              <div class="stat-rank">#${i+1}</div>
              <div class="stat-info"><div class="stat-name">${m.title}</div><div class="stat-sub">${owner?.displayName} · ${costSymbol(m.cost)}</div></div>
              <div class="stat-val">${m.totalSelections}×</div>
            </div>`;
          }).join('')}
        </div>
      </div>`);

    // ── Reaction Leaderboard ──
    sections.push(`
      <div>
        <div class="section-label">Most Loved Meals ❤️</div>
        <div class="card">
          ${topReacted.length===0||topReacted[0].reactionCount===0 ? emptyRow('No reactions yet') : topReacted.map((m,i)=>{
            const owner=users.find(u=>u.id===m.ownerId);
            return `<div class="stat-row">
              <div class="stat-rank">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]||`#${i+1}`}</div>
              <div class="stat-info"><div class="stat-name">${m.title}</div><div class="stat-sub">${owner?.displayName}</div></div>
              <div class="stat-val">❤️ ${m.reactionCount||0}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`);

    // ── Cook Split ──
    sections.push(`
      <div>
        <div class="section-label">Who's Been Cooking</div>
        <div class="card">
          ${Object.keys(cookCounts).length===0 ? emptyRow('No completed cycles yet') :
            Object.entries(cookCounts).sort((a,b)=>b[1]-a[1]).map(([uid,count])=>{
              const u=users.find(x=>x.id===uid);
              const total=cookLog.length;
              const pct=Math.round((count/total)*100);
              return `<div class="stat-row">
                <div class="mini-avatar" style="background:${avatarBg(u?.displayName)};width:28px;height:28px;font-size:10px;">${initials(u?.displayName)}</div>
                <div class="stat-info"><div class="stat-name">${u?.displayName||uid}</div>
                  <div style="margin-top:4px;height:6px;background:var(--surface-2);border-radius:3px;overflow:hidden;">
                    <div style="width:${pct}%;height:100%;background:var(--primary);border-radius:3px;"></div>
                  </div>
                </div>
                <div class="stat-val">${count} nights (${pct}%)</div>
              </div>`;
            }).join('')}
        </div>
      </div>`);

    // ── Veto Stats ──
    sections.push(`
      <div>
        <div class="section-label">Veto History</div>
        <div class="card">
          ${vetoLog.length===0 ? emptyRow('No vetoes cast yet') :
            activeUsers.map(u=>{
              const cast=vetoesCast[u.id]||0;
              const recv=vetoesRecvd[u.id]||0;
              return `<div class="stat-row">
                <div class="mini-avatar" style="background:${avatarBg(u.displayName)};width:28px;height:28px;font-size:10px;">${initials(u.displayName)}</div>
                <div class="stat-info"><div class="stat-name">${u.displayName}</div><div class="stat-sub">Vetoes cast: ${cast} · Received: ${recv}</div></div>
              </div>`;
            }).join('')}
        </div>
      </div>`);

    // ── Re-pick Burden ──
    if (repickLog.length>0) {
      sections.push(`
        <div>
          <div class="section-label">Re-pick Burden</div>
          <div class="note note-info" style="margin-bottom:6px;"><span>ℹ</span><div>How often each person has been asked to re-pick due to a duplicate meal conflict.</div></div>
          <div class="card">
            ${Object.entries(repickCounts).sort((a,b)=>b[1]-a[1]).map(([uid,count])=>{
              const u=users.find(x=>x.id===uid);
              return `<div class="stat-row">
                <div class="mini-avatar" style="background:${avatarBg(u?.displayName)};width:28px;height:28px;font-size:10px;">${initials(u?.displayName)}</div>
                <div class="stat-info"><div class="stat-name">${u?.displayName||uid}</div></div>
                <div class="stat-val">${count}×</div>
              </div>`;
            }).join('')}
          </div>
        </div>`);
    }

    // ── Cooldowns ──
    if (cooldowns.length>0) {
      sections.push(`
        <div>
          <div class="section-label">Current Cooldowns ⏸</div>
          <div class="card">
            ${cooldowns.map(m=>{
              const owner=users.find(u=>u.id===m.ownerId);
              const until=m.cooldownUntil?formatDate(new Date(m.cooldownUntil+'T12:00:00'),{month:'short',day:'numeric',year:'numeric'}):'?';
              return `<div class="stat-row">
                <div class="stat-info"><div class="stat-name">${m.title}</div><div class="stat-sub">${owner?.displayName} · ${costSymbol(m.cost)}</div></div>
                <div class="stat-val" style="color:var(--alert);">Until ${until}</div>
              </div>`;
            }).join('')}
          </div>
        </div>`);
    }
  }

  // ── Kid / shared section: My Meals ──
  sections.push(`
    <div>
      <div class="section-label">${isAdult()?'All Meals Summary':'My Meals'}</div>
      <div class="card">
        ${(isAdult()?meals:myMeals).filter(m=>m.totalSelections>0).sort((a,b)=>b.totalSelections-a.totalSelections).map(m=>{
          const owner=users.find(u=>u.id===m.ownerId);
          return `<div class="stat-row">
            <div class="stat-info"><div class="stat-name">${m.title}</div><div class="stat-sub">${isAdult()?owner?.displayName+' · ':'' }${costSymbol(m.cost)} · ${m.status}</div></div>
            <div class="stat-val">${m.totalSelections}× selected</div>
          </div>`;
        }).join('') || emptyRow('No meals selected yet')}
      </div>
    </div>`);

  // ── Household Favorites (kids always see this) ──
  sections.push(`
    <div>
      <div class="section-label">Household Favorites</div>
      <div class="card">
        ${topReacted.filter(m=>m.reactionCount>0).map((m,i)=>{
          const owner=users.find(u=>u.id===m.ownerId);
          return `<div class="stat-row">
            <div class="stat-rank">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</div>
            <div class="stat-info"><div class="stat-name">${m.title}</div><div class="stat-sub">${owner?.displayName}</div></div>
            <div class="stat-val">❤️ ${m.reactionCount}</div>
          </div>`;
        }).join('') || emptyRow('No reactions yet — go love some meals!')}
      </div>
    </div>`);

  return sections.join('');
}

function emptyRow(msg) {
  return `<div style="padding:16px;text-align:center;color:var(--text-3);font-size:14px;">${msg}</div>`;
}

function bindViewToggle() {}

function buildTabBar() {
  if(isChild()){
    return `<nav class="tab-bar">
      <button class="tab-item" data-route="/dashboard"><span class="tab-icon">🏠</span><span class="tab-label">Home</span></button>
      <button class="tab-item" data-route="/meals"><span class="tab-icon">🍽️</span><span class="tab-label">My Meals</span></button>
      <button class="tab-item" data-route="/calendar"><span class="tab-icon">📆</span><span class="tab-label">Calendar</span></button>
      <button class="tab-item active" data-route="/analytics"><span class="tab-icon">📊</span><span class="tab-label">Stats</span><div class="tab-dot"></div></button>
    </nav>`;
  }
  return `<nav class="tab-bar">
    <button class="tab-item" data-route="/dashboard"><span class="tab-icon">🏠</span><span class="tab-label">Home</span></button>
    <button class="tab-item" data-route="/planner"><span class="tab-icon">📅</span><span class="tab-label">Planner</span></button>
    <button class="tab-item" data-route="/meals"><span class="tab-icon">🍽️</span><span class="tab-label">Meals</span></button>
    <button class="tab-item" data-route="/shopping"><span class="tab-icon">🛒</span><span class="tab-label">Shopping</span></button>
    <button class="tab-item active" data-route="/analytics"><span class="tab-icon">📊</span><span class="tab-label">Stats</span><div class="tab-dot"></div></button>
  </nav>`;
}

function bindTabBar() {
  document.querySelectorAll('.tab-item[data-route]').forEach(btn=>{
    btn.addEventListener('click',()=>navigate(btn.dataset.route));
  });
}

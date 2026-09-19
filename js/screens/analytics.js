// js/screens/analytics.js
import { currentUser, isAdult, isChild } from '../state.js';
import { navigate } from '../router.js';
import { getAllMeals, getAllUsers } from '../db.js';
import { getCompletedCycles } from '../cycles.js';
import { costSymbol, formatDate } from '../utils.js';

const AC={Owen:'#495057',Hanna:'#2B6940',Jack:'#1864AB',Otto:'#C1440E',Ella:'#6A0DAD'};
const ab=n=>AC[n]||'#868E96';
const ini=n=>n?n.slice(0,2).toUpperCase():'??';

export async function renderAnalytics(params,container) {
  container.innerHTML=`
    <div class="screen">
      <div class="app-header">
        <div class="app-wordmark">${isAdult()?'Analytics':'Stats'}</div>
        <div class="avatar" style="background:${ab(currentUser?.displayName)};color:#fff;">${ini(currentUser?.displayName)}</div>
      </div>
      <div class="screen-scroll"><div class="screen-content" id="analytics-content">
        <div style="display:flex;justify-content:center;padding:40px;"><div class="spinner"></div></div>
      </div></div>
      ${buildTabBar()}
    </div>`;
  bindTabBar();
  await load();
}

async function load(){
  const content=document.getElementById('analytics-content');
  try{
    const [meals,users,cycles]=await Promise.all([getAllMeals(),getAllUsers(),getCompletedCycles()]);
    content.innerHTML=build(meals,users,cycles);
  }catch(e){
    console.error('[Analytics]',e);
    content.innerHTML=`<div class="note note-warn"><span>⚠</span><div>Failed to load: ${e.message}</div></div>`;
  }
}

function build(meals,users,cycles){
  const myMeals=meals.filter(m=>m.ownerId===currentUser?.id);
  const top5React=[...meals].sort((a,b)=>(b.reactionCount||0)-(a.reactionCount||0)).slice(0,5);
  const top5Sel=[...meals].filter(m=>m.totalSelections>0).sort((a,b)=>b.totalSelections-a.totalSelections).slice(0,5);
  const cooldowns=meals.filter(m=>m.status==='cooldown');
  const vetoLog=cycles.flatMap(c=>c.vetoLog||[]);
  const repickLog=cycles.flatMap(c=>c.duplicateResolutionLog||[]);
  const cookLog=cycles.flatMap(c=>(c.nights||[]).filter(n=>n.cookId&&n.selectedMealId));

  const cookCounts={};cookLog.forEach(n=>{cookCounts[n.cookId]=(cookCounts[n.cookId]||0)+1;});
  const vetoesCast={},vetoesRecvd={};
  vetoLog.forEach(v=>{vetoesCast[v.vetoedBy]=(vetoesCast[v.vetoedBy]||0)+1;vetoesRecvd[v.targetUserId]=(vetoesRecvd[v.targetUserId]||0)+1;});
  const repickCounts={};repickLog.forEach(r=>{repickCounts[r.askedToRepickUserId]=(repickCounts[r.askedToRepickUserId]||0)+1;});

  const sections=[];

  if(isAdult()){
    sections.push(statCard('Most Selected Meals',top5Sel.length?top5Sel.map((m,i)=>{
      const o=users.find(u=>u.id===m.ownerId);
      return statRow(`#${i+1}`,m.title,`${o?.displayName} · ${costSymbol(m.cost)}`,`${m.totalSelections}×`);
    }):['<div class="stat-empty">No meals selected yet</div>']));

    sections.push(statCard('Most Loved Meals ❤️',top5React.filter(m=>m.reactionCount>0).length?
      top5React.filter(m=>m.reactionCount>0).map((m,i)=>{
        const o=users.find(u=>u.id===m.ownerId);
        return statRow(['🥇','🥈','🥉','4️⃣','5️⃣'][i],m.title,o?.displayName,`❤️ ${m.reactionCount}`);
      }):['<div class="stat-empty">No reactions yet</div>']));

    if(Object.keys(cookCounts).length){
      const total=cookLog.length;
      sections.push(statCard('Who\'s Been Cooking',
        Object.entries(cookCounts).sort((a,b)=>b[1]-a[1]).map(([uid,count])=>{
          const u=users.find(x=>x.id===uid);
          const pct=Math.round(count/total*100);
          return `<div class="stat-row">
            <div class="mini-avatar" style="background:${ab(u?.displayName)};width:28px;height:28px;font-size:10px;">${ini(u?.displayName)}</div>
            <div class="stat-info"><div class="stat-name">${u?.displayName||uid}</div>
              <div style="margin-top:4px;height:6px;background:var(--surface-2);border-radius:3px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:var(--primary);border-radius:3px;"></div>
              </div>
            </div>
            <div class="stat-val">${count} nights</div>
          </div>`;
        })));
    }

    sections.push(statCard('Veto History',
      vetoLog.length?users.filter(u=>u.isActive).map(u=>{
        const cast=vetoesCast[u.id]||0;const recv=vetoesRecvd[u.id]||0;
        return `<div class="stat-row">
          <div class="mini-avatar" style="background:${ab(u.displayName)};width:28px;height:28px;font-size:10px;">${ini(u.displayName)}</div>
          <div class="stat-info"><div class="stat-name">${u.displayName}</div><div class="stat-sub">Cast: ${cast} · Received: ${recv}</div></div>
        </div>`;
      }):['<div class="stat-empty">No vetoes yet</div>']));

    if(cooldowns.length){
      sections.push(statCard('Currently on Cooldown ⏸',cooldowns.map(m=>{
        const o=users.find(u=>u.id===m.ownerId);
        const until=m.cooldownUntil?formatDate(new Date(m.cooldownUntil+'T12:00:00'),{month:'short',day:'numeric',year:'numeric'}):'?';
        return statRow(costSymbol(m.cost),m.title,o?.displayName,`Until ${until}`,'var(--alert)');
      })));
    }
  }

  // Meals summary (both roles)
  const mealList=isAdult()?meals:myMeals;
  sections.push(statCard(isAdult()?'All Meals':'My Meals',
    mealList.filter(m=>m.totalSelections>0).sort((a,b)=>b.totalSelections-a.totalSelections).map(m=>{
      const o=users.find(u=>u.id===m.ownerId);
      return statRow(costSymbol(m.cost),m.title,isAdult()?o?.displayName:m.status,`${m.totalSelections}× selected`);
    })||['<div class="stat-empty">No meals selected yet</div>']));

  // Household favorites (both roles)
  sections.push(statCard('Household Favorites',
    top5React.filter(m=>m.reactionCount>0).map((m,i)=>{
      const o=users.find(u=>u.id===m.ownerId);
      return statRow(['🥇','🥈','🥉','4️⃣','5️⃣'][i],m.title,o?.displayName,`❤️ ${m.reactionCount}`);
    })||['<div class="stat-empty">No reactions yet — go love some meals!</div>']));

  return sections.join('');
}

function statCard(title,rows){
  return `<div><div class="section-label">${title}</div><div class="card">${rows.join('')}</div></div>`;
}
function statRow(rank,name,sub,val,valColor='var(--text-2)'){
  return `<div class="stat-row">
    <div class="stat-rank">${rank}</div>
    <div class="stat-info"><div class="stat-name">${name}</div>${sub?`<div class="stat-sub">${sub}</div>`:''}  </div>
    <div class="stat-val" style="color:${valColor};">${val}</div>
  </div>`;
}

function buildTabBar(){
  if(isChild())return`<nav class="tab-bar">
    <button class="tab-item" data-route="/dashboard"><span class="tab-icon">🏠</span><span class="tab-label">Home</span></button>
    <button class="tab-item" data-route="/meals"><span class="tab-icon">🍽️</span><span class="tab-label">My Meals</span></button>
    <button class="tab-item" data-route="/calendar"><span class="tab-icon">📆</span><span class="tab-label">Calendar</span></button>
    <button class="tab-item active" data-route="/analytics"><span class="tab-icon">📊</span><span class="tab-label">Stats</span><div class="tab-dot"></div></button>
  </nav>`;
  return`<nav class="tab-bar">
    <button class="tab-item" data-route="/dashboard"><span class="tab-icon">🏠</span><span class="tab-label">Home</span></button>
    <button class="tab-item" data-route="/planner"><span class="tab-icon">📅</span><span class="tab-label">Planner</span></button>
    <button class="tab-item" data-route="/meals"><span class="tab-icon">🍽️</span><span class="tab-label">Meals</span></button>
    <button class="tab-item" data-route="/shopping"><span class="tab-icon">🛒</span><span class="tab-label">Shopping</span></button>
    <button class="tab-item active" data-route="/analytics"><span class="tab-icon">📊</span><span class="tab-label">Stats</span><div class="tab-dot"></div></button>
  </nav>`;}
function bindTabBar(){document.querySelectorAll('.tab-item[data-route]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.route)));}

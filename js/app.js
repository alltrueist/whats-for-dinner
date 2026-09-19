// js/app.js — Entry point
import { onAuthChange, getChildSession } from './auth.js';
import { getUser, isAppSetup, refreshCooldowns } from './db.js';
import { route, navigate, initRouter } from './router.js';
import { setCurrentUser, clearCurrentUser, applyPalette, showLoading, hideLoading } from './state.js';
import { renderLogin } from './screens/login.js';

// ─── CRITICAL: Expose navigate globally so inline onclick="navigate(...)" works ───
window.navigate = navigate;

// ─── Routes ──────────────────────────────────────────────────────────────────
route('/login',      renderLogin, { title: 'Sign In' });

route('/onboarding', async (p,c) => { const {renderOnboarding} = await import('./screens/onboarding.js'); return renderOnboarding(p,c); }, { title: 'Setup' });
route('/dashboard',  async (p,c) => { const {renderDashboard}  = await import('./screens/dashboard.js');  return renderDashboard(p,c);  }, { title: 'Home',          guard: requireAuth  });
route('/planner',    async (p,c) => { const {renderPlanner}    = await import('./screens/planner.js');    return renderPlanner(p,c);    }, { title: 'Planner',       guard: requireAdult });
route('/meals',      async (p,c) => { const {renderMeals}      = await import('./screens/meals.js');      return renderMeals(p,c);      }, { title: 'Meals',         guard: requireAuth  });
route('/shopping',   async (p,c) => { const {renderShopping}   = await import('./screens/shopping.js');   return renderShopping(p,c);   }, { title: 'Shopping List', guard: requireAdult });
route('/calendar',   async (p,c) => { const {renderCalendar}   = await import('./screens/calendar.js');   return renderCalendar(p,c);   }, { title: 'Calendar',      guard: requireAuth  });
route('/analytics',  async (p,c) => { const {renderAnalytics}  = await import('./screens/analytics.js');  return renderAnalytics(p,c);  }, { title: 'Stats',         guard: requireAuth  });
route('/settings',   async (p,c) => { const {renderSettings}   = await import('./screens/settings.js');   return renderSettings(p,c);   }, { title: 'Settings',      guard: requireAuth  });
route('/submission', async (p,c) => { const {renderSubmission}  = await import('./screens/submission.js');  return renderSubmission(p,c);  }, { title: 'Pick Meals',   guard: requireAuth  });

// ─── Guards ───────────────────────────────────────────────────────────────────
async function requireAuth()  { const {currentUser} = await import('./state.js'); if (!currentUser) return '/login'; }
async function requireAdult() { const {currentUser} = await import('./state.js'); if (!currentUser) return '/login'; if (currentUser.role!=='adult') return '/dashboard'; }

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  initRouter();
  showLoading();

  let appReady = false;
  try { appReady = await isAppSetup(); } catch(e) { console.error('[Boot]',e); }

  if (!appReady) { hideLoading(); navigate('/onboarding'); return; }

  refreshCooldowns().catch(console.error);

  onAuthChange(async (fbUser) => {
    if (!fbUser) { clearCurrentUser(); hideLoading(); navigate('/login'); return; }

    if (!fbUser.isAnonymous) {
      showLoading();
      try {
        const userData = await getUser(fbUser.uid);
        if (userData?.isActive) { setCurrentUser(userData); applyPalette(userData.palette||'slate'); hideLoading(); navigate('/dashboard'); }
        else { clearCurrentUser(); hideLoading(); navigate('/login'); }
      } catch(e) { console.error('[Auth]',e); clearCurrentUser(); hideLoading(); navigate('/login'); }
      return;
    }

    const childSession = getChildSession();
    if (childSession) {
      showLoading();
      try {
        const userData = await getUser(childSession.userId);
        if (userData?.isActive) {
          setCurrentUser(userData); applyPalette(userData.palette||'slate'); hideLoading();
          const goSub = await checkPendingSubmission(userData);
          navigate(goSub ? '/submission' : '/dashboard');
        } else { clearCurrentUser(); hideLoading(); navigate('/login'); }
      } catch(e) { console.error('[Auth]',e); clearCurrentUser(); hideLoading(); navigate('/login'); }
    } else {
      const {signOut} = await import('./auth.js');
      await signOut(); clearCurrentUser(); hideLoading(); navigate('/login');
    }
  });
}

async function checkPendingSubmission(userData) {
  try {
    const {getDocs, collection} = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const {db} = await import('./firebase.js');
    const {COLLECTIONS} = await import('./config.js');
    const {getHouseholdSettings} = await import('./db.js');
    const settings = await getHouseholdSettings();
    if (!settings) return false;
    const snapshot = await getDocs(collection(db, COLLECTIONS.CYCLES));
    const cycles = snapshot.docs.map(d=>({id:d.id,...d.data()}));
    const planning = cycles
      .filter(c=>c.status==='planning')
      .sort((a,b)=>{
        const ga=c=>c.startDate?.toDate?c.startDate.toDate().getTime():new Date(c.startDate||0).getTime();
        return ga(b)-ga(a);
      })[0];
    if (!planning) return false;
    const subs = planning.submissions||{};
    if (subs[userData.id]) return false;
    const start = planning.startDate?.toDate ? planning.startDate.toDate() : new Date(planning.startDate||0);
    const daysSince = Math.floor((Date.now()-start.getTime())/86400000);
    return daysSince >= ((settings.submissionReminderDay||2)-1);
  } catch { return false; }
}

boot();

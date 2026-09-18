// js/app.js
// ─────────────────────────────────────────────────────────────────────────────
// Application entry point.
// Initializes routing, registers all screens, boots the auth listener.
// ─────────────────────────────────────────────────────────────────────────────

import { onAuthChange, getChildSession } from './auth.js';
import { getUser, isAppSetup, refreshCooldowns } from './db.js';
import { route, navigate, initRouter }   from './router.js';
import { setCurrentUser, clearCurrentUser, applyPalette, showLoading, hideLoading } from './state.js';

// ─── Import screen render functions ──────────────────────────────────────────
// Each screen is a lazy-loaded module. Only login is imported eagerly since
// it's the first screen most users see. All others load on first navigation.

import { renderLogin } from './screens/login.js';


// ─── Register Routes ─────────────────────────────────────────────────────────

route('/login',      renderLogin,             { title: 'Sign In' });

// Remaining screens: registered with dynamic imports (loaded on first visit)

route('/dashboard',  async (p, c) => {
  const { renderDashboard } = await import('./screens/dashboard.js');
  return renderDashboard(p, c);
}, { title: 'Home', guard: requireAuth });

route('/planner',    async (p, c) => {
  const { renderPlanner } = await import('./screens/planner.js');
  return renderPlanner(p, c);
}, { title: 'Planner', guard: requireAdult });

route('/meals',      async (p, c) => {
  const { renderMeals } = await import('./screens/meals.js');
  return renderMeals(p, c);
}, { title: 'Meals', guard: requireAuth });

route('/shopping',   async (p, c) => {
  const { renderShopping } = await import('./screens/shopping.js');
  return renderShopping(p, c);
}, { title: 'Shopping List', guard: requireAdult });

route('/calendar',   async (p, c) => {
  const { renderCalendar } = await import('./screens/calendar.js');
  return renderCalendar(p, c);
}, { title: 'Calendar', guard: requireAuth });

route('/analytics',  async (p, c) => {
  const { renderAnalytics } = await import('./screens/analytics.js');
  return renderAnalytics(p, c);
}, { title: 'Stats', guard: requireAuth });

route('/settings',   async (p, c) => {
  const { renderSettings } = await import('./screens/settings.js');
  return renderSettings(p, c);
}, { title: 'Settings', guard: requireAuth });

route('/onboarding', async (p, c) => {
  const { renderOnboarding } = await import('./screens/onboarding.js');
  return renderOnboarding(p, c);
}, { title: 'Setup' });

route('/submission', async (p, c) => {
  const { renderSubmission } = await import('./screens/submission.js');
  return renderSubmission(p, c);
}, { title: 'Pick Your Meals', guard: requireAuth });


// ─── Route Guards ─────────────────────────────────────────────────────────────

async function requireAuth() {
  const { currentUser } = await import('./state.js');
  if (!currentUser) return '/login';
}

async function requireAdult() {
  const { currentUser } = await import('./state.js');
  if (!currentUser) return '/login';
  if (currentUser.role !== 'adult') return '/dashboard';
}


// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  // Initialize hash-based routing
  initRouter();

  showLoading();

  // Check if app has been set up at all
  let appReady = false;
  try {
    appReady = await isAppSetup();
  } catch (err) {
    console.error('[Boot] Could not check app setup:', err);
    hideLoading();
    navigate('/login');
    return;
  }

  if (!appReady) {
    hideLoading();
    navigate('/onboarding');
    return;
  }

  // Refresh meal cooldowns in the background
  refreshCooldowns().catch(console.error);

  // Listen for Firebase auth state
  onAuthChange(async (firebaseUser) => {
    if (!firebaseUser) {
      // Not authenticated at all
      clearCurrentUser();
      hideLoading();
      navigate('/login');
      return;
    }

    if (!firebaseUser.isAnonymous) {
      // Adult signed in via email/password
      try {
        const userData = await getUser(firebaseUser.uid);
        if (userData && userData.isActive) {
          setCurrentUser(userData);
          applyPalette(userData.palette || 'slate');
          hideLoading();
          navigate('/dashboard');
        } else {
          clearCurrentUser();
          hideLoading();
          navigate('/login');
        }
      } catch (err) {
        console.error('[Boot] Error loading adult user:', err);
        clearCurrentUser();
        hideLoading();
        navigate('/login');
      }
      return;
    }

    // Anonymous auth — check for child session
    const childSession = getChildSession();
    if (childSession) {
      try {
        const userData = await getUser(childSession.userId);
        if (userData && userData.isActive) {
          setCurrentUser(userData);
          applyPalette(userData.palette || 'slate');
          hideLoading();

          // If a submission is pending for this child, send them there directly
          const shouldSubmit = await checkPendingSubmission(userData);
          navigate(shouldSubmit ? '/submission' : '/dashboard');
        } else {
          clearCurrentUser();
          hideLoading();
          navigate('/login');
        }
      } catch (err) {
        console.error('[Boot] Error loading child user:', err);
        clearCurrentUser();
        hideLoading();
        navigate('/login');
      }
    } else {
      // Anonymous but no child session — shouldn't happen, sign out
      const { signOut } = await import('./auth.js');
      await signOut();
      clearCurrentUser();
      hideLoading();
      navigate('/login');
    }
  });
}

/**
 * Check if a child has a pending submission for the current cycle.
 * Returns true if they should be redirected to the submission screen.
 */
async function checkPendingSubmission(userData) {
  try {
    const { getHouseholdSettings } = await import('./db.js');
    const { getDocs, collection, query, where, orderBy, limit }
      = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const { db }    = await import('./firebase.js');
    const { COLLECTIONS } = await import('./config.js');

    const settings = await getHouseholdSettings();
    if (!settings) return false;

    // Find the most recent planning cycle
    const cycleRef = query(
      collection(db, COLLECTIONS.CYCLES),
      where('status', '==', 'planning'),
      orderBy('startDate', 'desc'),
      limit(1)
    );
    const cycles = (await getDocs(cycleRef)).docs.map(d => ({ id: d.id, ...d.data() }));
    if (cycles.length === 0) return false;

    const cycle = cycles[0];
    const submissions = cycle.submissions || {};
    const hasSubmitted = !!submissions[userData.id];

    // Only redirect if it's past the reminder day in the cycle
    // (keeps it from redirecting on Day 1 before the notification fires)
    const reminderDay = settings.submissionReminderDay || 2;
    const cycleStartDate = cycle.startDate?.toDate
      ? cycle.startDate.toDate()
      : new Date(cycle.startDate);
    const daysSinceStart = Math.floor((Date.now() - cycleStartDate.getTime()) / 86400000);

    return !hasSubmitted && daysSinceStart >= (reminderDay - 1);
  } catch {
    return false;
  }
}

// Start the app
boot();

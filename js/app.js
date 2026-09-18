// js/app.js
// ─────────────────────────────────────────────────────────────────────────────
// Application entry point. Boots auth, registers routes, handles navigation.
// ─────────────────────────────────────────────────────────────────────────────

import { onAuthChange, getChildSession } from './auth.js';
import { getUser, isAppSetup, refreshCooldowns } from './db.js';
import { route, navigate, initRouter }   from './router.js';
import {
  setCurrentUser, clearCurrentUser,
  applyPalette, showLoading, hideLoading
} from './state.js';
import { renderLogin } from './screens/login.js';

// ─── Guard: block until onboarding is complete ───────────────────────────────
// Prevents the auth listener from redirecting mid-onboarding.
let _onboardingInProgress = false;
export function setOnboardingInProgress(val) { _onboardingInProgress = val; }


// ─── Register Routes ─────────────────────────────────────────────────────────

route('/login', renderLogin, { title: 'Sign In' });

route('/onboarding', async (p, c) => {
  const { renderOnboarding } = await import('./screens/onboarding.js');
  return renderOnboarding(p, c);
}, { title: 'Setup' });

route('/dashboard', async (p, c) => {
  const { renderDashboard } = await import('./screens/dashboard.js');
  return renderDashboard(p, c);
}, { title: 'Home', guard: requireAuth });

route('/planner', async (p, c) => {
  const { renderPlanner } = await import('./screens/planner.js');
  return renderPlanner(p, c);
}, { title: 'Planner', guard: requireAdult });

route('/meals', async (p, c) => {
  const { renderMeals } = await import('./screens/meals.js');
  return renderMeals(p, c);
}, { title: 'Meals', guard: requireAuth });

route('/shopping', async (p, c) => {
  const { renderShopping } = await import('./screens/shopping.js');
  return renderShopping(p, c);
}, { title: 'Shopping List', guard: requireAdult });

route('/calendar', async (p, c) => {
  const { renderCalendar } = await import('./screens/calendar.js');
  return renderCalendar(p, c);
}, { title: 'Calendar', guard: requireAuth });

route('/analytics', async (p, c) => {
  const { renderAnalytics } = await import('./screens/analytics.js');
  return renderAnalytics(p, c);
}, { title: 'Stats', guard: requireAuth });

route('/settings', async (p, c) => {
  const { renderSettings } = await import('./screens/settings.js');
  return renderSettings(p, c);
}, { title: 'Settings', guard: requireAuth });

route('/submission', async (p, c) => {
  const { renderSubmission } = await import('./screens/submission.js');
  return renderSubmission(p, c);
}, { title: 'Pick Your Meals', guard: requireChild });


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

async function requireChild() {
  const { currentUser } = await import('./state.js');
  if (!currentUser) return '/login';
}


// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  initRouter();
  showLoading();

  // Check first-run setup
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

  // Refresh meal cooldowns quietly in the background
  refreshCooldowns().catch(console.error);

  // Auth state listener — handles all login/logout routing
  onAuthChange(async (firebaseUser) => {
    // Never interrupt onboarding
    if (_onboardingInProgress) return;

    if (!firebaseUser) {
      clearCurrentUser();
      hideLoading();
      navigate('/login');
      return;
    }

    if (!firebaseUser.isAnonymous) {
      // Adult signed in via email/password
      showLoading();
      try {
        const userData = await getUser(firebaseUser.uid);
        if (userData && userData.isActive) {
          setCurrentUser(userData);
          applyPalette(userData.palette || 'slate');
          hideLoading();
          await navigate('/dashboard');
        } else {
          // User doc not found or inactive — go to login
          clearCurrentUser();
          hideLoading();
          navigate('/login');
        }
      } catch (err) {
        console.error('[Auth] Error loading user data:', err);
        clearCurrentUser();
        hideLoading();
        navigate('/login');
      }
      return;
    }

    // Anonymous auth — check for child session
    const childSession = getChildSession();
    if (childSession) {
      showLoading();
      try {
        const userData = await getUser(childSession.userId);
        if (userData && userData.isActive) {
          setCurrentUser(userData);
          applyPalette(userData.palette || 'slate');
          hideLoading();
          const goToSubmission = await checkPendingSubmission(userData);
          await navigate(goToSubmission ? '/submission' : '/dashboard');
        } else {
          clearCurrentUser();
          hideLoading();
          navigate('/login');
        }
      } catch (err) {
        console.error('[Auth] Error loading child session:', err);
        clearCurrentUser();
        hideLoading();
        navigate('/login');
      }
    } else {
      // Anonymous but no child session — clear and go to login
      const { signOut } = await import('./auth.js');
      await signOut();
      clearCurrentUser();
      hideLoading();
      navigate('/login');
    }
  });
}

/**
 * Check if a child has a pending submission for the current planning cycle.
 */
async function checkPendingSubmission(userData) {
  try {
    const { getDocs, collection, query, where, orderBy, limit }
      = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const { db }          = await import('./firebase.js');
    const { COLLECTIONS } = await import('./config.js');
    const { getHouseholdSettings } = await import('./db.js');

    const settings = await getHouseholdSettings();
    if (!settings) return false;

    const cycleRef = query(
      collection(db, COLLECTIONS.CYCLES),
      where('status', '==', 'planning'),
      orderBy('startDate', 'desc'),
      limit(1)
    );
    const docs = (await getDocs(cycleRef)).docs;
    if (docs.length === 0) return false;

    const cycle         = { id: docs[0].id, ...docs[0].data() };
    const submissions   = cycle.submissions || {};
    const hasSubmitted  = !!submissions[userData.id];
    if (hasSubmitted) return false;

    const reminderDay   = settings.submissionReminderDay || 2;
    const startDate     = cycle.startDate?.toDate
      ? cycle.startDate.toDate()
      : new Date(cycle.startDate);
    const daysSinceStart = Math.floor((Date.now() - startDate.getTime()) / 86400000);

    return daysSinceStart >= (reminderDay - 1);
  } catch {
    return false;
  }
}

boot();

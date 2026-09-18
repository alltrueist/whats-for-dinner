// js/screens/login.js
// ─────────────────────────────────────────────────────────────────────────────
// Login screen — profile selection, adult email/password, child PIN entry.
// ─────────────────────────────────────────────────────────────────────────────

import { signInAdult, signInChild, sendPasswordReset, loadLoginProfiles } from '../auth.js';
import { navigate }   from '../router.js';
import { shake, el }  from '../utils.js';
import { setCurrentUser, applyPalette } from '../state.js';
import { getUser }    from '../db.js';


// ─── Avatar initials & colors ─────────────────────────────────────────────────

const AVATAR_COLORS = {
  Owen:  { bg: '#495057', fg: '#FFFFFF' },
  Hanna: { bg: '#2B6940', fg: '#FFFFFF' },
  Jack:  { bg: '#1864AB', fg: '#FFFFFF' },
  Otto:  { bg: '#C1440E', fg: '#FFFFFF' },
  Ella:  { bg: '#6A0DAD', fg: '#FFFFFF' }
};

function avatarColor(name) {
  return AVATAR_COLORS[name] || { bg: '#868E96', fg: '#FFFFFF' };
}

function initials(name) {
  return name ? name.slice(0, 2).toUpperCase() : '??';
}


// ─── Main render ─────────────────────────────────────────────────────────────

export async function renderLogin(params, container) {
  container.innerHTML = buildShell();

  const profileGrid = el('profile-grid');
  const profilesLoading = el('profiles-loading');
  const profilesError   = el('profiles-error');

  // Load profiles
  let profiles = [];
  try {
    profiles = await loadLoginProfiles();
  } catch (err) {
    profilesLoading.classList.add('hidden');
    profilesError.classList.remove('hidden');
    return;
  }

  profilesLoading.classList.add('hidden');

  if (profiles.length === 0) {
    // No users set up yet — go to onboarding
    navigate('/onboarding');
    return;
  }

  // Render profile cards
  profileGrid.innerHTML = profiles.map(user => buildProfileCard(user)).join('');

  // Bind profile card clicks
  profileGrid.querySelectorAll('.profile-card').forEach(card => {
    card.addEventListener('click', () => {
      const userId      = card.dataset.userId;
      const role        = card.dataset.role;
      const displayName = card.dataset.name;
      const profile     = profiles.find(p => p.id === userId);

      if (role === 'adult') {
        showAdultForm(profile);
      } else {
        showPinScreen(profile);
      }
    });
  });
}

function buildShell() {
  return `
    <div class="login-screen">
      <div class="login-hero">
        <div class="login-wordmark">What's for Dinner?</div>
        <div class="login-tagline">Who's cooking tonight?</div>
      </div>

      <div id="profile-section">
        <div id="profiles-loading" class="login-loading">
          <div class="spinner"></div>
        </div>
        <div id="profiles-error" class="login-error hidden">
          <p>Couldn't load profiles. Check your connection and reload.</p>
        </div>
        <div id="profile-grid" class="profile-grid"></div>
      </div>
    </div>

    <!-- Adult email/password panel (hidden by default) -->
    <div id="adult-form-panel" class="login-panel hidden">
      <div class="panel-inner">
        <button class="panel-back" id="adult-back">‹ Back</button>
        <div class="panel-avatar" id="adult-avatar"></div>
        <div class="panel-name"   id="adult-name"></div>

        <form id="adult-form" class="auth-form" autocomplete="on" novalidate>
          <div class="form-group">
            <label class="form-label" for="email-input">Email</label>
            <input class="form-input" id="email-input" type="email"
              autocomplete="email" inputmode="email" placeholder="your@email.com" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="password-input">Password</label>
            <input class="form-input" id="password-input" type="password"
              autocomplete="current-password" placeholder="••••••••" required />
          </div>
          <div id="adult-error" class="form-error hidden"></div>
          <button class="btn-primary btn-full" id="signin-btn" type="submit">Sign In</button>
          <button class="btn-text" id="forgot-btn" type="button">Forgot password?</button>
        </form>

        <div id="forgot-success" class="form-success hidden">
          Reset email sent — check your inbox.
        </div>
      </div>
    </div>

    <!-- Child PIN panel (hidden by default) -->
    <div id="pin-panel" class="login-panel hidden">
      <div class="panel-inner">
        <button class="panel-back" id="pin-back">‹ Back</button>
        <div class="panel-avatar" id="pin-avatar"></div>
        <div class="panel-name"   id="pin-name"></div>
        <div class="pin-prompt">Enter your PIN</div>

        <div id="pin-dots" class="pin-dots">
          <div class="pin-dot" data-index="0"></div>
          <div class="pin-dot" data-index="1"></div>
          <div class="pin-dot" data-index="2"></div>
          <div class="pin-dot" data-index="3"></div>
        </div>

        <div id="pin-error" class="form-error hidden"></div>

        <div class="pin-pad">
          ${[1,2,3,4,5,6,7,8,9].map(n =>
            `<button class="pin-key" data-digit="${n}">${n}</button>`
          ).join('')}
          <button class="pin-key pin-key-del" id="pin-del" aria-label="Delete">⌫</button>
          <button class="pin-key" data-digit="0">0</button>
          <button class="pin-key pin-key-hidden" aria-hidden="true"></button>
        </div>

        <div id="pin-loading" class="pin-loading hidden">
          <div class="spinner spinner-sm"></div>
          <span>Checking…</span>
        </div>
      </div>
    </div>
  `;
}

function buildProfileCard(user) {
  const colors = avatarColor(user.displayName);
  return `
    <button class="profile-card" 
      data-user-id="${user.id}"
      data-role="${user.role}"
      data-name="${user.displayName}"
      aria-label="Sign in as ${user.displayName}">
      <div class="profile-avatar" style="background:${colors.bg}; color:${colors.fg};">
        ${initials(user.displayName)}
      </div>
      <div class="profile-name">${user.displayName}</div>
      <div class="profile-role">${user.role === 'adult' ? '' : '🧒'}</div>
    </button>
  `;
}


// ─── Adult login form ─────────────────────────────────────────────────────────

function showAdultForm(profile) {
  hideAllPanels();
  const panel    = el('adult-form-panel');
  const avatar   = el('adult-avatar');
  const nameEl   = el('adult-name');
  const form     = el('adult-form');
  const errorEl  = el('adult-error');
  const signinBtn = el('signin-btn');
  const forgotBtn = el('forgot-btn');
  const forgotOk  = el('forgot-success');

  const colors = avatarColor(profile.displayName);
  avatar.style.background = colors.bg;
  avatar.style.color      = colors.fg;
  avatar.textContent      = initials(profile.displayName);
  nameEl.textContent      = profile.displayName;

  panel.classList.remove('hidden');
  el('email-input').focus();

  // Back button
  el('adult-back').onclick = () => hideAllPanels();

  // Form submit
  form.onsubmit = async (e) => {
    e.preventDefault();
    const email    = el('email-input').value.trim();
    const password = el('password-input').value;

    if (!email || !password) return;

    errorEl.classList.add('hidden');
    signinBtn.disabled    = true;
    signinBtn.textContent = 'Signing in…';

    try {
      await signInAdult(email, password);
      // onAuthStateChanged in app.js will handle routing
    } catch (err) {
      signinBtn.disabled    = false;
      signinBtn.textContent = 'Sign In';
      errorEl.textContent   = friendlyAuthError(err.code);
      errorEl.classList.remove('hidden');
      shake(el('adult-form'));
    }
  };

  // Forgot password
  forgotBtn.onclick = async () => {
    const email = el('email-input').value.trim();
    if (!email) {
      el('email-input').focus();
      errorEl.textContent = 'Enter your email address first.';
      errorEl.classList.remove('hidden');
      return;
    }
    try {
      await sendPasswordReset(email);
      forgotOk.classList.remove('hidden');
      errorEl.classList.add('hidden');
    } catch {
      errorEl.textContent = 'Couldn\'t send reset email. Check the address and try again.';
      errorEl.classList.remove('hidden');
    }
  };
}

function friendlyAuthError(code) {
  const map = {
    'auth/invalid-email':        'That doesn\'t look like a valid email address.',
    'auth/user-not-found':       'No account found for that email.',
    'auth/wrong-password':       'Wrong password. Try again.',
    'auth/invalid-credential':   'Wrong email or password. Try again.',
    'auth/too-many-requests':    'Too many attempts. Wait a moment and try again.',
    'auth/network-request-failed': 'Network error. Check your connection.'
  };
  return map[code] || 'Sign-in failed. Try again.';
}


// ─── Child PIN screen ─────────────────────────────────────────────────────────

function showPinScreen(profile) {
  hideAllPanels();
  const panel     = el('pin-panel');
  const avatar    = el('pin-avatar');
  const nameEl    = el('pin-name');
  const errorEl   = el('pin-error');
  const loadingEl = el('pin-loading');

  const colors = avatarColor(profile.displayName);
  avatar.style.background = colors.bg;
  avatar.style.color      = colors.fg;
  avatar.textContent      = initials(profile.displayName);
  nameEl.textContent      = profile.displayName;

  panel.classList.remove('hidden');

  // PIN state
  let pin = '';

  function updateDots() {
    panel.querySelectorAll('.pin-dot').forEach((dot, i) => {
      dot.classList.toggle('filled', i < pin.length);
    });
  }

  function clearPin() {
    pin = '';
    updateDots();
  }

  async function submitPin() {
    if (pin.length !== 4) return;

    // Show loading, hide numpad area
    loadingEl.classList.remove('hidden');
    panel.querySelector('.pin-pad').style.opacity   = '0.4';
    panel.querySelector('.pin-pad').style.pointerEvents = 'none';
    errorEl.classList.add('hidden');

    const result = await signInChild(profile.id, pin);

    loadingEl.classList.add('hidden');
    panel.querySelector('.pin-pad').style.opacity   = '1';
    panel.querySelector('.pin-pad').style.pointerEvents = 'auto';

    if (result.success) {
      // Apply this user's palette immediately
      applyPalette(result.user.palette || 'slate');
      setCurrentUser({ ...result.user, id: profile.id });
      navigate('/dashboard');
    } else {
      errorEl.textContent = result.error;
      errorEl.classList.remove('hidden');
      shake(el('pin-dots'));
      clearPin();
    }
  }

  // Number key clicks
  panel.querySelectorAll('.pin-key[data-digit]').forEach(key => {
    key.addEventListener('click', () => {
      if (pin.length >= 4) return;
      pin += key.dataset.digit;
      updateDots();
      errorEl.classList.add('hidden');
      if (pin.length === 4) submitPin();
    });
  });

  // Delete key
  el('pin-del').addEventListener('click', () => {
    pin = pin.slice(0, -1);
    updateDots();
  });

  // Hardware keyboard support (for testing on desktop)
  const keyHandler = (e) => {
    if (!/^\d$/.test(e.key) && e.key !== 'Backspace') return;
    if (e.key === 'Backspace') {
      pin = pin.slice(0, -1);
      updateDots();
    } else if (pin.length < 4) {
      pin += e.key;
      updateDots();
      if (pin.length === 4) submitPin();
    }
  };
  document.addEventListener('keydown', keyHandler);

  // Back button — also remove keyboard listener
  el('pin-back').onclick = () => {
    document.removeEventListener('keydown', keyHandler);
    hideAllPanels();
  };

  updateDots();

  // Return cleanup to remove keyboard listener if navigated away
  return () => document.removeEventListener('keydown', keyHandler);
}


// ─── Helpers ─────────────────────────────────────────────────────────────────

function hideAllPanels() {
  el('adult-form-panel')?.classList.add('hidden');
  el('pin-panel')?.classList.add('hidden');
}

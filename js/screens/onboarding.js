// js/screens/onboarding.js
// ─────────────────────────────────────────────────────────────────────────────
// First-run onboarding wizard.
// Steps:
//   1. Welcome
//   2. Create Owen's account
//   3. Create Hanna's account
//   4. Add Jack (PIN)
//   5. Add Otto (PIN)
//   6. Add Ella (PIN)
//   7. Set rotation anchor date
//   8. Starter pantry
//   9. Done
// ─────────────────────────────────────────────────────────────────────────────

import { createAdultAccount }        from '../auth.js';
import { createUser, setHouseholdSettings, upsertPantryItem } from '../db.js';
import { hashPin }                   from '../utils.js';
import { navigate }                  from '../router.js';
import { applyPalette, setCurrentUser } from '../state.js';
import {
  signInWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { auth } from '../firebase.js';

// ─── Starter Pantry List ──────────────────────────────────────────────────────

const STARTER_PANTRY = [
  // Produce
  { name: 'Garlic',             category: 'Produce' },
  { name: 'Yellow Onion',       category: 'Produce' },
  { name: 'Lemons',             category: 'Produce' },
  // Dairy
  { name: 'Whole Milk',         category: 'Dairy',  isStaple: true, stapleQuantity: '1 gallon' },
  { name: 'Eggs',               category: 'Dairy',  isStaple: true, stapleQuantity: '1 dozen' },
  { name: 'Butter',             category: 'Dairy' },
  { name: 'Parmesan',           category: 'Dairy' },
  { name: 'Shredded Mozzarella',category: 'Dairy' },
  // Dry Goods / Pantry
  { name: 'Olive Oil',          category: 'Dry Goods' },
  { name: 'Vegetable Oil',      category: 'Dry Goods' },
  { name: 'Salt',               category: 'Dry Goods' },
  { name: 'Black Pepper',       category: 'Dry Goods' },
  { name: 'Flour',              category: 'Dry Goods' },
  { name: 'Sugar',              category: 'Dry Goods' },
  { name: 'Pasta',              category: 'Dry Goods' },
  { name: 'Rice',               category: 'Dry Goods' },
  { name: 'Chicken Broth',      category: 'Canned Goods' },
  { name: 'Crushed Tomatoes',   category: 'Canned Goods' },
  { name: 'Tomato Paste',       category: 'Canned Goods' },
  { name: 'Bread',              category: 'Bakery',  isStaple: true, stapleQuantity: '1 loaf' },
];

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  step:           1,
  totalSteps:     9,
  owenUid:        null,
  hannaUid:       null,
  jackId:         null,
  ottoId:         null,
  ellaId:         null,
  owenEmail:      '',
  hannaEmail:     '',
  rotationAnchor: '',
  pantryApproved: new Set(STARTER_PANTRY.map(i => i.name)) // all approved by default
};

// ─── Main Render ─────────────────────────────────────────────────────────────

export async function renderOnboarding(params, container) {
  container.innerHTML = buildShell();
  renderStep();
}

function buildShell() {
  return `
    <div class="onboard-screen" id="onboard-screen">
      <div class="onboard-progress-bar">
        <div class="onboard-progress-fill" id="progress-fill"></div>
      </div>
      <div class="onboard-body" id="onboard-body"></div>
    </div>
  `;
}

function renderStep() {
  updateProgress();
  const body = document.getElementById('onboard-body');
  if (!body) return;

  const steps = {
    1: stepWelcome,
    2: stepOwenAccount,
    3: stepHannaAccount,
    4: () => stepChildPin('Jack',  '2011-10-20', 'jackId'),
    5: () => stepChildPin('Otto',  '2015-05-07', 'ottoId'),
    6: () => stepChildPin('Ella',  '2018-02-11', 'ellaId'),
    7: stepRotationDate,
    8: stepStarterPantry,
    9: stepDone
  };

  const fn = steps[state.step];
  if (fn) {
    body.innerHTML = '';
    body.appendChild(fn());
    body.classList.add('fade-in');
    // Remove animation class so it can re-trigger on next step
    setTimeout(() => body.classList.remove('fade-in'), 400);
  }
}

function updateProgress() {
  const fill = document.getElementById('progress-fill');
  if (fill) {
    fill.style.width = `${((state.step - 1) / (state.totalSteps - 1)) * 100}%`;
  }
}

function nextStep() {
  state.step++;
  renderStep();
}

// ─── Step 1: Welcome ─────────────────────────────────────────────────────────

function stepWelcome() {
  const el = div('onboard-step');
  el.innerHTML = `
    <div class="onboard-icon">🍽️</div>
    <h1 class="onboard-title">Welcome to<br>What's for Dinner?</h1>
    <p class="onboard-desc">
      This wizard sets up your household in about 5 minutes.
      You'll create accounts for Owen and Hanna, add PINs for
      Jack, Otto, and Ella, and set up your pantry.
    </p>
    <div class="onboard-checklist">
      <div class="check-item">👤 Create adult accounts</div>
      <div class="check-item">🔢 Set up kids' PINs</div>
      <div class="check-item">📅 Set your meal rotation start</div>
      <div class="check-item">🥫 Confirm starter pantry</div>
    </div>
    <button class="btn-primary btn-full onboard-next" id="welcome-next">
      Let's go →
    </button>
  `;
  el.querySelector('#welcome-next').onclick = nextStep;
  return el;
}

// ─── Step 2 & 3: Adult Accounts ──────────────────────────────────────────────

function stepOwenAccount() {
  return buildAdultStep({
    name:         'Owen',
    dob:          '1981-06-08',
    role:         'adult',
    stateUidKey:  'owenUid',
    stateEmailKey:'owenEmail',
    subtitle:     'Owen\'s account has full admin access.',
    isFirst:      true
  });
}

function stepHannaAccount() {
  return buildAdultStep({
    name:          'Hanna',
    dob:           '1989-10-07',
    role:          'adult',
    stateUidKey:   'hannaUid',
    stateEmailKey: 'hannaEmail',
    subtitle:      'Hanna\'s account also has full admin access.',
    isFirst:       false
  });
}

function buildAdultStep({ name, dob, stateUidKey, stateEmailKey, subtitle }) {
  const el = div('onboard-step');
  el.innerHTML = `
    <div class="onboard-avatar" style="background:${avatarBg(name)}">
      ${initials(name)}
    </div>
    <h2 class="onboard-title">${name}'s Account</h2>
    <p class="onboard-desc">${subtitle}</p>

    <form class="onboard-form" id="adult-form" novalidate>
      <div class="form-group">
        <label class="form-label" for="adult-email">Email address</label>
        <input class="form-input" id="adult-email" type="email"
          inputmode="email" autocomplete="email"
          placeholder="${name.toLowerCase()}@email.com" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="adult-pw">Password</label>
        <input class="form-input" id="adult-pw" type="password"
          autocomplete="new-password" placeholder="At least 8 characters" required
          minlength="8" />
      </div>
      <div class="form-group">
        <label class="form-label" for="adult-pw2">Confirm password</label>
        <input class="form-input" id="adult-pw2" type="password"
          autocomplete="new-password" placeholder="Same password again" required />
      </div>

      <div id="adult-error" class="form-error hidden"></div>

      <button class="btn-primary btn-full" id="adult-submit" type="submit">
        Create ${name}'s Account →
      </button>
    </form>
  `;

  const form    = el.querySelector('#adult-form');
  const emailIn = el.querySelector('#adult-email');
  const pwIn    = el.querySelector('#adult-pw');
  const pw2In   = el.querySelector('#adult-pw2');
  const errEl   = el.querySelector('#adult-error');
  const btn     = el.querySelector('#adult-submit');

  // Pre-fill if returning
  if (state[stateEmailKey]) emailIn.value = state[stateEmailKey];

  form.onsubmit = async (e) => {
    e.preventDefault();
    errEl.classList.add('hidden');

    const email = emailIn.value.trim();
    const pw    = pwIn.value;
    const pw2   = pw2In.value;

    if (!email)          return showErr(errEl, 'Email is required.');
    if (pw.length < 8)   return showErr(errEl, 'Password must be at least 8 characters.');
    if (pw !== pw2)      return showErr(errEl, 'Passwords don\'t match.');

    btn.disabled    = true;
    btn.textContent = 'Creating account…';

    try {
      // Create Firebase Auth account
      const uid = await createAdultAccount(email, pw);

      // Create Firestore user document
      await createUser(uid, {
        displayName: name,
        role:        'adult',
        email:       email,
        dateOfBirth: dob,
        palette:     'slate'
      });

      state[stateUidKey]    = uid;
      state[stateEmailKey]  = email;

      nextStep();
    } catch (err) {
      btn.disabled    = false;
      btn.textContent = `Create ${name}'s Account →`;
      showErr(errEl, friendlyError(err.code));
    }
  };

  return el;
}

// ─── Steps 4–6: Child PIN ─────────────────────────────────────────────────────

function stepChildPin(name, dob, stateKey) {
  const el = div('onboard-step');
  let pin  = '';

  el.innerHTML = `
    <div class="onboard-avatar" style="background:${avatarBg(name)}">
      ${initials(name)}
    </div>
    <h2 class="onboard-title">${name}'s PIN</h2>
    <p class="onboard-desc">
      ${name} will use this 4-digit PIN to log in.
      Keep it simple — ${name} needs to remember it!
    </p>

    <div class="onboard-pin-section">
      <div class="pin-label">Choose a PIN for ${name}</div>
      <div id="pin-dots-${name}" class="pin-dots onboard-pin-dots">
        <div class="pin-dot" data-index="0"></div>
        <div class="pin-dot" data-index="1"></div>
        <div class="pin-dot" data-index="2"></div>
        <div class="pin-dot" data-index="3"></div>
      </div>
      <div id="pin-error-${name}" class="form-error hidden"></div>
      <div class="pin-pad onboard-pin-pad">
        ${[1,2,3,4,5,6,7,8,9].map(n =>
          `<button class="pin-key" data-digit="${n}">${n}</button>`
        ).join('')}
        <button class="pin-key pin-key-del" id="del-${name}">⌫</button>
        <button class="pin-key" data-digit="0">0</button>
        <button class="pin-key pin-key-hidden"></button>
      </div>
    </div>

    <div id="pin-saving-${name}" class="onboard-saving hidden">
      <div class="spinner spinner-sm"></div> Saving…
    </div>
  `;

  const dotsEl   = el.querySelector(`#pin-dots-${name}`);
  const errEl    = el.querySelector(`#pin-error-${name}`);
  const savingEl = el.querySelector(`#pin-saving-${name}`);

  function updateDots() {
    dotsEl.querySelectorAll('.pin-dot').forEach((d, i) => {
      d.classList.toggle('filled', i < pin.length);
    });
  }

  async function onFourDigits() {
    errEl.classList.add('hidden');
    savingEl.classList.remove('hidden');
    el.querySelectorAll('.pin-key').forEach(k => k.disabled = true);

    try {
      // Create a Firestore document for this child (no Firebase Auth account)
      // The document ID will be used as userId for PIN hashing
      const tempId   = `${name.toLowerCase()}_temp_${Date.now()}`;
      const pinHash  = await hashPin(pin, tempId);

      // Create user doc — we'll update the ID afterward
      const userId = await createUser(null, {
        displayName: name,
        role:        'child',
        dateOfBirth: dob,
        palette:     'slate',
        pinHash:     pinHash
      });

      // Re-hash with the real userId and update
      const realHash = await hashPin(pin, userId);
      const { updateDoc, doc } = await import(
        'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
      );
      const { db }             = await import('../firebase.js');
      const { COLLECTIONS }    = await import('../config.js');
      await updateDoc(doc(db, COLLECTIONS.USERS, userId), { pinHash: realHash });

      state[stateKey] = userId;
      nextStep();
    } catch (err) {
      console.error('Child account error:', err);
      showErr(errEl, 'Something went wrong saving the PIN. Try again.');
      savingEl.classList.add('hidden');
      el.querySelectorAll('.pin-key').forEach(k => k.disabled = false);
      pin = '';
      updateDots();
    }
  }

  // Numpad events
  el.querySelectorAll('.pin-key[data-digit]').forEach(key => {
    key.addEventListener('click', () => {
      if (pin.length >= 4) return;
      pin += key.dataset.digit;
      updateDots();
      errEl.classList.add('hidden');
      if (pin.length === 4) onFourDigits();
    });
  });

  el.querySelector(`#del-${name}`).addEventListener('click', () => {
    pin = pin.slice(0, -1);
    updateDots();
  });

  updateDots();
  return el;
}

// ─── Step 7: Rotation Anchor Date ────────────────────────────────────────────

function stepRotationDate() {
  const el = div('onboard-step');

  // Suggest today as default
  const today = new Date().toISOString().slice(0, 10);

  el.innerHTML = `
    <div class="onboard-icon">📅</div>
    <h2 class="onboard-title">Meal Rotation Start</h2>
    <p class="onboard-desc">
      Pick a date when the kids are (or were) home with you.
      The app uses this to calculate your 4-on / 2-off pattern
      going forward. You can adjust individual days in the Calendar tab later.
    </p>

    <div class="form-group" style="width:100%; max-width:300px;">
      <label class="form-label" for="anchor-date">
        A day the kids are home
      </label>
      <input class="form-input" id="anchor-date" type="date"
        value="${today}" max="${today}" />
    </div>

    <div class="note note-info" style="margin-top: 8px;">
      <span>ℹ</span>
      <div>If today is a "kids home" day, leave it as-is.
      If not, scroll back to the most recent day they were with you.</div>
    </div>

    <div id="anchor-error" class="form-error hidden"></div>

    <button class="btn-primary btn-full onboard-next" id="anchor-next"
      style="margin-top: 24px;">
      Set Rotation →
    </button>
  `;

  el.querySelector('#anchor-next').onclick = async () => {
    const dateVal = el.querySelector('#anchor-date').value;
    const errEl   = el.querySelector('#anchor-error');

    if (!dateVal) return showErr(errEl, 'Please pick a date.');

    state.rotationAnchor = dateVal;
    errEl.classList.add('hidden');
    nextStep();
  };

  return el;
}

// ─── Step 8: Starter Pantry ───────────────────────────────────────────────────

function stepStarterPantry() {
  const el = div('onboard-step');

  const itemsByCategory = {};
  STARTER_PANTRY.forEach(item => {
    if (!itemsByCategory[item.category]) itemsByCategory[item.category] = [];
    itemsByCategory[item.category].push(item);
  });

  const categoryHTML = Object.entries(itemsByCategory).map(([cat, items]) => `
    <div class="pantry-group">
      <div class="pantry-group-label">${cat}</div>
      ${items.map(item => `
        <label class="pantry-item-row">
          <input type="checkbox" class="pantry-check"
            data-name="${item.name}" ${state.pantryApproved.has(item.name) ? 'checked' : ''} />
          <span class="pantry-item-name">
            ${item.name}
            ${item.isStaple ? '<span class="badge badge-active">Always Buy</span>' : ''}
          </span>
        </label>
      `).join('')}
    </div>
  `).join('');

  el.innerHTML = `
    <div class="onboard-icon">🥫</div>
    <h2 class="onboard-title">Starter Pantry</h2>
    <p class="onboard-desc">
      Check off the staples you typically keep at home.
      These will be tracked in your pantry and used to build
      smarter shopping lists. You can add more later.
    </p>

    <div class="pantry-toggle-row">
      <button class="btn-ghost" id="select-all" style="font-size:13px; padding:6px 12px;">Select All</button>
      <button class="btn-ghost" id="deselect-all" style="font-size:13px; padding:6px 12px;">Deselect All</button>
    </div>

    <div class="pantry-list" id="pantry-list">
      ${categoryHTML}
    </div>

    <div id="pantry-error" class="form-error hidden"></div>
    <div id="pantry-saving" class="onboard-saving hidden">
      <div class="spinner spinner-sm"></div> Saving pantry…
    </div>

    <button class="btn-primary btn-full" id="pantry-next" style="margin-top: 16px;">
      Finish Setup →
    </button>
  `;

  // Select / deselect all
  el.querySelector('#select-all').onclick = () => {
    el.querySelectorAll('.pantry-check').forEach(cb => cb.checked = true);
  };
  el.querySelector('#deselect-all').onclick = () => {
    el.querySelectorAll('.pantry-check').forEach(cb => cb.checked = false);
  };

  el.querySelector('#pantry-next').onclick = async () => {
    const btn      = el.querySelector('#pantry-next');
    const errEl    = el.querySelector('#pantry-error');
    const savingEl = el.querySelector('#pantry-saving');

    // Collect checked items
    const approved = [];
    el.querySelectorAll('.pantry-check:checked').forEach(cb => {
      const found = STARTER_PANTRY.find(i => i.name === cb.dataset.name);
      if (found) approved.push(found);
    });

    btn.disabled    = true;
    savingEl.classList.remove('hidden');
    errEl.classList.add('hidden');

    try {
      // Save household settings
      await setHouseholdSettings({
        rotationAnchorDate:          state.rotationAnchor,
        night4TurnOrder:             [state.owenUid, state.hannaUid],
        night4CurrentIndex:          0,
        submissionReminderDay:       2,
        submissionDeadlineDay:       5,
        pantryRestockThresholdWeeks: 2
      });

      // Save pantry items
      await Promise.all(
        approved.map(item =>
          upsertPantryItem(item.name, {
            status:         'stocked',
            isStaple:       item.isStaple || false,
            stapleQuantity: item.stapleQuantity || null,
            category:       item.category
          })
        )
      );

      nextStep();
    } catch (err) {
      console.error('Pantry save error:', err);
      btn.disabled    = false;
      savingEl.classList.add('hidden');
      showErr(errEl, 'Something went wrong. Try again.');
    }
  };

  return el;
}

// ─── Step 9: Done ────────────────────────────────────────────────────────────

function stepDone() {
  const el = div('onboard-step');
  el.innerHTML = `
    <div class="onboard-icon">🎉</div>
    <h2 class="onboard-title">You're all set!</h2>
    <p class="onboard-desc">
      Your household is ready. Head to the Meal Library to start
      adding everyone's favorite dinners, then plan your first cycle.
    </p>

    <div class="onboard-summary">
      <div class="summary-row">✓ Owen's account created</div>
      <div class="summary-row">✓ Hanna's account created</div>
      <div class="summary-row">✓ Jack's PIN set</div>
      <div class="summary-row">✓ Otto's PIN set</div>
      <div class="summary-row">✓ Ella's PIN set</div>
      <div class="summary-row">✓ Meal rotation configured</div>
      <div class="summary-row">✓ Starter pantry saved</div>
    </div>

    <button class="btn-primary btn-full" id="done-btn" style="margin-top: 24px;">
      Open What's for Dinner? →
    </button>
  `;

  el.querySelector('#done-btn').onclick = async () => {
    const btn = el.querySelector('#done-btn');
    btn.disabled    = true;
    btn.textContent = 'Signing you in…';

    try {
      // Sign Owen in so the app boots correctly
      const cred = await signInWithEmailAndPassword(
        auth, state.owenEmail,
        // We can't access the password again — redirect to login instead
        // This is expected: user logs in normally after onboarding
        ''
      );
    } catch {
      // Expected to fail (we don't store the password) — just go to login
    }
    navigate('/login');
  };

  return el;
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

function div(className) {
  const d = document.createElement('div');
  d.className = className;
  return d;
}

function showErr(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function friendlyError(code) {
  const map = {
    'auth/email-already-in-use': 'That email is already registered. Use a different one.',
    'auth/invalid-email':        'That doesn\'t look like a valid email address.',
    'auth/weak-password':        'Password is too weak. Use at least 8 characters.',
    'auth/network-request-failed': 'Network error — check your connection and try again.'
  };
  return map[code] || 'Something went wrong. Try again.';
}

const AVATAR_COLORS = {
  Owen:  '#495057',
  Hanna: '#2B6940',
  Jack:  '#1864AB',
  Otto:  '#C1440E',
  Ella:  '#6A0DAD'
};

function avatarBg(name) {
  return AVATAR_COLORS[name] || '#868E96';
}

function initials(name) {
  return name ? name.slice(0, 2).toUpperCase() : '??';
}

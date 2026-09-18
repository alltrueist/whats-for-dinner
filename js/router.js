// js/router.js
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight hash-based client-side router.
// Routes are registered with a render function and optional guard.
// ─────────────────────────────────────────────────────────────────────────────

const routes   = new Map();
const appEl    = () => document.getElementById('app');

let currentRoute   = null;
let currentCleanup = null; // cleanup function from previous screen


// ─── Route Registration ───────────────────────────────────────────────────────

/**
 * Register a route.
 * @param {string}   path    - e.g. '/dashboard', '/login'
 * @param {function} render  - Async function that renders the route into #app.
 *                             May return a cleanup function.
 * @param {object}   opts
 * @param {string}   opts.title      - Document title for this route
 * @param {function} opts.guard      - Optional async function; if it returns
 *                                     a string, navigation redirects there.
 */
export function route(path, render, opts = {}) {
  routes.set(path, { render, ...opts });
}


// ─── Navigation ──────────────────────────────────────────────────────────────

/**
 * Navigate to a path.
 * @param {string} path         - Route path e.g. '/dashboard'
 * @param {object} [params={}]  - Optional params passed to the render function
 */
export async function navigate(path, params = {}) {
  // Run cleanup from previous screen if it provided one
  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch {}
    currentCleanup = null;
  }

  const entry = routes.get(path);
  if (!entry) {
    console.warn(`[Router] No route registered for "${path}"`);
    return;
  }

  // Run guard
  if (typeof entry.guard === 'function') {
    const redirect = await entry.guard(params);
    if (typeof redirect === 'string') {
      return navigate(redirect, params);
    }
  }

  // Update URL hash (without triggering popstate loop)
  if (window.location.hash !== `#${path}`) {
    window.history.pushState(null, '', `#${path}`);
  }

  // Update document title
  if (entry.title) {
    document.title = entry.title + ' — What\'s for Dinner?';
  } else {
    document.title = 'What\'s for Dinner?';
  }

  currentRoute = path;

  // Clear app container and render new screen
  const container = appEl();
  if (container) container.innerHTML = '';

  try {
    const cleanup = await entry.render(params, container);
    if (typeof cleanup === 'function') {
      currentCleanup = cleanup;
    }
  } catch (err) {
    console.error(`[Router] Render error on "${path}":`, err);
    if (container) {
      container.innerHTML = `
        <div class="error-screen">
          <p class="error-title">Something went wrong.</p>
          <p class="error-sub">${err.message}</p>
          <button class="btn-primary" onclick="window.location.reload()">Reload</button>
        </div>
      `;
    }
  }
}

/**
 * Get the current route path.
 */
export function currentPath() {
  return currentRoute;
}


// ─── Hash-based Navigation Listener ─────────────────────────────────────────

/**
 * Initialize hash-based routing.
 * Call this once in app.js after all routes are registered.
 */
export function initRouter() {
  window.addEventListener('popstate', () => {
    const path = hashToPath();
    if (path && path !== currentRoute) {
      navigate(path);
    }
  });
}

function hashToPath() {
  const hash = window.location.hash;
  return hash ? hash.slice(1) : null; // strip leading #
}

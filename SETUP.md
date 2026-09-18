# What's for Dinner? — Setup Guide

Follow these steps **once** before running the app for the first time.
Estimated time: 30–45 minutes.

---

## Step 1: Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project**
3. Name it `whats-for-dinner` (or anything you like)
4. Disable Google Analytics (you don't need it)
5. Click **Create project**

---

## Step 2: Enable Firebase Services

### Authentication
1. In the Firebase console, go to **Build → Authentication**
2. Click **Get started**
3. Under **Sign-in method**, enable:
   - **Email/Password** (for Owen and Hanna)
   - **Anonymous** (for Jack, Otto, and Ella — PIN-based)

### Firestore Database
1. Go to **Build → Firestore Database**
2. Click **Create database**
3. Choose **Start in production mode**
4. Select a location closest to you (e.g., `us-central1`)
5. Click **Done**

### Firestore Security Rules
1. In Firestore, go to the **Rules** tab
2. Replace the default rules with the following:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users: anyone can read (needed for login profile display)
    // Adults can write any user doc; users can update their own prefs
    match /users/{userId} {
      allow read:  if true;
      allow write: if request.auth != null;
    }

    // Meals: readable by all authenticated users
    // Only authenticated users can write (adults enforce via UI)
    match /meals/{mealId} {
      allow read:  if true;
      allow write: if request.auth != null;
    }

    // Pantry: adults only (anonymous users cannot access)
    match /pantry/{itemId} {
      allow read, write: if request.auth != null
                         && request.auth.token.firebase.sign_in_provider != 'anonymous';
    }

    // Cycles: readable by all; children can write only their submission
    match /cycles/{cycleId} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // Shopping Lists: adults only
    match /shoppingLists/{listId} {
      allow read, write: if request.auth != null
                         && request.auth.token.firebase.sign_in_provider != 'anonymous';
    }

    // Calendar: readable by all; adults only can write
    match /calendar/{dateId} {
      allow read: if true;
      allow write: if request.auth != null
                   && request.auth.token.firebase.sign_in_provider != 'anonymous';
    }

    // Settings: readable by all; adults only can write
    match /settings/{docId} {
      allow read: if true;
      allow write: if request.auth != null
                   && request.auth.token.firebase.sign_in_provider != 'anonymous';
    }
  }
}
```

3. Click **Publish**

### Firebase Storage (for meal photos)
1. Go to **Build → Storage**
2. Click **Get started**
3. Choose **Start in production mode**
4. Select the same location as your Firestore
5. In the **Rules** tab, replace the rules with:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /meal-photos/{allPaths=**} {
      allow read:  if true;
      allow write: if request.auth != null
                   && request.resource.size < 2 * 1024 * 1024  // 2MB max
                   && request.resource.contentType.matches('image/.*');
    }
  }
}
```

---

## Step 3: Get Your Firebase Config

1. In the Firebase console, click the **gear icon** (Project Settings)
2. Scroll down to **Your apps**
3. Click the **web icon** (`</>`) to add a web app
4. Name it `wfd-web`, leave "Also set up Firebase Hosting" unchecked
5. Click **Register app**
6. Copy the `firebaseConfig` object — it looks like:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

7. Open `js/config.js` in the project and replace all `REPLACE-WITH-...` values with your actual values.

---

## Step 4: Create App Icons

The app needs two PNG icons. The simplest way is to use a free icon generator:

1. Go to [realfavicongenerator.net](https://realfavicongenerator.net) or [favicon.io](https://favicon.io)
2. Upload or create a simple image (a fork and spoon emoji on a colored background works great)
3. Download the generated icons
4. Save as:
   - `icons/icon-192.png` (192×192 pixels)
   - `icons/icon-512.png` (512×512 pixels)

---

## Step 5: Deploy to GitHub Pages

1. Create a new GitHub repository (e.g., `whats-for-dinner`)
2. Make it **private** (this is a household app — keep it private)
3. Push all the project files to the repository:

```bash
cd /path/to/your/wfd-project
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/whats-for-dinner.git
git push -u origin main
```

4. In the GitHub repository, go to **Settings → Pages**
5. Under **Source**, select **Deploy from a branch**
6. Select branch: `main`, folder: `/ (root)`
7. Click **Save**
8. GitHub will give you a URL like `https://YOUR-USERNAME.github.io/whats-for-dinner/`

**Note:** It takes 1–2 minutes for GitHub Pages to build the first time.

---

## Step 6: Update Firebase Auth Domain

GitHub Pages uses a different domain than `localhost`. You need to add it to Firebase's allowed domains:

1. In Firebase console, go to **Authentication → Settings → Authorized domains**
2. Click **Add domain**
3. Enter your GitHub Pages URL: `YOUR-USERNAME.github.io`
4. Click **Add**

---

## Step 7: First Run — Onboarding

1. Open the app at your GitHub Pages URL on any device
2. Since no accounts exist yet, the app will redirect you to the **Onboarding wizard**
3. Follow the wizard to:
   - Create Owen's account (email + password)
   - Create Hanna's account (email + password)
   - Add each child (name + 4-digit PIN)
   - Set the rotation anchor date (a known "kids home" day)
   - Approve the starter pantry list
4. Once setup is complete, you can start adding meals

---

## Step 8: Install on Your Phones

### iPhone (Safari)
1. Open the app URL in Safari
2. Tap the **Share** button (box with arrow)
3. Tap **Add to Home Screen**
4. Tap **Add**

### Android (Chrome)
1. Open the app URL in Chrome
2. Tap the **three-dot menu**
3. Tap **Add to Home screen**
4. Tap **Add**

The app will appear on your home screen and behave like a native app (no browser chrome, works offline for cached screens).

---

## Troubleshooting

**"Couldn't load profiles" on login screen**
- Check that your `js/config.js` has the correct Firebase values
- Check that Firestore rules are published
- Check browser console for specific errors

**PIN doesn't work**
- PINs are set during onboarding only
- Adults can reset a child's PIN via Settings → Household Management
- PINs are case-sensitive digits only

**Push notifications not working**
- The browser must grant notification permission
- Notifications don't work in some in-app browsers (LinkedIn, Instagram, etc.) — use Safari or Chrome directly

---

*Last updated: September 2026*

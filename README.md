# Echoes Journal (Static Starter)

A simple, GitHub Pages-friendly journaling website starter focused on:

- private-first journaling (no login needed yet)
- family and close-friend sharing
- optional public storytelling
- time-released entries
- section-based organization
- future-ready hooks for AI and media inputs (voice memos, texts, photos)

## Tech

- Plain HTML/CSS/JavaScript
- No frameworks
- **Guest mode:** `localStorage` in the browser
- **Accounts (optional):** Firebase Auth (email/password and **Google** via `signInWithPopup`) and Firestore at `users/{uid}/entries`

## Run locally

From this folder, open `index.html` in your browser.

You can also use any static server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. In GitHub, open **Settings > Pages**.
3. Under **Build and deployment**, choose:
   - **Source:** `Deploy from a branch`
   - **Branch:** `main` (or your default branch), folder `/ (root)`
4. Save and wait for deployment.

Because this is a static site with relative paths, it works cleanly on GitHub Pages.

## Current features included

- Create entries with sections (`Love`, `Career`, `Lessons`, etc.)
- Visibility options:
  - Only Me
  - Family + Close Friends
  - Public Story
  - Specific Person
- Specific-person release metadata:
  - recipient name
  - delivery method (`Portal`, `Email`, `Text`)
- Time-release scheduling (entries stay hidden until release)
- Family timeline view
- Basic filters for section and visibility
- Optional AI opt-in flag with local placeholder insights
- Demo seed button for quick testing

## Firebase setup (accounts + cloud journal)

1. In the [Firebase console](https://console.firebase.google.com/), create a project (or use an existing one).
2. Add a **Web** app and copy the config object. Paste the values into `firebase-config.js` (replace the `YOUR_*` placeholders).
3. **Authentication** (Build → Authentication → Get started → Sign-in method):
   - Enable **Email/Password** (passwordless can stay off).
   - Click **Add new provider** and enable **Google** (use your Google account when prompted, then save).
4. **Firestore:** create a database in production or test mode, then **Rules** — use the rules in this repo’s `firestore.rules` (each user can only read/write `users/{userId}/entries/...` when `userId` matches their auth id). Publish the rules.
5. **Authorized domains** (for GitHub Pages and Google sign-in): Authentication → **Settings** → Authorized domains — add your site (e.g. `yourname.github.io`) and your custom domain if any. **Localhost** works for Live Server / `python -m http.server` once listed (often added by default).
6. After deployment, entries save under your Firebase **UID** once signed in. Use **Import guest entries** to copy any browser-only (`localStorage`) journal into your account.

If Google sign-up hits odd verification issues, your instructor mentioned turning off strict **email enumeration protection** or adding test users in Authentication — follow Firebase Auth troubleshooting for your project.

## Notes for next phase
- Add real delivery integrations (email/SMS) for time-released individual entries
- Add media attachments (voice notes, text imports, photos)
- Add permissions and family-tree relationships
- Replace AI placeholder with secure server-side AI workflows

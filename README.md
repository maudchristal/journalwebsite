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
- Local browser storage (`localStorage`)

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

## Notes for next phase

- Add account/auth layer (then move storage to a backend database)
- Add real delivery integrations (email/SMS) for time-released individual entries
- Add media attachments (voice notes, text imports, photos)
- Add permissions and family-tree relationships
- Replace AI placeholder with secure server-side AI workflows

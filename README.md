# Royalls Studio Lighting Controller

An interactive lighting automation system for TikTok LIVE.

## Project Goal
Allow TikTok viewers to control studio lighting by sending gifts.

## Hardware
- MacBook Pro M3
- Smart lighting (models to be confirmed)

## Planned Features
- TikFinity gift detection
- Home Assistant integration
- Custom lighting effects
- Gift-to-light assignments
- Manual lighting controls
- Expandable automation dashboard

## Development
Built with assistance from ChatGPT Codex.

## Version 1 — simulation dashboard

React, Vite, and TypeScript dashboard. All lights, gifts, and effects are simulated. No physical lighting, TikFinity, or Home Assistant connection is made. Gift assignments are stored locally in your browser; activity history lasts for the current page session (latest 50 events).

### Run on your MacBook Pro M3

Install Node.js 22 LTS or newer, then open Terminal:

```sh
git clone https://github.com/mcmiller309/CHATGPT.git
cd CHATGPT
npm ci
npm run dev
```

If you already have a checkout, use that folder instead of cloning again. Open the localhost address printed by Vite (normally http://127.0.0.1:5173). Keep Terminal running; press Control-C to stop. This binds to your machine only.

Choose a color, adjust brightness, or trigger an effect. Flash runs for 2.4 seconds, Pulse continues until another lighting command, and Blackout switches off the preview. Selecting a color returns to steady lighting. Assign an action to a gift, choose that gift in the test panel, and click **Send test gift**. Check the activity log for the action and gift source. Reduced-motion preferences disable animated effects.

```sh
npm test
npm run build
npm run preview
```

`preview` serves the built dashboard locally, normally on port 4173. Run the build first. No credentials or environment variables are required.

### Save completed code to GitHub

From the project folder, review and commit the changes:

```sh
git status
git diff
git add .gitignore index.html package.json package-lock.json tsconfig.json vite.config.ts src README.md
git commit -m "Build Royalls Studio simulation dashboard"
git push origin main
```

If working on a different branch, push that branch and open a pull request instead. Never commit `.env` files, credentials, or `node_modules`. The app itself does not upload or push changes.

### Future integration boundary

`src/controller.ts` defines typed lighting state, actions, gift mappings, and the `LightingController` simulation adapter. `src/App.tsx` provides the dashboard and browser persistence. Add a separate transport adapter when connecting a backend; keep the pure simulator for development and tests.

Future architecture: dashboard → authenticated local backend → Home Assistant. TikFinity events should enter through the backend, be validated and mapped to allowlisted lighting actions, then broadcast confirmed state to the dashboard. Bind the backend to loopback by default, validate request origins, authenticate requests and event connections, rate-limit gift/effect triggers, and keep Home Assistant credentials server-side. Do not put secrets in `VITE_*` variables, browser storage, or frontend code. Physical-light flash behavior requires separate safety limits; this version animates a virtual preview only.

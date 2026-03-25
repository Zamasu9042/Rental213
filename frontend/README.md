# Frontend starter

Assumptions:
- owner contact is resolved from a separate `UserProfile` service,
- the browser only calls the backend rental API,
- booking conflicts are blocked by **time-window overlap**.

## Run in mock mode

```bash
npm install
npm run dev
```

This is the fastest way to demo the UI because the mock layer already includes:
- a reserved drill slot to show overlap blocking,
- a blocked renter with an unpaid fee,
- a server-side workflow simulation.

## Run against the included backend

Create a `.env` file in `frontend/`:

```bash
VITE_USE_MOCKS=false
VITE_API_BASE_URL=http://localhost:4000
```

Then run:

```bash
npm install
npm run dev
```

## Optional: route through Kong

If you start the backend through Kong, change the base URL to:

```bash
VITE_USE_MOCKS=false
VITE_API_BASE_URL=http://localhost:8000
```


## npm install troubleshooting

If `npm install` times out while trying to download packages from a non-public registry host, delete `node_modules` and reinstall in the project directory. This pack now includes a project-level `.npmrc` that forces the public npm registry and writes future lockfiles without pinned registry tarball URLs.

Recommended recovery commands on Windows PowerShell:

```powershell
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
```

If you want to keep the shipped lockfile, use:

```powershell
Remove-Item -Recurse -Force node_modules
npm install
```

To confirm what registry npm will use in this folder:

```powershell
npm config get registry
```


## White screen fix

If the page is blank, do these in order:

1. Start the frontend with `npm run dev` and open the exact localhost URL Vite prints. Do not open `index.html` directly in your browser.
2. If you use the real backend, make sure `.env` contains `VITE_USE_MOCKS=false` and `VITE_API_BASE_URL=http://localhost:4000`, then start the backend first.
3. Open the browser console. If you see `React is not defined`, use this updated pack because that bug is already fixed here.
4. If it still fails, delete `node_modules`, run `npm install`, then `npm run dev` again.

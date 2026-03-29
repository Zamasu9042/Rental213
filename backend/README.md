# Backend reference implementation

Assumptions:

1. **Missing Account Info Service fixed** by adding `UserProfile` API at `/api/profiles/:userId`.
2. **Browser never calls Camunda directly** because rental creation goes to `/api/rentals`; the backend starts a **server-side workflow adapter** internally.
3. **Availability is enforced by time-window overlap**, not only by equipment status.

## Run

```bash
npm install
npm run start
```

The API starts on `http://localhost:4000`.

## Smoke test

```bash
npm install
npm run smoke
```

## Notes

- This is a runnable **reference backend** so you can demo the fixes now.
- It uses in-memory data and resets whenever you restart.
- The code is intentionally organized by route group so each group can later be ported into its own OutSystems service.


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

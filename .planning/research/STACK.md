# Stack Research

**Domain:** Angular + Electron desktop app — identity governance tooling (SailPoint ISC)
**Researched:** 2026-03-25
**Confidence:** HIGH (all critical picks verified against live npm registry and existing UDK codebase)

---

## Context: This Is Not a Greenfield Repo

The Policy Engine component is being added to an **existing** repo (`ui-development-kit`) that already ships Angular 21 + Electron 36. Stack choices are constrained: no framework deviations are permitted. All version recommendations below match the repo's current pinned versions or the next compatible upgrade.

---

## Recommended Stack

### Core Technologies

| Technology | Version (current in repo) | Latest | Purpose | Why Recommended |
|------------|--------------------------|--------|---------|-----------------|
| Angular | 21.2.4 | 21.2.6 | UI framework | Already in repo. Angular 21 is stable, standalone-first, signals-ready. No migration cost. |
| Electron | 36.8.1 (devDep) | 41.0.4 | Desktop shell | Already in repo. Provides contextIsolation + contextBridge IPC pattern already established. Do NOT upgrade mid-project (36→41 has breaking changes). |
| TypeScript | 5.9.3 | 5.9.3 | Type safety | Already in repo. Pinned — match exactly. |
| RxJS | 7.8.2 | 7.8.2 | Async/reactive state | Already in repo. Used for BehaviorSubject connection state, HTTP interceptors, retry logic. |
| Node.js (Electron main process) | CommonJS / `module: commonjs` | — | Main process module format | The existing `tsconfig.serve.json` compiles to CommonJS. This is a hard constraint: **do not install ESM-only packages** in the electron `app/` workspace. |

### Encrypted Local Storage

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `electron.safeStorage` (built-in) | Electron 36 built-in | Encrypt/decrypt PAT client secret and git auth token to disk | Already the pattern in the UDK codebase (`app/authentication/config.ts`). Uses OS keychain (macOS Keychain, Windows DPAPI, Linux kwallet/gnome-libsecret). No external dependency. Replaced `keytar` which is deprecated. |
| Node.js `fs` (built-in) | Node.js built-in | Store encrypted binary blobs as individual files under `userData` | Pattern already used: `buildSecretFilePath(key, env)` → `safeStorage.encryptString()` → `writeFileSync()`. Extend this exact pattern for PAT secret, git token. |

**What NOT to use for secrets:**
- `electron-store` with `encryptionKey` — encryption is security-through-obscurity (key visible in plain-text app), and v11 is ESM-only which breaks the repo's CommonJS electron process.
- `keytar` — deprecated as of Dec 2022, already removed from this repo.

**Policy Engine persistence (non-secret data):**
For policy definitions, deploy state, and audit log, use the `writeConfig`/`readConfig` IPC pattern already in the repo (plain JSON file in `userData`). For structured audit log, use a simple JSON array appended to a file via `fs`. No additional dependency needed.

### Monaco Editor (JSON Policy Definition)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@jean-merelis/ngx-monaco-editor` | 21.0.0 | Angular wrapper for Monaco editor | Only actively maintained wrapper that targets Angular >=21. Follows Angular major versioning. Required peer: `monaco-editor ^0.47.0`. |
| `monaco-editor` | 0.55.1 (latest) | Core editor engine | Direct dependency required alongside the wrapper. Provides `monaco.languages.json.jsonDefaults.setDiagnosticsOptions()` for JSON schema validation. |

**JSON Schema Validation pattern:**
```typescript
// In component after Monaco loads (onMonacoLoad callback):
monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
  validate: true,
  schemas: [{
    uri: 'http://policy-engine/policy-definition-schema.json',
    fileMatch: ['*'],
    schema: POLICY_DEFINITION_SCHEMA
  }]
});
```
Schema is defined locally in the app (no network call). Monaco's built-in JSON language service handles validation and IntelliSense.

**What NOT to use:**
- `ngx-monaco-editor` (atularen) — last published 5 years ago, max Angular 12, abandoned.
- `ngx-monaco-editor-v2` — actively maintained but targets Angular <21 now superseded by the `@jean-merelis` fork for Angular 21+.

### Local Git Operations

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `isomorphic-git` | 1.37.4 (latest) | Init repo, commit on save, batched push | Pure JavaScript, no native binaries, works with Node.js `fs` module directly in the Electron main process. Supports `init`, `add`, `commit`, `push` with PAT/token auth via `onAuth` callback. Actively maintained (last publish 4 days ago). |
| Node.js `fs` (built-in) | Built-in | File system provider for isomorphic-git | Use `require('fs')` — the same `fs` already used in the UDK main process. No `@isomorphic-git/lightning-fs` needed (that's for browsers; Electron main has real Node `fs`). |
| `isomorphic-git/http/node` (bundled) | Bundled with isomorphic-git | HTTP transport for push/pull to remote | Use the bundled Node HTTP client, not the browser fetch client. |

**Git IPC pattern:**
Expose git operations through a new `gitPreloader` module using the same IPC handler pattern as `setupGitHubHandlers`. Angular calls `window.electronAPI.git.commit(message)` → IPC → main process runs `isomorphic-git` with Node `fs`.

**What NOT to use:**
- Shelling out to system `git` binary — requires git to be installed on the user's machine; creates a hard dependency that fails silently on macOS without Xcode CLI tools.
- `nodegit` / `libgit2` bindings — require native compilation, break with Electron ABI mismatches on every Electron version bump.
- `simple-git` — wraps system git binary, same problem as shelling out.

### HTTP Client and Rate Limit Handling

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `axios` | 1.13.6 (in repo) | HTTP client for ISC REST API calls from main process | Already in repo. `sailpoint-api-client` uses axios under the hood. |
| `axios-retry` | 4.5.0 (latest) | Exponential backoff on HTTP 429 | SailPoint's own developer docs recommend `axios-retry` for 429 handling. Pairs directly with axios. Configures `retryCondition: (error) => error.response?.status === 429`, `retryDelay: axiosRetry.exponentialDelay`. |
| Angular `HttpClient` (built-in) | Angular 21 built-in | HTTP from Angular renderer for any renderer-side calls | Already in repo. Use `HttpInterceptorFn` (functional interceptors, Angular 15+ pattern) for adding Bearer token headers. Do not use `HttpInterceptor` class-based form — it's the deprecated pattern in Angular 21. |

**Rate limit configuration for SailPoint ISC:**
```typescript
axiosRetry(axiosInstance, {
  retries: 3,
  retryCondition: (error) => error.response?.status === 429,
  retryDelay: (retryCount) => axiosRetry.exponentialDelay(retryCount, undefined, 1000),
  onRetry: (retryCount, error) => console.warn(`Rate limited, retry ${retryCount}`)
});
```
ISC returns `Retry-After` header on 429 — read it and use it as the delay floor when present.

### Angular IPC Bridge Pattern

The UDK repo already establishes the canonical pattern. The Policy Engine must follow it exactly:

```
Angular service → window.electronAPI.policyEngine.[method]()
  → preload.ts (contextBridge.exposeInMainWorld)
  → ipcRenderer.invoke('policy-engine:[action]', ...args)
  → ipcMain.handle('policy-engine:[action]', handler)
  → app/policy-engine/ipc-handlers.ts
```

Create `app/policy-engine/ipc-handlers.ts` and `app/policy-engine/policy-engine-preload.ts`, then spread into `preload.ts` alongside existing preloaders.

**Do not** use `nodeIntegration: true` or call Node APIs directly from Angular — the existing repo already enforces `contextIsolation: true`.

### Angular UI Components

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Angular Material | 21.2.2 (in repo) | UI component library (forms, buttons, dialogs, chips) | Already in repo. Use `MatDialog` for deploy progress modal and pre-deploy diff viewer, `MatChipsModule` for "Policies in Scope" chip list. |
| Angular CDK — Drag & Drop | 21.2.2 (in repo) | Policy priority reordering | Already in repo (`@angular/cdk`). Use `cdkDropList` + `cdkDrag` + `moveItemInArray` utility. No additional install. |
| `sailpoint-components` library | `projects/sailpoint-components` (local workspace) | UDK-specific shared components, `ElectronApiFactoryService` | Local library in this monorepo. All new components must use `ElectronApiFactoryService` for IPC calls (not raw `window.electronAPI`) — this is the existing repo pattern. |

### SailPoint API Client

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `sailpoint-api-client` | 1.8.1 (in repo) / 1.8.6 (latest) | TypeScript client for SailPoint ISC REST APIs | Official SailPoint SDK. Already in repo. Provides typed access to transforms, identity profiles, roles, access profiles, segments, provisioning policies, entitlements APIs. Uses `Configuration` + per-API class pattern (e.g., `TransformsApi`, `RolesApi`). |

**Version note:** Update to 1.8.6 before starting — it's the latest stable and the project's own README says to update both `package.json` and `app/package.json`. The v2026 API was released 2026-03-24; the `sailpoint-api-client` package will be updated to expose v2026 endpoints. This project targets v2025 only — pin to `1.8.6` and do not chase v2026 in v1.

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `diff` | 8.0.3 (in repo) | Text diffing for pre-deploy diff viewer | Already in repo. Use `diffJson()` for structured JSON diffs between local policy state and live ISC state. |
| `js-yaml` | ^4.1.1 (in repo) | YAML read/write for `.sailpoint/config.yaml` | Already in repo. Used by UDK auth config. |
| `rxjs` `BehaviorSubject` | 7.8.2 (in repo) | Reactive state for connection status, deploy status, policy list | Use existing pattern from `connection.service.ts`. No additional install. |
| `@ngx-translate/core` | 16.0.4 (devDep in repo) | i18n if needed | Already present. Low priority for v1. |

---

## Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Jest + `jest-preset-angular` | Unit testing | Already configured (`jest.config.js`). Run `npm test`. |
| Playwright | E2E testing | Already configured (`e2e/playwright.config.ts`). |
| `ng-packagr` | Build `sailpoint-components` library | Run `npm run build:components` before testing Policy Engine components that reference the shared lib. |
| ESLint + `@angular-eslint` | Linting | Already configured (`eslint.config.mjs`). Run `npm run lint`. |
| `electron-builder` | Packaging | Already configured (`electron-builder.json`). Run `npm run electron:build`. |
| `nodemon` + `wait-on` | Dev mode hot reload | `npm run dev` → starts Angular dev server + electron with `--serve`. Existing workflow. |

---

## Installation

```bash
# No new core installs needed — Angular 21, Electron 36, Angular Material/CDK already in repo.

# New dependencies to add:
npm install isomorphic-git @jean-merelis/ngx-monaco-editor monaco-editor axios-retry

# No new dev dependencies needed.
```

**Important:** `isomorphic-git` goes in the **root** `package.json` (used in electron main process). `@jean-merelis/ngx-monaco-editor` and `monaco-editor` go in the root `package.json` (consumed by Angular renderer). `axios-retry` goes in the root `package.json` (used alongside axios in main process).

Update `sailpoint-api-client` in both `package.json` and `app/package.json` from `1.8.1` to `1.8.6`:
```bash
npm install sailpoint-api-client@1.8.6
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `electron.safeStorage` | `electron-store` with encryptionKey | Never for this project: v11 is ESM-only (breaks CommonJS electron process), and encryption is cosmetic not cryptographic. |
| `electron.safeStorage` | `keytar` | Never: keytar is deprecated, already removed from UDK. |
| `isomorphic-git` | `simple-git` / `nodegit` | `simple-git` only if you can guarantee git binary is installed on all target machines (you cannot). `nodegit` only if you need deep libgit2 features not in isomorphic-git (you don't). |
| `@jean-merelis/ngx-monaco-editor` | Manual Monaco integration via webpack config | Manual integration is viable if you need fine-grained worker config; `@jean-merelis` handles this with less boilerplate for Angular 21. |
| `axios-retry` | Custom RxJS `retryWhen` interceptor | Custom interceptor if all HTTP goes through Angular `HttpClient`. For this project, ISC API calls originate in the electron main process (via `sailpoint-api-client` + axios), so axios-retry is the right fit. |
| Functional `HttpInterceptorFn` | Class-based `HttpInterceptor` | Never for new code in Angular 21: class-based interceptors are deprecated. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `electron-store` v11 | ESM-only; repo compiles electron to CommonJS. Will throw at runtime. | `electron.safeStorage` + `fs` (already in repo pattern) |
| `keytar` | Deprecated Dec 2022, unmaintained, ABI breaks with Electron upgrades. | `electron.safeStorage` |
| `ngx-monaco-editor` (atularen) | Abandoned, max Angular 12. | `@jean-merelis/ngx-monaco-editor` |
| `simple-git` / `nodegit` | Requires system git binary or native C++ compilation. | `isomorphic-git` |
| `Zone.js` removal / zoneless mode | Angular 21 supports zoneless but the UDK is `zone.js: 0.15.1` and not yet migrated. Removing Zone.js will break the entire existing app. | Keep Zone.js for v1. |
| `Signal Forms` (experimental) | Angular 21 signal forms are experimental — API may change before stable. | Use `ReactiveFormsModule` with `FormGroup`/`FormControl` for policy forms. |
| ISC API v2026 endpoints | v2026 released 2026-03-24 and `sailpoint-api-client` will update. The project spec says v2025 only. | Pin `sailpoint-api-client@1.8.6`, call `/v2025/` paths only. |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@jean-merelis/ngx-monaco-editor@21.0.0` | `@angular/core@>=21.0.0`, `monaco-editor@^0.47.0` | Use `monaco-editor@0.55.1` (latest in range). |
| `isomorphic-git@1.37.4` | Node.js `fs` module (built-in) | In Electron main process use `require('fs')`. Do NOT use `@isomorphic-git/lightning-fs` — that's for browsers. |
| `electron@36.8.1` | `electron-builder@26.8.1` | Pinned pair. Do not upgrade Electron mid-project — ABI changes break native modules like `keytar` (already removed) and can affect `safeStorage` behavior. |
| `@angular/cli@17.3.17` | `@angular/core@21.2.4` | CLI v17 in devDeps but Angular is v21. This mismatch is intentional in the UDK (uses `@angular/build` separately). Do not "fix" it. |
| `sailpoint-api-client@1.8.6` | ISC API `/v2025/` | v2026 API was released 2026-03-24. `sailpoint-api-client` will bump to expose v2026. Stay on `1.8.6` for v1. |
| `axios-retry@4.5.0` | `axios@1.x` | Confirmed compatible. axiosRetry 4.x requires axios 1.x. |

---

## Stack Patterns by Variant

**For IPC handler modules (electron main process):**
- Create `app/policy-engine/ipc-handlers.ts` + `app/policy-engine/policy-engine-preload.ts`
- Follow exact same module structure as `app/github/ipc-handlers.ts` and `app/github/github-preload.ts`
- Register in `app/main.ts` → `setupPolicyEngineHandlers()`
- Expose in `app/preload.ts` → `...policyEnginePreloader`

**For Angular services (renderer process):**
- Use `ElectronApiFactoryService` from `sailpoint-components` to get the IPC API
- Inject `ConnectionService` for connection state — do not duplicate auth checks
- Use `BehaviorSubject` + `async` pipe pattern already established in the repo

**For git operations (main process):**
- Initialize local git repo in a sub-directory of `app.getPath('userData')` — e.g., `path.join(app.getPath('userData'), 'policy-engine-repo')`
- Pass `author` as the configured service account (from policy engine settings)
- Include operator name in commit message (from resolved ISC identity, passed as IPC argument)
- Schedule batched push using `setInterval` in main process; track "has unpushed commits" flag via `git.log` count comparison

**For Monaco editor in Angular component:**
- Load `@jean-merelis/ngx-monaco-editor` in standalone component imports
- Set JSON schema in `onMonacoInit` callback using `monaco.languages.json.jsonDefaults.setDiagnosticsOptions()`
- Define schema as a TypeScript const in the component — no runtime fetch

---

## Sources

- npm registry (live queries March 2026) — `electron@41.0.4`, `isomorphic-git@1.37.4`, `@jean-merelis/ngx-monaco-editor@21.0.0`, `monaco-editor@0.55.1`, `axios-retry@4.5.0`, `sailpoint-api-client@1.8.6`
- UDK repo `package.json` (root + `app/`) — confirmed Angular 21.2.4, Electron 36.8.1, axios 1.13.6, diff 8.0.3, existing safeStorage pattern
- UDK `app/authentication/config.ts` — confirmed `electron.safeStorage` pattern for secrets (not keytar, not electron-store)
- UDK `tsconfig.serve.json` — confirmed `"module": "commonjs"` (blocks ESM-only packages in electron main)
- [electron-store GitHub README](https://github.com/sindresorhus/electron-store) — confirmed v11 ESM-only, MEDIUM confidence
- [Electron safeStorage official docs](https://www.electronjs.org/docs/latest/api/safe-storage) — confirmed async API preference, DPAPI on Windows, Keychain on macOS
- [Freek.dev: Replacing Keytar with safeStorage](https://freek.dev/2103-replacing-keytar-with-electrons-safestorage-in-ray) — confirmed migration rationale
- [isomorphic-git official site](https://isomorphic-git.org/) — confirmed Node.js fs usage pattern for Electron
- [SailPoint rate limit docs](https://developer.sailpoint.com/docs/api/rate-limit/) — confirmed 429 + Retry-After header pattern
- [SailPoint axios-retry recommendation](https://developer.sailpoint.com/docs/connectivity/saas-connectivity/in-depth/handling-rate-limits/) — confirmed axios-retry as recommended approach
- [Angular CDK Drag & Drop official docs](https://material.angular.dev/cdk/drag-drop) — confirmed `moveItemInArray`, HIGH confidence
- [Angular v21 announcement](https://blog.angular.dev/announcing-angular-v21-57946c34f14b) — confirmed standalone-first, signal forms still experimental
- [SailPoint v2026 API announcement](https://developer.sailpoint.com/discuss/t/introducing-sailpoint-api-v2026/199586) — confirmed v2026 released 2026-03-24, pin to v2025 client

---
*Stack research for: Policy Engine — Angular + Electron desktop identity governance tool*
*Researched: 2026-03-25*

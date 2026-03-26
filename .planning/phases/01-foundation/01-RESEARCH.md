# Phase 1: Foundation - Research

**Researched:** 2026-03-25
**Domain:** Electron security hardening, IPC bridge architecture, encrypted local store, Angular lazy-loaded module scaffold
**Confidence:** HIGH (codebase inspection + established Electron/Angular patterns)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Settings layout:** Tabbed settings panel — 3 tabs: Source Metadata, ISC Connection, Git Settings
- **Navigation:** Full navigated page (own route), not modal or drawer
- **Default tab:** Always ISC Connection on open (no last-tab memory)
- **Access point:** Gear icon top-right of app chrome
- **Settings scope:** Global only — per-policy config is Phase 3
- **Connection badge:** Small connected/not-configured indicator in settings header; clicking navigates to ISC Connection tab
- **Save behavior:** Explicit save button per tab; unsaved state shown via dot/asterisk on tab label AND save button state
- **Success feedback:** Inline toast auto-dismissing after ~2-3 seconds ("Settings saved")
- **Navigate-away guard:** Confirmation dialog when leaving tab with unsaved changes
- **Credential masking:** PAT client secret and git auth token — always masked, no show/hide reveal
- **Credential re-load:** Placeholder dots (••••••••••) when reopened after save — value never re-loaded into DOM
- **Credential indicator:** Subtle lock icon + tooltip: "Encrypted via OS keychain (safeStorage)"
- **Validation triggers:** On blur + on save attempt
- **ISC URL validation:** Format only (https://tenant.api.identitynow.com pattern) — no connectivity check in Phase 1
- **Required fields:** ISC tenant URL, PAT client ID, PAT secret; all others optional
- **Error display:** Inline below each invalid field (standard Angular Material error messages)
- **First-run:** Land on Policy Engine home with dismissible "Setup required" banner pointing to settings
- **After first ISC save:** Prompt admin to run Test Connection (Phase 2 action)
- **Setup banner:** Stays visible until ISC connection successfully tested (Phase 2) — auto-dismisses on success
- **Module entry:** Policy Engine as new sidebar nav item in existing UDK left sidebar
- **Empty state:** Friendly message + "Configure your ISC connection to get started" button on PE home
- **Lazy-load UX:** Skeleton/spinner while policy engine module loads
- **IPC namespace:** All PE channels use `pe:` prefix (e.g., `pe:getSettings`, `pe:saveSettings`, `pe:deploy`)
- **Title bar:** Follow existing UDK convention
- **Tray scaffold:** System tray icon created in Phase 1 (primary purpose: background git push in Phase 6)
- **Factory reset:** Destructive action with two-step confirmation; clears all local store; navigates to ISC Connection tab with setup banner
- **Reset granularity:** Full reset only
- **Export:** JSON file (policy-engine-settings.json) — non-secret fields only
- **Import:** Available alongside export; silent import, no redirect; admin re-enters secrets manually

### Claude's Discretion

- Clear/remove stored secret button design and confirmation pattern
- Responsive tab behavior on narrow windows
- Exact minimum window size values
- Window size/position persistence implementation details
- Tray icon menu items and behavior when window is minimized

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within Phase 1 scope

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONN-01 | Admin can configure source metadata (name, description, owner, governance group) | Angular Material reactive form, `pe:getSettings`/`pe:saveSettings` IPC, encrypted-file store pattern |
| CONN-02 | Admin can configure ISC connection (tenant API URL, PAT client ID, PAT secret) | `safeStorage` + `setSecureValue`/`getSecureValue` pattern from `app/authentication/config.ts`; credential masking in renderer form |
| CONN-04 | Admin can configure git settings (committer name/email, remote URL, auth token, push interval) | Same IPC + store pattern; auth token treated as secret via `safeStorage` |

</phase_requirements>

---

## Summary

Phase 1 establishes the Electron security posture, all persistent settings, and the Angular module entry point — none of which require ISC API connectivity. The biggest risk is the existing `nodeIntegration: true` flag in `app/main.ts` (line 46): **this must be changed to `false` as the very first code change in this phase**, because every subsequent feature inherits the renderer's security model. All IPC must flow through the contextBridge pattern already demonstrated in `app/preload.ts`.

The project already has a mature, well-tested `safeStorage` integration at `app/authentication/config.ts`. The `setSecureValue` / `getSecureValue` / `deleteSecureValue` functions use `safeStorage.encryptString` / `safeStorage.decryptString` and persist encrypted blobs to `~/.sailpoint/secure/*.enc` files. The policy-engine settings store should follow this **exact** pattern, using `pe:` prefixed keys and a dedicated `app/policy-engine/` module folder alongside the existing `app/authentication/`, `app/connector/`, etc.

The Angular side uses Angular 21 with standalone components, Angular Material, and lazy-loaded routes already demonstrated via `component-selector` in `app.routes.ts`. The policy engine module should be a `src/app/policy-engine/` directory with a lazy-loaded route, a `PolicyEngineIpcService` that wraps `window.electronAPI.pe.*`, and a tabbed settings component using `MatTabsModule`. The `ngx-translate` package is already installed for i18n.

**Primary recommendation:** Fix `nodeIntegration: true → false` first, then scaffold the `app/policy-engine/` Electron module + `src/app/policy-engine/` Angular module in parallel, following the established connector/sdk module split pattern exactly.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Electron | 36.8.1 (installed) | Desktop shell | Already in project |
| Angular | 21.2.4 (installed) | Renderer framework | Already in project |
| Angular Material | 21.2.2 (installed) | UI components (tabs, forms, snackbar, dialogs) | Already in project |
| `safeStorage` (Electron built-in) | — | OS-keychain-backed secret encryption | Already used in `app/authentication/config.ts` — exact pattern to follow |
| `contextBridge` (Electron built-in) | — | Secure IPC bridge | Already used in `app/preload.ts` |
| `fs` (Node built-in) | — | Non-secret settings persistence (JSON file in `app.getPath('userData')`) | Already used in `main.ts` `read-config`/`write-config` handlers |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@angular/material/tabs` | 21.2.2 | 3-tab settings panel | Settings screen |
| `@angular/material/snack-bar` | 21.2.2 | "Settings saved" toast | After successful save |
| `@angular/material/dialog` | 21.2.2 | Navigate-away guard, two-step reset confirmation | Unsaved changes guard, factory reset |
| `@angular/forms` (ReactiveFormsModule) | 21.2.4 | Form validation (blur + save), dirty tracking | All settings forms |
| `@angular/router` (CanDeactivate guard) | 21.2.4 | Navigate-away guard | Settings route |
| `@angular/cdk/layout` (BreakpointObserver) | 21.2.2 | Responsive tab behavior on narrow windows | Claude's discretion layout |
| `electron-window-state` | npm, ~5.0.3 | Window size/position persistence | Claude's discretion — standard pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `safeStorage` + `.enc` file | `electron-store` with `encryptionKey` | Project already uses `safeStorage` — do not introduce a second secret-storage mechanism |
| Custom JSON settings file (`app.getPath('userData')`) | `electron-store` library | Project already hand-rolls JSON persistence in `main.ts`; introducing `electron-store` adds a dependency but simplifies schema; **choose one approach and be consistent** — see Architecture Patterns below |
| Angular lazy-loaded route | Angular library project | Route lazy-loading is simpler; library only needed if PE module ships as reusable package |

**Installation (new dependency only):**
```bash
npm install electron-window-state
npm install --save-dev @types/electron-window-state
```
*(All other dependencies are already installed)*

---

## Architecture Patterns

### Recommended Project Structure

```
app/
└── policy-engine/            # Electron main-process module (new)
    ├── ipc-handlers.ts       # setupPolicyEngineHandlers() — mirrors connector/ipc-handlers.ts
    ├── pe-preload.ts         # pePreloader object — mirrors connector/connector-preload.ts
    ├── settings.ts           # read/write non-secret settings to userData JSON
    └── preload-api.ts        # TypeScript interface: IpcPolicyEngineApi (contract definition)

src/app/
└── policy-engine/            # Angular renderer module (new)
    ├── policy-engine.routes.ts     # Routes: '', 'settings'
    ├── policy-engine-home/
    │   └── policy-engine-home.component.ts   # Empty state + setup banner
    ├── settings/
    │   ├── settings.component.ts             # Tabbed container (MatTabs)
    │   ├── source-metadata-tab/
    │   ├── isc-connection-tab/
    │   └── git-settings-tab/
    └── services/
        └── policy-engine-ipc.service.ts      # Wraps window.electronAPI.pe.*
```

### Pattern 1: Module-scoped IPC handlers (follow existing connector pattern)

**What:** Each functional module owns its own `ipc-handlers.ts` and `*-preload.ts`. Main process calls `setupXxxHandlers()`. Preload merges the module's preloader object into `contextBridge.exposeInMainWorld('electronAPI', { ... })`.

**When to use:** For all new `pe:` IPC channels.

**Example (following `app/connector/ipc-handlers.ts`):**
```typescript
// app/policy-engine/ipc-handlers.ts
import { ipcMain } from 'electron';
import { readPeSettings, writePeSettings } from './settings';
import { getSecureValue, setSecureValue, deleteSecureValue } from '../authentication/config';

export function setupPolicyEngineHandlers(): void {
  ipcMain.handle('pe:getSettings', async () => {
    return readPeSettings();
  });

  ipcMain.handle('pe:saveSettings', async (_event, payload: PeSettingsPayload) => {
    // Non-secret fields → JSON file
    await writePeSettings(payload.nonSecrets);
    // Secrets → safeStorage
    if (payload.patSecret !== undefined) {
      setSecureValue('pe.isc.patSecret', 'policy-engine', payload.patSecret);
    }
    if (payload.gitAuthToken !== undefined) {
      setSecureValue('pe.git.authToken', 'policy-engine', payload.gitAuthToken);
    }
    return { success: true };
  });

  ipcMain.handle('pe:clearSecret', async (_event, secretKey: 'patSecret' | 'gitAuthToken') => {
    const keyMap = { patSecret: 'pe.isc.patSecret', gitAuthToken: 'pe.git.authToken' };
    deleteSecureValue(keyMap[secretKey], 'policy-engine');
    return { success: true };
  });

  ipcMain.handle('pe:exportSettings', async () => {
    // Returns non-secret fields only — never returns secrets
    return readPeSettings();
  });

  ipcMain.handle('pe:importSettings', async (_event, data: unknown) => {
    // Validates and merges — never writes secrets
    return importPeSettings(data);
  });

  ipcMain.handle('pe:factoryReset', async () => {
    deletePeSettingsFile();
    deleteSecureValue('pe.isc.patSecret', 'policy-engine');
    deleteSecureValue('pe.git.authToken', 'policy-engine');
    return { success: true };
  });
}
```

### Pattern 2: Typed preload API contract

**What:** Define the IPC surface as a TypeScript interface in `preload-api.ts` before wiring. This is the `pe:` namespace contract that all future phases extend.

**Example:**
```typescript
// app/policy-engine/preload-api.ts
export interface IpcPolicyEngineApi {
  getSettings: () => Promise<PeSettingsResult>;
  saveSettings: (payload: PeSettingsPayload) => Promise<{ success: boolean }>;
  clearSecret: (key: 'patSecret' | 'gitAuthToken') => Promise<{ success: boolean }>;
  exportSettings: () => Promise<PeNonSecretSettings>;
  importSettings: (data: unknown) => Promise<{ success: boolean; error?: string }>;
  factoryReset: () => Promise<{ success: boolean }>;
}
```

### Pattern 3: Secret-never-in-DOM credential fields

**What:** PAT client secret and git auth token fields show `••••••••••` (placeholder, not actual value) when a secret is stored. The actual value is **never sent from main to renderer**. The renderer sends a new value only when the user types in the field; an empty/unchanged field is a sentinel meaning "leave stored value alone."

**Implementation approach:**
1. `pe:getSettings` returns `{ patSecretStored: boolean }` — a flag, not the decrypted value.
2. In the form, initialize the secret field as empty with a `placeholder="••••••••••"` when `patSecretStored === true`.
3. On save: only include `patSecret` in the payload if the field's value is non-empty (user typed something new).

### Pattern 4: Angular lazy-loaded route (follow `component-selector` pattern)

**What:** Add policy engine as a lazy-loaded route in `app.routes.ts` and a sidebar nav item in `app.component.html`.

**Example (`app.routes.ts` addition):**
```typescript
{
  path: 'policy-engine',
  loadChildren: () =>
    import('./policy-engine/policy-engine.routes').then(m => m.POLICY_ENGINE_ROUTES)
}
```

**Example (`policy-engine.routes.ts`):**
```typescript
export const POLICY_ENGINE_ROUTES: Routes = [
  { path: '', component: PolicyEngineHomeComponent },
  { path: 'settings', component: SettingsComponent }
];
```

### Pattern 5: Security configuration fix

**What:** `app/main.ts` line 46 currently sets `nodeIntegration: true`. This **must** be changed to `nodeIntegration: false` before any feature code is written. `contextIsolation: true` is already set (line 48). Add `sandbox: true` as well (per STATE.md decision).

**CRITICAL — fix in `createWindow()`:**
```typescript
webPreferences: {
  nodeIntegration: false,        // CHANGE from true
  contextIsolation: true,        // already correct
  sandbox: true,                 // ADD
  preload: path.join(__dirname, 'preload.js'),
  allowRunningInsecureContent: serve,
},
```

**Verification in DevTools:** After this change, `window.require` and `window.process` must be `undefined` in renderer console. `window.electronAPI` must be the only bridge.

### Anti-Patterns to Avoid

- **Returning decrypted secrets from main to renderer:** `pe:getSettings` must never include secret values in its response. Return `patSecretStored: boolean` only.
- **Using `ipcRenderer` directly in renderer code:** All IPC must flow through `window.electronAPI.pe.*` (contextBridge). Never import from `electron` in Angular code.
- **Putting `pe:` handlers directly in `app/main.ts`:** Follow the module pattern — add to `app/policy-engine/ipc-handlers.ts` and call `setupPolicyEngineHandlers()` from `main.ts`.
- **Storing secrets in the `userData` JSON config:** Only non-sensitive settings go in the JSON file. PAT secret and git auth token go through `safeStorage` only.
- **Re-loading secret values into form fields on reopen:** Fields show placeholder dots, not the decrypted value.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secret encryption at rest | Custom AES/CBC | `safeStorage.encryptString` / `decryptString` | OS-native keychain; cross-platform; already in project |
| Window size persistence | Manual `localStorage` | `electron-window-state` npm package | Handles multi-display, crash recovery, first-launch defaults |
| Angular form dirty state tracking | Manual flag | `FormGroup.dirty` / `FormGroup.pristine` | Built into Angular reactive forms; drives tab dot indicator |
| Navigate-away guard | Router event subscription | Angular `CanDeactivate` functional guard | Framework-provided; works with Angular router lifecycle |
| Toast notification | Custom overlay | `MatSnackBar.open()` | Already in project (Angular Material) |
| Unsaved changes dialog | Custom component | `MatDialog` with confirm/cancel | Already in project |

**Key insight:** The secret-storage problem is deceptively complex on Windows (DPAPI), macOS (Keychain), and Linux (libsecret). `safeStorage` abstracts all three. The project already uses it correctly — the policy engine must mirror that pattern, not invent a new one.

---

## Common Pitfalls

### Pitfall 1: `nodeIntegration: true` not fixed before feature code

**What goes wrong:** Renderer code can require Node modules directly, bypassing the IPC bridge. Any XSS vulnerability in the renderer would grant full system access.
**Why it happens:** The flag is `true` in the existing `main.ts`; it's easy to overlook when focused on feature work.
**How to avoid:** Make changing `nodeIntegration: false` + adding `sandbox: true` the **first committed task** of this phase, verified by checking `window.require === undefined` in DevTools.
**Warning signs:** DevTools console shows `window.require` is defined.

### Pitfall 2: Secret value leaking through IPC response

**What goes wrong:** `pe:getSettings` returns the decrypted PAT secret or git auth token, which then sits in renderer memory / is visible in DevTools network panel.
**Why it happens:** Laziness — returning the full settings object is easier than splitting secret vs. non-secret fields.
**How to avoid:** Design the response type upfront with only `patSecretStored: boolean` and `gitAuthTokenStored: boolean`. Never decrypt secrets in `pe:getSettings`.
**Warning signs:** DevTools → Application → IPC or renderer memory shows plaintext secret.

### Pitfall 3: `safeStorage` unavailable on Linux without libsecret

**What goes wrong:** `safeStorage.isEncryptionAvailable()` returns `false` on headless Linux or some CI environments; `encryptString` throws.
**Why it happens:** Linux `safeStorage` requires a running secret service (gnome-keyring or kwallet).
**How to avoid:** Always check `safeStorage.isEncryptionAvailable()` before calling encrypt/decrypt — the existing `showEncryptionUnavailableError()` dialog in `app/authentication/config.ts` handles this correctly. Mirror it in policy-engine handlers.
**Warning signs:** App crashes silently on Linux CI; test environment error `"Encryption not available"`.

### Pitfall 4: `contextBridge` type mismatch breaks runtime

**What goes wrong:** `window.electronAPI.pe` is `undefined` at runtime because the preloader was added to `app/policy-engine/pe-preload.ts` but never spread into the `contextBridge.exposeInMainWorld` call in `app/preload.ts`.
**Why it happens:** Forgetting to add `...pePreloader` to `preload.ts`.
**How to avoid:** Add `...pePreloader` to `preload.ts` in the same task that creates `pe-preload.ts`. Write the TypeScript global type extension (`declare global { interface Window { electronAPI: { pe: IpcPolicyEngineApi } } }`) so TypeScript catches missing properties at compile time.
**Warning signs:** `TypeError: window.electronAPI.pe.getSettings is not a function` at runtime.

### Pitfall 5: Angular lazy-load chunk fails due to missing provider

**What goes wrong:** Policy engine route lazy-loads but throws `NullInjectorError` because `PolicyEngineIpcService` was not provided at the right level.
**Why it happens:** Standalone component imports don't automatically inherit root-level providers; service needs `providedIn: 'root'` or be listed in the lazy-loaded route's `providers` array.
**How to avoid:** Declare `PolicyEngineIpcService` with `@Injectable({ providedIn: 'root' })` since it wraps a global resource (`window.electronAPI`).
**Warning signs:** Console error `NullInjectorError: No provider for PolicyEngineIpcService`.

### Pitfall 6: `pe:` handlers registered multiple times on hot-reload

**What goes wrong:** In dev mode with `electron-reloader`, `setupPolicyEngineHandlers()` is called again on file change, causing `ipcMain.handle` to throw "Attempted to register a second handler for...".
**Why it happens:** `electron-reloader` re-requires modules but doesn't clear existing handlers.
**How to avoid:** Use `ipcMain.removeHandler('pe:...')` before each `ipcMain.handle(...)` call in the setup function, or guard with a flag. Same pitfall exists for all existing handlers but may not manifest in current use.
**Warning signs:** Dev mode crash `"Attempted to register a second handler for 'pe:getSettings'"`.

---

## Code Examples

Verified patterns from existing codebase:

### safeStorage encrypt/decrypt (from `app/authentication/config.ts`)
```typescript
// Write encrypted secret
export function setSecureValue(key: string, environment: string, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    showEncryptionUnavailableError();
    throw new Error('Encryption not available');
  }
  const filePath = buildSecretFilePath(key, environment);
  const encryptedData = safeStorage.encryptString(value);
  writeFileSync(filePath, encryptedData);
}

// Read encrypted secret
export function getSecureValue(key: string, environment: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    showEncryptionUnavailableError();
    throw new Error('Encryption not available');
  }
  const filePath = buildSecretFilePath(key, environment);
  if (!existsSync(filePath)) return '';
  const encryptedData = readFileSync(filePath);
  return safeStorage.decryptString(encryptedData);
}
```
**Reuse:** Call `setSecureValue('pe.isc.patSecret', 'policy-engine', value)` and `getSecureValue('pe.isc.patSecret', 'policy-engine')` from policy-engine handlers.

### IPC handler module pattern (from `app/connector/ipc-handlers.ts`)
```typescript
import { ipcMain } from 'electron';

export function setupPolicyEngineHandlers(): void {
  ipcMain.handle('pe:getSettings', async () => { /* ... */ });
  ipcMain.handle('pe:saveSettings', async (_event, payload) => { /* ... */ });
}
```
**Registration in `app/main.ts`:** `setupPolicyEngineHandlers();` alongside the existing `setupConnectorHandlers()` call.

### Preload module pattern (from `app/connector/connector-preload.ts`)
```typescript
const { ipcRenderer } = require('electron');

export const pePreloader = {
  pe: {
    getSettings: () => ipcRenderer.invoke('pe:getSettings'),
    saveSettings: (payload: unknown) => ipcRenderer.invoke('pe:saveSettings', payload),
    clearSecret: (key: string) => ipcRenderer.invoke('pe:clearSecret', key),
    exportSettings: () => ipcRenderer.invoke('pe:exportSettings'),
    importSettings: (data: unknown) => ipcRenderer.invoke('pe:importSettings', data),
    factoryReset: () => ipcRenderer.invoke('pe:factoryReset'),
  }
};
```
**Merge in `app/preload.ts`:** `contextBridge.exposeInMainWorld('electronAPI', { ...pePreloader, ... })`.

### Angular lazy-load route (from `app.routes.ts` `component-selector` pattern)
```typescript
{
  path: 'policy-engine',
  loadChildren: () =>
    import('./policy-engine/policy-engine.routes').then(m => m.POLICY_ENGINE_ROUTES)
}
```

### Angular CanDeactivate guard (navigate-away protection)
```typescript
// src/app/policy-engine/settings/unsaved-changes.guard.ts
import { CanDeactivateFn } from '@angular/router';

export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> =
  (component) => {
    if (!component.hasUnsavedChanges()) return true;
    return confirm('You have unsaved changes. Leave anyway?');
    // Replace confirm() with MatDialog for polished UX
  };
```

### Non-secret settings JSON persistence (follow `main.ts` `read-config`/`write-config` pattern)
```typescript
// app/policy-engine/settings.ts
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const PE_SETTINGS_FILE = 'policy-engine-settings.json';

function getPeSettingsPath(): string {
  return path.join(app.getPath('userData'), PE_SETTINGS_FILE);
}

export function readPeSettings(): PeNonSecretSettings {
  const p = getPeSettingsPath();
  if (!fs.existsSync(p)) return defaultPeSettings();
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

export function writePeSettings(settings: PeNonSecretSettings): void {
  fs.writeFileSync(getPeSettingsPath(), JSON.stringify(settings, null, 2));
}

export function deletePeSettingsFile(): void {
  const p = getPeSettingsPath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `nodeIntegration: true` (renderer has full Node access) | `nodeIntegration: false` + `contextIsolation: true` + `sandbox: true` | Electron v12 security baseline | **Currently wrong in this repo** — must fix as Phase 1 task 1 |
| `remote` module for renderer→main access | `contextBridge` + `ipcRenderer.invoke` | Electron v10 | Already correct in preload.ts |
| `keytar` for secret storage | `safeStorage` (built-in Electron) | Electron v15 | Project has `keytar` in dependencies but `safeStorage` is used in authentication — use `safeStorage` for PE; `keytar` is legacy |
| Angular NgModules | Angular standalone components + `loadChildren` with route arrays | Angular 14+ (stable in v17+) | Already used in this codebase (`component-selector`) |

**Deprecated/outdated:**
- `keytar@7.9.0`: Still in `package.json` dependencies but `app/authentication/config.ts` uses `safeStorage` exclusively. Do not use `keytar` for policy engine secrets.
- `nodeIntegration: true`: Insecure default that remains in `app/main.ts` — this is a known issue to fix.

---

## Open Questions

1. **Window-state persistence library**
   - What we know: `electron-window-state` (npm) is the standard solution; ~5.0 is the current version
   - What's unclear: Whether the existing UDK window launch (fixed `x:0, y:0, width: size.width/2`) is intentional or just a placeholder
   - Recommendation: Use `electron-window-state` for persistence; set a sensible minimum (e.g., 900×700) to prevent settings form breakage — this is Claude's discretion

2. **Tray icon minimum implementation for Phase 1**
   - What we know: Tray scaffold must exist in Phase 1; Phase 6 wires the actual git push behavior
   - What's unclear: Exact menu items for the Phase 1 scaffold (the wiring doesn't exist yet)
   - Recommendation: Create tray with `app.getName()` + version as tooltip, single "Open" menu item, and `app.on('window-all-closed')` should NOT quit on macOS when tray exists — this is Claude's discretion for the specific items

3. **`isComponentEnabled` guard for sidebar policy-engine link**
   - What we know: Existing sidebar links are gated by `isComponentEnabled('name')` which reads from `config.json` `components.enabled` array
   - What's unclear: Whether policy engine should be gated by this mechanism or always visible
   - Recommendation: Add `'policy-engine'` to `components.enabled` in `app/config.json` defaults so it's on by default; respect the existing pattern

---

## Sources

### Primary (HIGH confidence)

- Codebase inspection: `app/authentication/config.ts` — `safeStorage` encrypt/decrypt/delete pattern, verified directly
- Codebase inspection: `app/main.ts` — `nodeIntegration: true` confirmed on line 46, `contextIsolation: true` confirmed on line 48
- Codebase inspection: `app/preload.ts` — `contextBridge.exposeInMainWorld` + spread preloader pattern confirmed
- Codebase inspection: `app/connector/ipc-handlers.ts` + `app/connector/connector-preload.ts` — module IPC pattern confirmed
- Codebase inspection: `src/app/app.routes.ts` — `loadComponent` lazy-load pattern confirmed
- Codebase inspection: `package.json` — Angular 21.2.4, Electron 36.8.1, Angular Material 21.2.2, Jest installed
- Codebase inspection: `jest.config.js` — Jest with `ts-jest`, roots in `src/`, testMatch `*.spec.ts`

### Secondary (MEDIUM confidence)

- Angular standalone lazy-loading with `loadChildren` and route arrays: standard Angular 17+ pattern, consistent with `component-selector` lazy route
- `electron-window-state` npm package: standard Electron community solution for window persistence

### Tertiary (LOW confidence)

- `ipcMain.removeHandler()` as guard against double-registration on hot-reload: Electron API behavior; verify with official Electron docs during implementation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all core libraries verified from package.json; safeStorage pattern verified from source
- Architecture: HIGH — patterns inferred directly from existing codebase modules
- Pitfalls: HIGH (nodeIntegration, secret-in-DOM) / MEDIUM (hot-reload double-registration, safeStorage Linux) — all grounded in real code observations
- Open questions: LOW — minor implementation details, all have clear default answers

**Research date:** 2026-03-25
**Valid until:** 2026-06-25 (stable stack — Angular + Electron major versions unlikely to change within 90 days)

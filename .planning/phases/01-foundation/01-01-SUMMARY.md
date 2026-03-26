---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [electron, ipc, safeStorage, electron-window-state, system-tray, typescript, security]

# Dependency graph
requires: []
provides:
  - Electron security hardening (nodeIntegration: false, contextIsolation: true, sandbox: true)
  - app/policy-engine/ IPC module with 6 channels (pe:getSettings, pe:saveSettings, pe:clearSecret, pe:exportSettings, pe:importSettings, pe:factoryReset)
  - Encrypted secret storage for pe.isc.patSecret and pe.git.authToken via safeStorage
  - Non-secret settings persistence in policy-engine-settings.json (userData)
  - window.electronAPI.pe.* TypeScript contract for Angular renderer
  - electron-window-state integration (900x700 min, 1200x800 default, state persisted across restarts)
  - System tray scaffold with Open/Quit menu and macOS background-run support
affects: [02-settings-ui, 03-isc-integration, 04-git-integration, all renderer features using window.electronAPI.pe]

# Tech tracking
tech-stack:
  added: [electron-window-state@5.0.3, @types/electron-window-state@2.0.34]
  patterns:
    - pe: IPC channel namespace for all policy-engine handlers
    - preload-api.ts defines shared interfaces imported by both main-process and renderer
    - setupXxxHandlers() pattern with removeHandler guards against hot-reload double-registration
    - safeStorage encrypted files at ~/.sailpoint/secure/pe_isc_patSecret_policy_engine.enc pattern (follows existing config.ts convention)

key-files:
  created:
    - app/policy-engine/preload-api.ts
    - app/policy-engine/settings.ts
    - app/policy-engine/ipc-handlers.ts
    - app/policy-engine/pe-preload.ts
  modified:
    - app/main.ts
    - app/preload.ts
    - package.json

key-decisions:
  - "pe: IPC namespace isolates policy-engine channels from all other app channels"
  - "pe:getSettings returns patSecretStored/gitAuthTokenStored boolean flags only — decrypted values never leave main process"
  - "importPeSettings strips secrets from import data by constructing a clean object rather than merging (defense-in-depth)"
  - "System tray uses nativeImage.createEmpty() as placeholder — real icon to be added when assets are available"
  - "windowStateKeeper replaces hardcoded screen.getPrimaryDisplay() — window remembers position/size across restarts"

patterns-established:
  - "Pattern: IPC module structure — preload-api.ts (types) + settings.ts (persistence) + ipc-handlers.ts (main-process) + pe-preload.ts (renderer bridge)"
  - "Pattern: Secret storage uses setSecureValue/getSecureValue/deleteSecureValue from authentication/config.ts — consistent key format key.sub.name + environment string"
  - "Pattern: pe-preload.ts exports named object pePreloader spread into contextBridge in preload.ts — same as connectorPreloader"

requirements-completed: [CONN-01, CONN-02, CONN-04]

# Metrics
duration: 9min
completed: 2026-03-26
---

# Phase 1 Plan 01: Electron Security Hardening + Policy Engine IPC Module Summary

**Electron sandbox enforced (nodeIntegration: false, sandbox: true) with full pe: IPC bridge, safeStorage secret persistence, window-state, and tray scaffold wired into main process**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-26T03:03:45Z
- **Completed:** 2026-03-26T03:12:06Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Electron security posture hardened: nodeIntegration: false, contextIsolation: true, sandbox: true in webPreferences — renderer has no direct Node.js access
- Complete policy-engine IPC module created (4 files): typed contract, JSON settings persistence, 6 IPC handlers with safeStorage encryption, renderer preload bridge
- pePreloader spread into contextBridge makes window.electronAPI.pe.* available in renderer with full TypeScript types; setupPolicyEngineHandlers() registered in main.ts
- electron-window-state installed: window restores to previous position/size (min 900x700) on every restart
- System tray scaffold added: app stays alive in macOS tray after window close; Open and Quit menu items; double-click to restore window

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Electron security flags + scaffold policy-engine module** - `4f94461` (feat)
2. **Task 2: Wire pePreloader + setupPolicyEngineHandlers + window-state + tray** - `1f42fb8` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `app/policy-engine/preload-api.ts` - IpcPolicyEngineApi, PeNonSecretSettings, PeSettingsResult, PeSettingsPayload interfaces + global Window type extension for Angular type-safety
- `app/policy-engine/settings.ts` - readPeSettings, writePeSettings, deletePeSettingsFile, importPeSettings — JSON persistence to policy-engine-settings.json in userData
- `app/policy-engine/ipc-handlers.ts` - setupPolicyEngineHandlers() with 6 pe: channels; hot-reload guards via removeHandler; pe:getSettings returns boolean flags only (never decrypted secrets)
- `app/policy-engine/pe-preload.ts` - pePreloader object with 6 ipcRenderer.invoke wrappers for renderer bridge
- `app/main.ts` - nodeIntegration: false + sandbox: true; windowStateKeeper replacing hardcoded screen size; createTray() scaffold; setupPolicyEngineHandlers() call; electron-window-state import
- `app/preload.ts` - pePreloader import + spread into contextBridge
- `package.json` - electron-window-state@5.0.3 dependency + @types/electron-window-state@2.0.34 devDependency added

## Decisions Made

- Kept `preload-api.ts` as the source of truth for all PE interfaces (settings.ts imports from it) — plan draft had the import direction inverted; existing partial implementation had the correct direction, which was preserved
- System tray icon uses `nativeImage.createEmpty()` as a scaffold placeholder — a real icon path will be wired in a future task when app icon assets are finalized
- `window-all-closed` handler updated comment only (behavior was already macOS-correct for darwin) — the tray presence is the semantic reason the app stays alive

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type conversion error in settings.ts**
- **Found during:** Task 1 (TypeScript compile verification)
- **Issue:** `record as PeNonSecretSettings` on line 109 of settings.ts caused TS2352 error — `Record<string, unknown>` does not sufficiently overlap with `PeNonSecretSettings`. The partial implementation pre-existing on the branch had this bug.
- **Fix:** Changed `record as PeNonSecretSettings` to `record as unknown as PeNonSecretSettings` (double-cast via unknown, standard TypeScript pattern for intentional structural type overrides)
- **Files modified:** app/policy-engine/settings.ts
- **Verification:** `npx tsc -p tsconfig.serve.json --noEmit` passes with zero errors
- **Committed in:** `4f94461` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in pre-existing partial implementation)
**Impact on plan:** Single-line fix required for correctness. No scope creep.

## Issues Encountered

- `tsconfig.electron.json` referenced in PLAN.md verify step does not exist in this project — the Electron TypeScript config is `tsconfig.serve.json`. Used the correct config for all compile checks.
- Three of the four policy-engine files (`preload-api.ts`, `settings.ts`, `ipc-handlers.ts`) were already present as partial work on the `feature/policy-engine` branch. Only `pe-preload.ts` needed to be created from scratch. The wiring into `preload.ts` and `main.ts` was not yet done.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- IPC contract is locked: all six `pe:` channels are registered and typed. Phase 2 (Settings UI) can invoke `window.electronAPI.pe.*` immediately.
- safeStorage keys are defined: `pe.isc.patSecret` and `pe.git.authToken` with environment `policy-engine`.
- Window position/size persistence and tray scaffold are functional. The tray icon is a placeholder empty image — a real icon asset will be needed for the release build.

---
*Phase: 01-foundation*
*Completed: 2026-03-26*

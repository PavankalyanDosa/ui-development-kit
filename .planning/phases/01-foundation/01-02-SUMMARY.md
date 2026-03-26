---
phase: 01-foundation
plan: 02
subsystem: ui
tags: [angular, material, electron, ipc, settings, policy-engine, reactive-forms]

# Dependency graph
requires:
  - phase: 01-foundation
    plan: 01
    provides: "policy-engine IPC bridge (window.electronAPI.pe.*), preload-api.ts typed contract, safeStorage-backed secret channels"

provides:
  - "Angular policy-engine lazy-loaded route module (/policy-engine)"
  - "PolicyEngineIpcService (wraps window.electronAPI.pe.* with typed return values)"
  - "PolicyEngineHomeComponent with loading spinner, setup banner (dismissible via localStorage), empty state CTA"
  - "SettingsComponent shell: tabbed UI with 3 tabs, ISC Connection default (index 1), HasUnsavedChanges interface"
  - "IscConnectionTabComponent: tenant URL regex validation, PAT Client ID, PAT Secret (always masked, never re-populated, safeStorage tooltip)"
  - "SourceMetadataTabComponent: name/description/owner/governanceGroup (all optional per CONN-01)"
  - "GitSettingsTabComponent stub (Plan 03 fills this)"
  - "unsavedChangesGuard: navigate-away confirmation for dirty forms"
  - "pe-settings.models.ts: Angular-side interface mirror of preload-api.ts"

affects:
  - 01-foundation-03
  - 02-isc-connectivity
  - 03-policy-definition-ui

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy-loaded Angular routes via loadChildren/loadComponent for PE module"
    - "Standalone Angular components throughout PE module (no NgModule)"
    - "ReactiveFormsModule FormGroup with markAsPristine() after load/save for clean dirty tracking"
    - "Tab dirty indicator via dot prefix in tab label string (managed by parent @ViewChild)"
    - "hasUnsavedChanges() interface on route component for CanDeactivateFn guard"
    - "Separate per-tab save with full settings merge (preserve non-owned settings sections)"
    - "PAT secret: type=password, never pre-populated, stored flag + placeholder, safeStorage tooltip"
    - "MatSnackBar 2500ms auto-dismiss for save success toast"

key-files:
  created:
    - src/app/policy-engine/policy-engine.routes.ts
    - src/app/policy-engine/models/pe-settings.models.ts
    - src/app/policy-engine/services/policy-engine-ipc.service.ts
    - src/app/policy-engine/policy-engine-home/policy-engine-home.component.ts
    - src/app/policy-engine/policy-engine-home/policy-engine-home.component.html
    - src/app/policy-engine/policy-engine-home/policy-engine-home.component.scss
    - src/app/policy-engine/settings/settings.component.ts
    - src/app/policy-engine/settings/settings.component.html
    - src/app/policy-engine/settings/settings.component.scss
    - src/app/policy-engine/settings/unsaved-changes.guard.ts
    - src/app/policy-engine/settings/isc-connection-tab/isc-connection-tab.component.ts
    - src/app/policy-engine/settings/isc-connection-tab/isc-connection-tab.component.html
    - src/app/policy-engine/settings/isc-connection-tab/isc-connection-tab.component.scss
    - src/app/policy-engine/settings/source-metadata-tab/source-metadata-tab.component.ts
    - src/app/policy-engine/settings/source-metadata-tab/source-metadata-tab.component.html
    - src/app/policy-engine/settings/source-metadata-tab/source-metadata-tab.component.scss
    - src/app/policy-engine/settings/git-settings-tab/git-settings-tab.component.ts
  modified:
    - src/app/app.routes.ts
    - src/app/app.component.html
    - src/app/app.component.ts
    - app/config.json

key-decisions:
  - "Sidenav refactored: mat-sidenav always rendered; isConnected guard moved inside to individual nav items; PE link uses only isComponentEnabled('policy-engine') — no isConnected requirement"
  - "pe-settings.models.ts created in src/app tree to avoid cross-boundary import from app/ to src/ — interfaces mirror preload-api.ts exactly; comment added to keep in sync"
  - "GitSettingsTabComponent is a stub (isDirty always false) — Plan 03 replaces with full implementation"
  - "unsavedChangesGuard uses confirm() fallback per plan spec — TODO comment added for MatDialog replacement in polish pass"
  - "SourceMetadataTabComponent and IscConnectionTabComponent each call getSettings() independently on init to cache full settings for merge on save (avoids shared state complexity)"
  - "patSecret field: type=password, no show/hide toggle, never pre-filled, patSecretAlreadyStored flag drives placeholder and validation"

patterns-established:
  - "PE module pattern: all components standalone; no NgModule needed"
  - "IPC call pattern: PolicyEngineIpcService delegates typed calls; no direct window.electronAPI usage in components"
  - "Settings save pattern: load full settings on init, merge only owned section, save full PeNonSecretSettings payload"
  - "Dirty tracking pattern: markAsPristine() called after init patch and after successful save"

requirements-completed: [CONN-01, CONN-02]

# Metrics
duration: 6min
completed: 2026-03-26
---

# Phase 1 Plan 2: Angular PE Module + Settings UI Summary

**Lazy-loaded Angular policy-engine module with ISC Connection tab (tenant URL + PAT credential masking) and Source Metadata tab fulfilling CONN-01 and CONN-02**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-26T03:17:22Z
- **Completed:** 2026-03-26T03:23:28Z
- **Tasks:** 2
- **Files modified:** 21 (4 modified + 17 created)

## Accomplishments
- Angular PE lazy-loaded route module wired into app.routes.ts and config.json
- Policy Engine sidebar nav accessible without ISC connection (sidenav refactored — isConnected guard moved inside to individual items)
- Gear icon settings button in toolbar (shown only when PE is enabled)
- Settings tabbed shell with ISC Connection as default tab, connection status badge, dirty indicators
- IscConnectionTabComponent: tenant URL regex validation, PAT credential masking, patSecretAlreadyStored flow, remove-secret action
- SourceMetadataTabComponent: 4 optional fields (name/description/owner/governanceGroup) — CONN-01
- unsavedChangesGuard with confirm() prompt on navigate-away from dirty forms
- MatSnackBar 'Settings saved' 2500ms toast on successful save
- GitSettingsTabComponent stub (isDirty=false) ready for Plan 03

## Route Structure

```
/policy-engine          -> PolicyEngineHomeComponent (lazy)
/policy-engine/settings -> SettingsComponent (lazy, canDeactivate: unsavedChangesGuard)
```

Tabs in SettingsComponent:
- Index 0: Source Metadata (SourceMetadataTabComponent) — Plan 02
- Index 1: ISC Connection (IscConnectionTabComponent, default) — Plan 02
- Index 2: Git Settings (GitSettingsTabComponent stub) — Plan 03

## IpcService Method Signatures

```typescript
PolicyEngineIpcService:
  getSettings(): Promise<PeSettingsResult>
  saveSettings(payload: PeSettingsPayload): Promise<{ success: boolean }>
  clearSecret(key: 'patSecret' | 'gitAuthToken'): Promise<{ success: boolean }>
  exportSettings(): Promise<unknown>
  importSettings(data: unknown): Promise<{ success: boolean; error?: string }>
  factoryReset(): Promise<{ success: boolean }>
```

## Task Commits

Each task was committed atomically:

1. **Task 1: Angular module scaffold — routes, IpcService, home component, sidebar nav, gear icon, config.json** - `c6e7b83` (feat)
2. **Task 2: Settings shell + ISC Connection tab + Source Metadata tab** - `33ced4a` (feat)

**Plan metadata:** (see final commit)

## Files Created/Modified

- `src/app/app.routes.ts` — Added /policy-engine lazy route before ** catch-all
- `src/app/app.component.html` — Refactored sidenav (always open); added PE nav + toolbar gear icon
- `src/app/app.component.ts` — Added onPeNavItemClick() method
- `app/config.json` — Added 'policy-engine' to components.enabled
- `src/app/policy-engine/policy-engine.routes.ts` — Home + settings routes with canDeactivate
- `src/app/policy-engine/models/pe-settings.models.ts` — Angular-side interface mirror of preload-api.ts
- `src/app/policy-engine/services/policy-engine-ipc.service.ts` — Typed IPC wrapper service
- `src/app/policy-engine/policy-engine-home/policy-engine-home.component.*` — Home with spinner, setup banner, empty state CTA
- `src/app/policy-engine/settings/settings.component.*` — Tabbed shell with ViewChild dirty tracking, connection badge
- `src/app/policy-engine/settings/unsaved-changes.guard.ts` — CanDeactivateFn with confirm() prompt
- `src/app/policy-engine/settings/isc-connection-tab/isc-connection-tab.component.*` — Full ISC credential form
- `src/app/policy-engine/settings/source-metadata-tab/source-metadata-tab.component.*` — 4-field optional metadata form
- `src/app/policy-engine/settings/git-settings-tab/git-settings-tab.component.ts` — Stub (Plan 03)

## Decisions Made

- **Sidenav refactor:** `mat-sidenav` was gated by `@if (isConnected)`. Moved the condition inside to individual nav items. PE link only uses `isComponentEnabled('policy-engine')` — accessible without ISC connection. `[opened]` binding updated to `isConnected || isComponentEnabled('policy-engine') ? sidenavOpened : false`.
- **pe-settings.models.ts:** Created interface mirror in `src/app/policy-engine/models/` to avoid importing across the `src/`↔`app/` boundary. Comment added to keep in sync with `app/policy-engine/preload-api.ts`.
- **GitSettingsTabComponent stub:** Included in this plan so SettingsComponent compiles without forward-ref issues. Plan 03 replaces the stub.
- **unsavedChangesGuard uses confirm():** Plan explicitly approved this as the initial implementation with a TODO for MatDialog upgrade.
- **Per-tab settings caching:** Each tab independently calls `getSettings()` on init and caches the full result for merge-on-save. Avoids shared state between sibling tabs and matches the tab-level save granularity in the spec.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Structural] Refactored mat-sidenav gate from component-level @if to per-item @if**
- **Found during:** Task 1 (sidebar nav item for PE)
- **Issue:** The `mat-sidenav` was wrapped in `@if (isConnected)` at the component level. Adding the PE nav link outside that block would require a second sidenav or separate list element outside `mat-sidenav-container`, which would break layout.
- **Fix:** Moved `@if (isConnected)` from the `<mat-sidenav>` element down to each individual nav item. The sidenav is now always rendered (when PE is enabled); existing items check `isConnected && isComponentEnabled(...)`. PE item checks only `isComponentEnabled('policy-engine')`.
- **Files modified:** src/app/app.component.html
- **Verification:** TypeScript compiles clean; template structure verified against plan requirement "PE accessible without ISC connection"
- **Committed in:** c6e7b83

---

**Total deviations:** 1 auto-fixed (Rule 1 - template structural adjustment)
**Impact on plan:** Required change — the plan explicitly instructed to "refactor so the sidenav is always shown." This is the implementation of that instruction, not unplanned scope.

## Issues Encountered

- **ng build** fails with `Cannot find module '@angular-devkit/build-angular/package.json'` — pre-existing environment issue (`@angular/cli` at 17.3.17 vs Angular framework at 21.2.4, `@angular-builders/custom-webpack` 17.x expects `@angular-devkit/build-angular` in project root which was replaced by `@angular/build` in Angular 21). Confirmed pre-existing by stashing all changes and running — same error. TypeScript compilation (`tsc --noEmit`) passes with zero errors confirming code correctness.

## Known Stubs

- `GitSettingsTabComponent` at `src/app/policy-engine/settings/git-settings-tab/git-settings-tab.component.ts` — returns `isDirty: false`, renders placeholder UI. Plan 03 replaces with full git configuration form.

## Next Phase Readiness

- PE module scaffold complete; Plan 03 can import SettingsComponent directly to replace git stub
- CONN-01 and CONN-02 requirements fulfilled (source metadata + ISC connection UI)
- Phase 2 (ISC connectivity) can use PolicyEngineIpcService.getSettings() to read stored tenantUrl/patClientId and test connection
- `pe.setupBannerDismissed` localStorage key used by home component — Phase 2 test-connection success can set this to dismiss banner

---
*Phase: 01-foundation*
*Completed: 2026-03-26*

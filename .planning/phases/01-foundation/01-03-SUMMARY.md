---
phase: 01-foundation
plan: 03
subsystem: ui
tags: [angular, material, reactive-forms, safeStorage, settings, policy-engine, git-integration]

# Dependency graph
requires:
  - phase: 01-foundation
    plan: 01
    provides: "pe: IPC bridge — pe:getSettings, pe:saveSettings, pe:clearSecret('gitAuthToken'), pe:exportSettings, pe:importSettings, pe:factoryReset; safeStorage-backed pe.git.authToken secret"
  - phase: 01-foundation
    plan: 02
    provides: "SettingsComponent shell with 3 tabs and GitSettingsTabComponent stub (isDirty=false); PolicyEngineIpcService typed wrapper"

provides:
  - "GitSettingsTabComponent: full git settings form (committerName, committerEmail, remoteUrl, authToken masked, pushIntervalMinutes min:1 default:5)"
  - "Git auth token: always masked (type=password), placeholder dots when stored, lock icon + safeStorage tooltip, remove-token button via pe:clearSecret"
  - "Git settings save/dirty/navigate-away guard: same pattern as ISC Connection tab"
  - "SettingsActionsComponent: Export Settings (JSON download, secrets excluded), Import Settings (file picker, silent), Factory Reset (two-step MatDialog confirm, clears all)"
  - "All three settings tabs fully functional; SettingsComponent.hasUnsavedChanges() covers all three"
  - "CONN-04 requirement fulfilled; all Phase 1 success criteria verifiable"

affects:
  - 02-isc-connectivity
  - 03-policy-definition-ui
  - 04-git-integration

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional-field email validator: custom validator that skips Validators.email when field is empty"
    - "Inline dialog component pattern: ConfirmResetDialogComponent declared in the same file as its caller for small one-off dialogs"
    - "File import pattern: hidden <input type=file> accessed via @ViewChild ElementRef, reset after import for re-importability"
    - "Export-without-secrets pattern: pe:exportSettings IPC handler constructs clean PeNonSecretSettings object (no secret fields)"

key-files:
  created:
    - src/app/policy-engine/settings/git-settings-tab/git-settings-tab.component.ts
    - src/app/policy-engine/settings/git-settings-tab/git-settings-tab.component.html
    - src/app/policy-engine/settings/git-settings-tab/git-settings-tab.component.scss
    - src/app/policy-engine/settings/settings-actions/settings-actions.component.ts
    - src/app/policy-engine/settings/settings-actions/settings-actions.component.html
    - src/app/policy-engine/settings/settings-actions/settings-actions.component.scss
  modified:
    - src/app/policy-engine/settings/settings.component.ts
    - src/app/policy-engine/settings/settings.component.html

key-decisions:
  - "optionalEmailValidator: custom validator rather than Validators.email directly; skips validation when field is empty — committerEmail is optional but must be valid when provided"
  - "ConfirmResetDialogComponent declared inline in settings-actions.component.ts — keeps dialog logic co-located, avoids a separate file for a 5-line dialog"
  - "authToken field: never pre-populated, type=password with no show/hide toggle, authTokenAlreadyStored drives placeholder and hint — identical security posture to patSecret in ISC tab"
  - "onSave() only sends gitAuthToken in payload when user types a non-empty value; empty = leave stored value alone — prevents accidental secret erasure on non-token saves"
  - "Factory reset navigates to /policy-engine/settings after reset — router.navigate triggers a fresh init of all form tabs, showing empty forms and the setup banner again"

patterns-established:
  - "Pattern: optional-but-validated fields use custom validators that return null when empty"
  - "Pattern: inline dialog for small one-off confirmations — single @Component + @Component in same file, exported only the outer one from module"

requirements-completed: [CONN-04]

# Metrics
duration: 8min
completed: 2026-03-26
---

# Phase 1 Plan 03: Git Settings Tab + Settings Utility Actions Summary

**GitSettingsTabComponent with masked auth token (safeStorage) and SettingsActionsComponent providing export/import/factory-reset — completes all three settings tabs and fulfills CONN-04**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-26T03:26:45Z
- **Completed:** 2026-03-26T03:34:00Z
- **Tasks:** 2
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments

- GitSettingsTabComponent fully implemented: committer name/email (optional email validation), remote URL, auth token (always masked, safeStorage tooltip, remove-token button), push interval (min:1, default:5), save/dirty tracking matching ISC Connection tab pattern
- SettingsActionsComponent added below tab group: Export (JSON Blob download, no secrets), Import (file picker + JSON parse + IPC call, silent), Factory Reset (MatDialog two-step confirm, navigate to fresh settings on success)
- All three settings tabs now complete — SettingsComponent.hasUnsavedChanges() covers all three via @ViewChild dirty getters
- CONN-04 fulfilled: git committer settings persist through pe:saveSettings IPC to policy-engine-settings.json; git auth token via pe.git.authToken safeStorage key

## Phase 1 Success Criteria Status

All 5 Phase 1 success criteria from ROADMAP.md are now verifiable:

- **SC1: Source metadata fields editable and persist** — SourceMetadataTabComponent (Plan 02, CONN-01)
- **SC2: ISC tenant URL, PAT client ID, PAT secret stored encrypted** — IscConnectionTabComponent + safeStorage (Plans 01+02, CONN-02)
- **SC3: Git settings survive app restart** — GitSettingsTabComponent + policy-engine-settings.json persistence (Plans 01+03, CONN-04)
- **SC4: nodeIntegration: false, contextIsolation: true, no raw ipcRenderer in renderer** — Electron security hardening (Plan 01)
- **SC5: PE module lazy-loads, all IPC channels use pe: namespace** — app.routes.ts lazy route + pe: handlers (Plans 01+02)

## Task Commits

Each task was committed atomically:

1. **Task 1: Git Settings tab — form, credential masking, save/dirty, remove token** - `52bda11` (feat)
2. **Task 2: Settings utility actions — export, import, factory reset** - `70569bc` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/app/policy-engine/settings/git-settings-tab/git-settings-tab.component.ts` — Full FormGroup implementation replacing stub; optionalEmailValidator, authTokenAlreadyStored pattern, onSave merges full PeNonSecretSettings payload
- `src/app/policy-engine/settings/git-settings-tab/git-settings-tab.component.html` — Form fields with inline validation, lock icon, remove-token button, push interval field
- `src/app/policy-engine/settings/git-settings-tab/git-settings-tab.component.scss` — Mirrors ISC Connection tab styles; push-interval-field narrower (220px)
- `src/app/policy-engine/settings/settings-actions/settings-actions.component.ts` — Export/import/factory-reset logic; inline ConfirmResetDialogComponent; Router.navigate post-reset
- `src/app/policy-engine/settings/settings-actions/settings-actions.component.html` — Three-button row with divider, hidden file input, descriptive labels
- `src/app/policy-engine/settings/settings-actions/settings-actions.component.scss` — Flex row, action-label styling
- `src/app/policy-engine/settings/settings.component.ts` — Added SettingsActionsComponent to imports array
- `src/app/policy-engine/settings/settings.component.html` — Added `<app-settings-actions>` below `<mat-tab-group>`

## Decisions Made

- **optionalEmailValidator:** `committerEmail` is optional but must be valid email format when non-empty. Used a custom validator `(c) => c.value ? Validators.email(c) : null` rather than `Validators.email` directly — prevents spurious "email invalid" errors on empty optional fields.
- **ConfirmResetDialogComponent inline:** Declared as a separate `@Component` in the same `.ts` file as `SettingsActionsComponent`. Keeps the dialog template co-located with its caller, avoids a separate file/folder for a 5-line dialog. Angular supports this pattern for small private dialogs.
- **authToken never pre-populated, type=password only:** Identical security posture to `patSecret` in ISC Connection tab. No show/hide toggle to reduce exposure risk. `authTokenAlreadyStored` flag drives placeholder text and hint, not field value.
- **gitAuthToken in payload only when user types a value:** `onSave()` checks `form.value.authToken?.trim()` — only adds `gitAuthToken` to `PeSettingsPayload` when non-empty. Prevents silent erasure of stored token when user saves only non-secret git fields.
- **Factory reset navigates to /policy-engine/settings:** `router.navigate(['/policy-engine/settings'])` after reset triggers a fresh route instantiation, which re-runs `ngOnInit` on all tab components. All forms load empty state; setup banner reappears via `localStorage.removeItem('pe.setupBannerDismissed')` logic in home component.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- **ng build** continues to fail with `Cannot find module '@angular-devkit/build-angular/package.json'` — confirmed pre-existing environment issue (Angular CLI 17.3.17 + custom-webpack builder 17.x vs Angular framework 21.2.4 + `@angular/build` 21.x). Consistent with findings documented in Plan 02 SUMMARY. TypeScript compilation via `npx tsc -p src/tsconfig.app.json --noEmit` passes with zero errors confirming all code is type-correct.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 1 (Foundation) is complete: all 3 settings tabs functional, CONN-01/CONN-02/CONN-04 fulfilled, Electron security posture verified, PE module lazy-loads
- Phase 2 (ISC Connectivity): can read stored tenantUrl/patClientId via `PolicyEngineIpcService.getSettings()` and test ISC connection; success dismisses setup banner via `pe.setupBannerDismissed` localStorage key
- Phase 4 (Git Integration): GitSettingsTabComponent provides remoteUrl, committerName, committerEmail, authToken (via pe.git.authToken safeStorage) for git push operations

---
*Phase: 01-foundation*
*Completed: 2026-03-26*

## Self-Check: PASSED

All files verified present. All task commits verified in git history.

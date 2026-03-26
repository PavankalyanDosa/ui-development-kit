# Phase 1: Foundation - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Security-correct Electron shell + IPC bridge + encrypted local store + settings UI scaffold. Covers the 3 settings categories (source metadata, ISC connection, git config) and the Policy Engine Angular module entry point. No ISC API calls in this phase — all operations are purely local. ISC connectivity is Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Settings layout & navigation
- Tabbed settings panel — 3 tabs: Source Metadata, ISC Connection, Git Settings
- Full navigated page (not modal or drawer) — settings is its own route
- Default tab on open: always ISC Connection (most critical to configure first)
- Access via gear icon in top-right of app chrome (standard desktop convention)
- Global settings only — per-policy config lives in the policy editor (Phase 3)
- Connection status badge in settings header: small indicator showing connected/not-configured; clicking it goes to ISC Connection tab

### Form save behavior
- Explicit save button per tab — admin consciously commits changes
- Unsaved state indicated by both: dot/asterisk on tab label AND save button enabled/disabled state change
- Success feedback: inline toast notification ("Settings saved") auto-dismissing after ~2-3 seconds
- Navigate-away guard: confirmation dialog ("You have unsaved changes. Leave anyway?") when navigating away from a tab with unsaved changes

### Credential entry UX
- PAT client secret and git auth token: always masked, no show/hide reveal (maximum security)
- When reopened after save: placeholder dots (••••••••••) in the field — value is never re-loaded into DOM
- Subtle lock icon + tooltip near credential fields: "Encrypted via OS keychain (safeStorage)"
- Clear/remove stored secret: Claude's discretion on UX (confirmation required to prevent accidental deletion)

### Validation behavior
- Validation triggers: on blur (when field loses focus) + on save attempt
- ISC tenant URL: validate format only (https://tenant.api.identitynow.com pattern) — connectivity tested explicitly via Test Connection in Phase 2
- Required fields: ISC tenant URL, PAT client ID, PAT secret — all other fields optional
- Error display: inline below each invalid field (standard Angular Material error messages)

### First-run experience
- On first launch: land on Policy Engine home screen with a dismissible "Setup required" banner pointing to settings
- After saving ISC connection settings for the first time: prompt admin to run Test Connection immediately
- Settings always opens on ISC Connection tab (no last-tab memory)
- Setup banner stays visible until ISC connection is successfully tested (Phase 2 action) — auto-dismisses on success
- After first successful Test Connection (Phase 2): banner transitions briefly to "Connected to [tenant]" confirmation then disappears; success message includes "Create your first policy →" CTA
- One persistent dismissible tip card on Policy Engine home for first-time users explaining the workflow (configure → define policies → deploy)
- App auto-validates saved ISC credentials on startup (pings ISC to confirm still valid; shows error if expired)

### App shell & module entry
- Policy Engine appears as a new sidebar nav item in the existing UDK left sidebar — consistent with existing UDK module pattern
- Empty state on Policy Engine home: friendly message + "Configure your ISC connection to get started" button linking to settings
- Skeleton/spinner in main content area while policy engine Angular module lazy-loads
- All Policy Engine IPC channels use `pe:` namespace (e.g., `pe:getSettings`, `pe:saveSettings`, `pe:deploy`)

### Window / app chrome
- Title bar: follow existing UDK convention (match whatever the host app uses)
- Minimum window size: Claude's discretion (sensible minimum to prevent settings form breakage)
- Window size/position persistence: Claude's discretion (standard electron window-state pattern)
- System tray icon: required for background git push support — tray scaffold created in Phase 1 so Phase 6 can wire batched git push to run when window is minimized/closed

### Settings reset & export
- Factory reset: available as a destructive action with two-step confirmation (clears all local store)
- Reset granularity: full reset only — no per-tab reset
- After reset: navigate to settings, ISC Connection tab, with setup banner visible (same as first launch)
- Export settings: "Export Settings" button at bottom of settings screen
- Export format: JSON file (policy-engine-settings.json), human-readable
- Export includes: all non-secret fields — tenant URL, client ID, source metadata, git URL, committer name/email, push interval. Secrets are always excluded.
- Import settings: available alongside export button; imports silently without redirecting
- After import: admin must manually navigate to ISC Connection tab to re-enter secrets

### Claude's Discretion
- Clear/remove stored secret button design and confirmation pattern
- Responsive tab behavior on narrow windows
- Exact minimum window size values
- Window size/position persistence implementation details
- Tray icon menu items and behavior when window is minimized

</decisions>

<specifics>
## Specific Ideas

- "Always masked, no reveal" for credential fields — stronger than the standard show/hide pattern; admin should never need to view a stored secret
- Tray icon specifically for background git push — this is the primary reason the app needs tray presence; wired in Phase 6
- Setup banner auto-dismisses after Test Connection success rather than requiring manual dismiss — reduces friction for first-time users

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within Phase 1 scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-25*

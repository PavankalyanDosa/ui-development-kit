import { Routes } from '@angular/router';

export const POLICY_ENGINE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./policy-engine-home/policy-engine-home.component')
        .then(m => m.PolicyEngineHomeComponent)
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./settings/settings.component')
        .then(m => m.SettingsComponent),
    canDeactivate: [
      () => import('./settings/unsaved-changes.guard').then(m => m.unsavedChangesGuard)
    ]
  }
];

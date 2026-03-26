import { CanDeactivateFn } from '@angular/router';

export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/**
 * Route guard: prompts user when navigating away from a component with unsaved changes.
 * TODO: Replace confirm() with MatDialog in a polish pass for consistent UI.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> =
  (component) => {
    if (!component.hasUnsavedChanges()) {
      return true;
    }
    return confirm('You have unsaved changes. Leave anyway?');
  };

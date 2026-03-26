import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

/**
 * Git Settings tab — STUB.
 * Full implementation in Plan 03 (git integration).
 */
@Component({
  selector: 'app-git-settings-tab',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="git-settings-stub">
      <mat-icon>construction</mat-icon>
      <p>Git Settings — coming in Phase 1, Plan 03.</p>
    </div>
  `,
  styles: [`
    .git-settings-stub {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px;
      color: #9ca3af;
      gap: 12px;
      mat-icon { font-size: 48px; width: 48px; height: 48px; }
    }
  `]
})
export class GitSettingsTabComponent {
  get isDirty(): boolean {
    return false;
  }
}

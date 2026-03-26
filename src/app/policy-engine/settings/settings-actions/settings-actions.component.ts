import { Component, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  MatDialog,
  MatDialogModule,
  MAT_DIALOG_DATA,
  MatDialogRef
} from '@angular/material/dialog';
import { PolicyEngineIpcService } from '../../services/policy-engine-ipc.service';

/** Minimal inline confirmation dialog for factory reset. */
@Component({
  selector: 'app-confirm-reset-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Factory Reset</h2>
    <mat-dialog-content>{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-button color="warn" [mat-dialog-close]="true">Delete Everything</button>
    </mat-dialog-actions>
  `
})
export class ConfirmResetDialogComponent {
  readonly data = inject<{ message: string }>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<ConfirmResetDialogComponent>);
}

@Component({
  selector: 'app-settings-actions',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatSnackBarModule,
    MatDialogModule
  ],
  templateUrl: './settings-actions.component.html',
  styleUrl: './settings-actions.component.scss'
})
export class SettingsActionsComponent {
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  private ipcService = inject(PolicyEngineIpcService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  async onExport(): Promise<void> {
    try {
      const data = await this.ipcService.exportSettings();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'policy-engine-settings.json';
      anchor.click();
      URL.revokeObjectURL(url);
      this.snackBar.open('Settings exported (secrets excluded)', '', { duration: 3000 });
    } catch (err) {
      console.error('Export settings failed', err);
      this.snackBar.open('Export failed', '', { duration: 3000 });
    }
  }

  onImport(): void {
    this.fileInputRef.nativeElement.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const result = await this.ipcService.importSettings(parsed);

      if (result && 'error' in result && result.error) {
        this.snackBar.open(`Import failed: ${result.error}`, '', { duration: 5000 });
      } else {
        this.snackBar.open('Settings imported. Re-enter secrets to apply.', '', { duration: 4000 });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('Import settings failed', err);
      this.snackBar.open(`Import failed: ${msg}`, '', { duration: 5000 });
    } finally {
      // Reset so the same file can be re-imported
      input.value = '';
    }
  }

  onFactoryReset(): void {
    const dialogRef = this.dialog.open(ConfirmResetDialogComponent, {
      data: {
        message: 'This will delete ALL Policy Engine settings and stored secrets. This cannot be undone.'
      },
      width: '420px'
    });

    dialogRef.afterClosed().subscribe(async (confirmed: boolean) => {
      if (!confirmed) {
        return;
      }

      try {
        await this.ipcService.factoryReset();
        this.snackBar.open('All settings cleared', '', { duration: 3000 });
        void this.router.navigate(['/policy-engine/settings']);
      } catch (err) {
        console.error('Factory reset failed', err);
        this.snackBar.open('Factory reset failed', '', { duration: 3000 });
      }
    });
  }
}

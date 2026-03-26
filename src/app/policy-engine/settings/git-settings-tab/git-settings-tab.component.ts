import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PolicyEngineIpcService } from '../../services/policy-engine-ipc.service';
import { PeSettingsResult, PeNonSecretSettings } from '../../models/pe-settings.models';

/** Validates email only when field has a value; skip validation when empty. */
function optionalEmailValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) {
    return null;
  }
  return Validators.email(control);
}

@Component({
  selector: 'app-git-settings-tab',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  templateUrl: './git-settings-tab.component.html',
  styleUrl: './git-settings-tab.component.scss'
})
export class GitSettingsTabComponent implements OnInit {
  form!: FormGroup;
  loading = false;
  saving = false;
  authTokenAlreadyStored = false;
  /** Cached full settings for merge on save */
  private cachedSettings: PeSettingsResult | null = null;

  constructor(
    private fb: FormBuilder,
    private ipcService: PolicyEngineIpcService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      committerName: [''],
      committerEmail: ['', [optionalEmailValidator]],
      remoteUrl: [''],
      authToken: [''],
      pushIntervalMinutes: [5, [Validators.min(1), Validators.pattern(/^\d+$/)]]
    });

    this.loading = true;
    this.ipcService.getSettings()
      .then(result => {
        this.cachedSettings = result;
        this.form.patchValue({
          committerName: result.git?.committerName ?? '',
          committerEmail: result.git?.committerEmail ?? '',
          remoteUrl: result.git?.remoteUrl ?? '',
          pushIntervalMinutes: result.git?.pushIntervalMinutes ?? 5
        });
        if (result.gitAuthTokenStored === true) {
          this.authTokenAlreadyStored = true;
        }
        this.form.markAsPristine();
      })
      .catch(err => {
        console.error('Git Settings Tab: failed to load settings', err);
      })
      .finally(() => {
        this.loading = false;
      });
  }

  get isDirty(): boolean {
    return this.form.dirty;
  }

  get committerNameCtrl() { return this.form.get('committerName')!; }
  get committerEmailCtrl() { return this.form.get('committerEmail')!; }
  get remoteUrlCtrl() { return this.form.get('remoteUrl')!; }
  get authTokenCtrl() { return this.form.get('authToken')!; }
  get pushIntervalCtrl() { return this.form.get('pushIntervalMinutes')!; }

  async onRemoveAuthToken(): Promise<void> {
    try {
      await this.ipcService.clearSecret('gitAuthToken');
      this.authTokenAlreadyStored = false;
      this.authTokenCtrl.setValue('');
      this.snackBar.open('Auth token removed', '', { duration: 2500 });
    } catch (err) {
      console.error('Failed to remove git auth token', err);
      this.snackBar.open('Failed to remove auth token', '', { duration: 3000 });
    }
  }

  async onSave(): Promise<void> {
    // Trigger validation display
    this.form.markAllAsTouched();

    // Validate form — email format, push interval
    if (this.form.invalid) {
      return;
    }

    this.saving = true;
    try {
      // Build full settings payload (merge with cached settings)
      const nonSecrets: PeNonSecretSettings = {
        sourceMetadata: this.cachedSettings?.sourceMetadata ?? {
          name: '',
          description: '',
          owner: '',
          governanceGroup: ''
        },
        isc: this.cachedSettings?.isc ?? {
          tenantUrl: '',
          patClientId: ''
        },
        git: {
          committerName: this.committerNameCtrl.value as string,
          committerEmail: this.committerEmailCtrl.value as string,
          remoteUrl: this.remoteUrlCtrl.value as string,
          pushIntervalMinutes: Number(this.pushIntervalCtrl.value)
        }
      };

      const newAuthToken = this.authTokenCtrl.value as string;
      const payload: { nonSecrets: PeNonSecretSettings; gitAuthToken?: string } = { nonSecrets };
      if (newAuthToken?.trim()) {
        payload.gitAuthToken = newAuthToken.trim();
      }

      await this.ipcService.saveSettings(payload);
      this.form.markAsPristine();
      this.snackBar.open('Settings saved', '', { duration: 2500 });

      if (newAuthToken?.trim()) {
        this.authTokenAlreadyStored = true;
        this.authTokenCtrl.setValue('');
      }

      // Update cached settings with the new git values
      if (this.cachedSettings) {
        this.cachedSettings.git = nonSecrets.git;
      }
    } catch (err) {
      console.error('Failed to save git settings', err);
      this.snackBar.open('Failed to save settings', '', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }
}

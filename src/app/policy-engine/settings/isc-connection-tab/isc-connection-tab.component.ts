import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PolicyEngineIpcService } from '../../services/policy-engine-ipc.service';
import { PeSettingsResult, PeNonSecretSettings } from '../../models/pe-settings.models';

const ISC_URL_PATTERN = /^https:\/\/[a-zA-Z0-9-]+\.api\.identitynow\.com\/?$/;

@Component({
  selector: 'app-isc-connection-tab',
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
  templateUrl: './isc-connection-tab.component.html',
  styleUrl: './isc-connection-tab.component.scss'
})
export class IscConnectionTabComponent implements OnInit {
  form!: FormGroup;
  loading = false;
  saving = false;
  patSecretAlreadyStored = false;
  patSecretRequiredError = false;
  /** Cached full settings for merge on save */
  private cachedSettings: PeSettingsResult | null = null;

  constructor(
    private fb: FormBuilder,
    private ipcService: PolicyEngineIpcService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      tenantUrl: ['', [Validators.required, Validators.pattern(ISC_URL_PATTERN)]],
      patClientId: ['', Validators.required],
      patSecret: ['']
    });

    this.loading = true;
    this.ipcService.getSettings()
      .then(result => {
        this.cachedSettings = result;
        this.form.patchValue({
          tenantUrl: result.isc?.tenantUrl ?? '',
          patClientId: result.isc?.patClientId ?? ''
        });
        this.patSecretAlreadyStored = result.patSecretStored === true;
        this.form.markAsPristine();
      })
      .catch(err => {
        console.error('ISC Connection Tab: failed to load settings', err);
      })
      .finally(() => {
        this.loading = false;
      });
  }

  get isDirty(): boolean {
    return this.form.dirty;
  }

  get tenantUrlCtrl() { return this.form.get('tenantUrl')!; }
  get patClientIdCtrl() { return this.form.get('patClientId')!; }
  get patSecretCtrl() { return this.form.get('patSecret')!; }

  async onRemoveSecret(): Promise<void> {
    try {
      await this.ipcService.clearSecret('patSecret');
      this.patSecretAlreadyStored = false;
      this.patSecretCtrl.setValue('');
      this.form.markAsDirty();
      this.snackBar.open('Secret removed', '', { duration: 2500 });
    } catch (err) {
      console.error('Failed to remove PAT secret', err);
      this.snackBar.open('Failed to remove secret', '', { duration: 3000 });
    }
  }

  async onSave(): Promise<void> {
    // Trigger validation display
    this.form.markAllAsTouched();
    this.patSecretRequiredError = false;

    // Validate required fields
    if (this.tenantUrlCtrl.invalid || this.patClientIdCtrl.invalid) {
      return;
    }

    // Validate PAT secret: required if none stored and no new value typed
    const newPatSecret = this.patSecretCtrl.value as string;
    if (!this.patSecretAlreadyStored && !newPatSecret?.trim()) {
      this.patSecretRequiredError = true;
      return;
    }

    this.saving = true;
    try {
      // Build full settings payload (merge with cached non-ISC settings)
      const nonSecrets: PeNonSecretSettings = {
        sourceMetadata: this.cachedSettings?.sourceMetadata ?? {
          name: '',
          description: '',
          owner: '',
          governanceGroup: ''
        },
        isc: {
          tenantUrl: this.tenantUrlCtrl.value as string,
          patClientId: this.patClientIdCtrl.value as string
        },
        git: this.cachedSettings?.git ?? {
          committerName: '',
          committerEmail: '',
          remoteUrl: '',
          pushIntervalMinutes: 30
        }
      };

      const payload: { nonSecrets: PeNonSecretSettings; patSecret?: string } = { nonSecrets };
      if (newPatSecret?.trim()) {
        payload.patSecret = newPatSecret.trim();
      }

      await this.ipcService.saveSettings(payload);
      this.form.markAsPristine();
      this.snackBar.open('Settings saved', '', { duration: 2500 });

      if (newPatSecret?.trim()) {
        this.patSecretAlreadyStored = true;
        this.patSecretCtrl.setValue('');
      }

      // Update cached settings with the new values
      if (this.cachedSettings) {
        this.cachedSettings.isc = nonSecrets.isc;
      }
    } catch (err) {
      console.error('Failed to save ISC settings', err);
      this.snackBar.open('Failed to save settings', '', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }
}

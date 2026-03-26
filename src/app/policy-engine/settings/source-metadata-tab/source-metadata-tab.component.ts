import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PolicyEngineIpcService } from '../../services/policy-engine-ipc.service';
import { PeSettingsResult, PeNonSecretSettings } from '../../models/pe-settings.models';

@Component({
  selector: 'app-source-metadata-tab',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  templateUrl: './source-metadata-tab.component.html',
  styleUrl: './source-metadata-tab.component.scss'
})
export class SourceMetadataTabComponent implements OnInit {
  form!: FormGroup;
  loading = false;
  saving = false;
  /** Cached full settings for merge on save */
  private cachedSettings: PeSettingsResult | null = null;

  constructor(
    private fb: FormBuilder,
    private ipcService: PolicyEngineIpcService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      name: [''],
      description: [''],
      owner: [''],
      governanceGroup: ['']
    });

    this.loading = true;
    this.ipcService.getSettings()
      .then(result => {
        this.cachedSettings = result;
        this.form.patchValue({
          name: result.sourceMetadata?.name ?? '',
          description: result.sourceMetadata?.description ?? '',
          owner: result.sourceMetadata?.owner ?? '',
          governanceGroup: result.sourceMetadata?.governanceGroup ?? ''
        });
        this.form.markAsPristine();
      })
      .catch(err => {
        console.error('Source Metadata Tab: failed to load settings', err);
      })
      .finally(() => {
        this.loading = false;
      });
  }

  get isDirty(): boolean {
    return this.form.dirty;
  }

  async onSave(): Promise<void> {
    this.saving = true;
    try {
      const nonSecrets: PeNonSecretSettings = {
        sourceMetadata: {
          name: this.form.value.name as string ?? '',
          description: this.form.value.description as string ?? '',
          owner: this.form.value.owner as string ?? '',
          governanceGroup: this.form.value.governanceGroup as string ?? ''
        },
        isc: this.cachedSettings?.isc ?? {
          tenantUrl: '',
          patClientId: ''
        },
        git: this.cachedSettings?.git ?? {
          committerName: '',
          committerEmail: '',
          remoteUrl: '',
          pushIntervalMinutes: 30
        }
      };

      await this.ipcService.saveSettings({ nonSecrets });
      this.form.markAsPristine();
      this.snackBar.open('Settings saved', '', { duration: 2500 });

      // Update cached settings
      if (this.cachedSettings) {
        this.cachedSettings.sourceMetadata = nonSecrets.sourceMetadata;
      }
    } catch (err) {
      console.error('Failed to save source metadata settings', err);
      this.snackBar.open('Failed to save settings', '', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }
}

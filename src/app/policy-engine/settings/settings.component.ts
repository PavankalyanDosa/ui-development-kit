import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { HasUnsavedChanges } from './unsaved-changes.guard';
import { IscConnectionTabComponent } from './isc-connection-tab/isc-connection-tab.component';
import { SourceMetadataTabComponent } from './source-metadata-tab/source-metadata-tab.component';
import { GitSettingsTabComponent } from './git-settings-tab/git-settings-tab.component';
import { SettingsActionsComponent } from './settings-actions/settings-actions.component';
import { PolicyEngineIpcService } from '../services/policy-engine-ipc.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatTabsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    IscConnectionTabComponent,
    SourceMetadataTabComponent,
    GitSettingsTabComponent,
    SettingsActionsComponent
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit, HasUnsavedChanges {
  @ViewChild(IscConnectionTabComponent) iscTab!: IscConnectionTabComponent;
  @ViewChild(SourceMetadataTabComponent) sourceTab!: SourceMetadataTabComponent;
  @ViewChild(GitSettingsTabComponent) gitTab!: GitSettingsTabComponent;

  /** Index 1 = ISC Connection (default); 0 = Source Metadata; 2 = Git Settings */
  readonly defaultTabIndex = 1;

  iscConfigured = false;

  constructor(private ipcService: PolicyEngineIpcService) {}

  ngOnInit(): void {
    this.ipcService.getSettings()
      .then(result => {
        this.iscConfigured = !!(result.isc?.tenantUrl);
      })
      .catch(err => {
        console.error('Settings: failed to check ISC config status', err);
      });
  }

  get isDirtySource(): boolean {
    return this.sourceTab?.isDirty ?? false;
  }

  get isDirtyIsc(): boolean {
    return this.iscTab?.isDirty ?? false;
  }

  get isDirtyGit(): boolean {
    return this.gitTab?.isDirty ?? false;
  }

  hasUnsavedChanges(): boolean {
    return this.isDirtySource || this.isDirtyIsc || this.isDirtyGit;
  }

  navigateToIscTab(tabGroup: { selectedIndex: number }): void {
    tabGroup.selectedIndex = this.defaultTabIndex;
  }
}

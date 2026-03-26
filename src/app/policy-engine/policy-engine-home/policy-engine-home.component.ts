import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { PolicyEngineIpcService } from '../services/policy-engine-ipc.service';

const BANNER_DISMISSED_KEY = 'pe.setupBannerDismissed';

@Component({
  selector: 'app-policy-engine-home',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatCardModule
  ],
  templateUrl: './policy-engine-home.component.html',
  styleUrl: './policy-engine-home.component.scss'
})
export class PolicyEngineHomeComponent implements OnInit {
  loading = true;
  iscConfigured = false;
  showBanner = false;
  showTestConnectionTip = false;

  constructor(private ipcService: PolicyEngineIpcService) {}

  ngOnInit(): void {
    this.loading = true;
    this.ipcService.getSettings()
      .then(result => {
        this.iscConfigured = !!(result.isc?.tenantUrl);
        const bannerDismissed = localStorage.getItem(BANNER_DISMISSED_KEY) === 'true';
        this.showBanner = !this.iscConfigured && !bannerDismissed;
        this.showTestConnectionTip = this.iscConfigured;
      })
      .catch(err => {
        console.error('PolicyEngineHome: failed to load settings', err);
        this.iscConfigured = false;
        this.showBanner = localStorage.getItem(BANNER_DISMISSED_KEY) !== 'true';
      })
      .finally(() => {
        this.loading = false;
      });
  }

  dismissBanner(): void {
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
    this.showBanner = false;
  }
}

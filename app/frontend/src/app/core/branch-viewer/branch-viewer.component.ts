import { Component, OnInit, ViewChild } from '@angular/core';
import { OpenRepoPanelComponent } from '../open-repo-panel/open-repo-panel.component';
import { ElectronService } from '../../infrastructure/electron.service';
import { RepoService } from '../services/repo.service';
import { Router } from '@angular/router';
import { LayoutService } from '../services/layout.service';
import { D3Service } from '../d3/d3.service';

@Component({
  selector: 'app-branch-viewer',
  templateUrl: './branch-viewer.component.html',
  styleUrls: ['./branch-viewer.component.scss']
})
export class BranchViewerComponent implements OnInit {
  toggled = true;
  nav_items: any[];
  refs = [];
  remote = [];
  local = [];
  repoName = "";
  branchName = "";
  branchTarget = "";
  showLocal = true;
  showRemote = true;
  @ViewChild('openRepoPanel') openRepoPanel: OpenRepoPanelComponent;
  constructor(
    private repoService: RepoService,
    private route: Router,
    private layout: LayoutService,
    private d3: D3Service
  ) {
    this.repoService.repoChange.subscribe(info => {
      let that = this;
      setTimeout(() => {
        that.repoName = info;
        that.openRepoPanel.toggled = false;
      });
    });
    this.repoService.branchChange.subscribe(currentBranch => {
      this.branchName = currentBranch.name;
      this.branchTarget = currentBranch.target;
    });
    this.repoService.refChange.subscribe(data => {
      this.refs = data.references;
      this.updateReferences(data.references);
    });
    if (this.repoService.hasRepository) {
      this.repoName = this.repoService.repoName;
      this.branchName = this.repoService.currentBranch.name;
      this.branchTarget = this.repoService.currentBranch.target;
      this.refs = this.repoService.refs;
      this.updateReferences(this.refs);
    }
    this.toggled = layout.isNavToggled;
    this.showLocal = layout.isLocalShown;
    this.showRemote = layout.isRemoteShown;
  }

  ngOnInit() {
  }

  toggleNavigation(): void {
    this.toggled = !this.toggled;
    this.layout.isNavToggled = this.toggled;
  }
  toggleLocal(): void {
    this.showLocal = !this.showLocal;
    this.layout.isLocalShown = this.showLocal;
  }
  toggleRemote(): void {
    this.showRemote = !this.showRemote;
    this.layout.isRemoteShown = this.showRemote;
  }
  toggleOpenRepo(): void {
    this.openRepoPanel.toggled = !this.openRepoPanel.toggled;
  }
  goToSettings(): void {
    this.route.navigateByUrl('/settings');
  }
  goToCurrentBranch(): void {
    this.d3.scrollTo(this.branchTarget);
  }

  updateReferences(refs) {
    this.remote = [];
    this.local = [];
    refs.forEach((r) => {
      if (r.isRemote) {
        this.remote.push(r);
      } else if (r.isBranch) {
        this.local.push(r);
      }
    });
  }
}

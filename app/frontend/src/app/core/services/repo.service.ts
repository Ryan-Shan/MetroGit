import { Injectable, Output, EventEmitter } from '@angular/core';
import { ElectronService } from '../../infrastructure/electron.service';
import { LoadingService } from '../../infrastructure/loading-service.service';
import { NotificationsService } from 'angular2-notifications';
import { CredentialsService } from './credentials.service';
import { PromptInjectorService } from '../../infrastructure/prompt-injector.service';
import { StatusBarService } from '../../infrastructure/status-bar.service';
import { Router } from '@angular/router';
import { ForcePushPromptComponent } from '../force-push-prompt/force-push-prompt.component';
import { CommitChangeService } from './commit-change.service';
import { CreateBranchPromptComponent } from '../create-branch-prompt/create-branch-prompt.component';

@Injectable()
export class RepoService {

  @Output() repoChange = new EventEmitter<string>();
  @Output() wipInfoChange = new EventEmitter();
  @Output() branchChange = new EventEmitter<Branch>();
  @Output() commitsChange = new EventEmitter<any[]>();
  @Output() refChange = new EventEmitter<any>();
  @Output() pulled = new EventEmitter<any>();
  @Output() pushed = new EventEmitter<any>();
  @Output() posUpdate = new EventEmitter<{ ahead: number, behind: number }>();

  commits: any[] = [];
  repoName = "";
  hasRepository = false;
  currentBranch: Branch;
  refDict = {};
  refs = [];
  remote = "";
  currentPos: { ahead: number, behind: number };
  pulloption = "";

  private _wipCommit = {
    sha: "00000",
    author: "",
    email: "",
    parents: [],
    message: "",
    date: "",
    ci: "",
    virtual: true,
    isStash: false,
    enabled: false,
    fileSummary: {}
  };
  private _currentWorkingPath = "";
  private _pendingOperation: Function = null;

  constructor(
    private electron: ElectronService,
    private loading: LoadingService,
    private noti: NotificationsService,
    private status: StatusBarService,
    private promptIj: PromptInjectorService,
    private cred: CredentialsService,
    private route: Router,
    private commitChange: CommitChangeService
  ) {
  }

  init(): void {
    this.electron.onCD('Repo-OpenSuccessful', (event, arg) => {
      this.repoName = arg.repoName;
      this.repoChange.emit(this.repoName);
      this.hasRepository = true;
      this.loading.disableLoading();
    });
    this.electron.onCD('Repo-BranchPositionRetrieved', (event, arg) => {
      this.currentPos = arg;
      this.posUpdate.emit(this.currentPos);
    });
    this.electron.onCD('Repo-Pulled', (event, arg) => {
      this.pulled.emit();
      if (arg.result === 'UP_TO_DATE') {
        this.noti.info("Up to date", "Your local branch is up-to-date with the remote");
      } else {
        this.noti.success("Pull Successful", "Successfully updated local branch");
      }
    });
    this.electron.onCD('Repo-Pushed', (event, arg) => {
      this.pushed.emit();
      this.noti.success("Pushed", "Successfully pushed to remote");
    });
    this.electron.onCD('Repo-CommitsUpdated', (event, arg) => {
      this.notifyCommitDifference(arg.newCommits);
    });
    this.electron.onCD('Repo-Fetched', (event, arg) => {
    });
    this.electron.onCD('Repo-OpenFailed', (event, arg) => {
      this.noti.error("Error", "Failed to open repository");
      this.loading.disableLoading();
    });
    this.electron.onCD('Repo-BranchCreateFailed', (event, arg) => {
      this.noti.error("Error", "Failed to create branch, " + arg.detail);
    });
    this.electron.on('Repo-FolderSelected', (event, arg) => {
      this._pendingOperation = null;
      this._currentWorkingPath = arg.path;
      this.openRepo();
    });
    this.electron.onCD('Repo-BranchChanged', (event, arg) => {
      this.currentBranch = arg;
      this._wipCommit.parents = [this.currentBranch.target];
      this.branchChange.emit(arg);
      this.emitCommitWithWIP();
    });
    this.electron.onCD('Repo-CredentialIssue', (event, arg) => {
      if (this.remote) {
        if (this.remote.startsWith('http://') || this.remote.startsWith('https://')) {
          this.cred.promptUserUpdateCredential();
        } else {
          this.cred.promptUserEnterSSHPassword();
        }
      }
    });
    this.electron.onCD('Repo-FetchFailed', (event, arg) => {
      if (arg.detail.indexOf('403') !== -1) {
        this.noti.error("Forbidden", "It appears the remote is blocking this operation. You might have attempted to login too many times, please try again later");
      } else {
        this.status.flash('danger', 'Fetch failed');
        this._pendingOperation = this.fetch;
      }
    });
    this.electron.onCD('Repo-PullFailed', (event, arg) => {
      if (arg.detail === 'LOCAL_AHEAD') {
        this.noti.error("Local Ahead", "Your local branch is ahead, cannot fast forward");
      } else if (arg.detail === 'UPSTREAM_NOT_FOUND') {
        this.noti.info("Upstream Branch Not Found", "This branch does not have an upstream branch");
      } else {
        this.skipAuthError(arg.detail);
      }
      this.pulled.emit();
      this._pendingOperation = this.pullFFOnly;
    });
    this.electron.onCD('Repo-PushFailed', (event, arg) => {
      if (arg.detail === 'FORCE_REQUIRED') {
        let inst = this.promptIj.injectComponent(ForcePushPromptComponent);
        this._pendingOperation = this.push;
        inst.onResult.subscribe(force => {
          if (force) {
            this.push(true);
            this._pendingOperation = null;
          } else {
            this._pendingOperation = null;
          }
        });
      } else if (arg.detail === 'UP_TO_DATE') {
        this.noti.info('Up To Date', "Your local branch is up-to-date with the remote");
      } else if (arg.detail === 'REMOTE_UNCHANGED') {
        this.noti.error("Push Failed", "Remote branch was unchanged, the branch might be protected");
      } else {
        this.skipAuthError(arg.detail);
      }
      this.pushed.emit();
    });
    this.electron.onCD('Settings-EffectiveUpdated', (event, arg) => {
      this.pulloption = arg['gen-pulloption'];
      if (arg.currentRepo && this._currentWorkingPath !== arg.currentRepo.workingDir) {
        this._currentWorkingPath = arg.currentRepo.workingDir;
        this.openRepo();
      }
    });
    this.electron.onCD('Repo-RefRetrieved', (event, arg) => {
      this.refDict = arg.refDict;
      this.refs = arg.references;
      this.refChange.emit({ refDict: this.refDict, references: arg.references });
    });
    this.electron.onCD('Repo-RemotesChanged', (event, arg) => {
      this.remote = arg.remote;
    });
    this.electron.onCD('AutoFetch-Timeout', (event, arg) => {
      if (!this._pendingOperation) {
        this.fetch();
      }
    });
    this.electron.onCD('Repo-BlockingOperationBegan', (event, arg) => {
      this.loading.enableLoading(arg.operation);
    });
    this.electron.onCD('Repo-BlockingOperationEnd', (event, arg) => {
      this.loading.disableLoading();
    });
    this.electron.onCD('Repo-BlockingUpdate', (event, arg) => {
      this.loading.updateMessage(arg.operation);
    });
    this.electron.onCD('Repo-FileStatusRetrieved', (event, arg) => {
      let oldStatus = this._wipCommit.enabled;
      this._wipCommit.fileSummary = arg.summary;
      if (arg.staged.length || arg.unstaged.length) {
        this._wipCommit.enabled = true;
      } else {
        this._wipCommit.enabled = false;
      }
      if (oldStatus !== this._wipCommit.enabled) {
        this.emitCommitWithWIP();
      }
      this.wipInfoChange.emit();
    });
    this.cred.credentialChange.subscribe(newCreds => {
      this.retry();
    });
    this.commitChange.messageChange.subscribe(msg => {
      this._wipCommit.message = msg;
    });
  }

  getCommitsWithWIP() {
    if (this._wipCommit.enabled) {
      return [this._wipCommit].concat(this.commits);
    } else {
      return this.commits;
    }
  }

  private emitCommitWithWIP() {
    this.commitsChange.emit(this.getCommitsWithWIP());
  }

  private skipAuthError(detail) {
    if (detail !== 'CRED_ISSUE') {
      this.noti.error("Error", detail);
    }
  }

  notifyCommitDifference(newCommits) {
    let different = false;
    if (this.commits.length !== newCommits.length) {
      different = true;
    } else {
      for (let i = 0; i < this.commits.length; i++) {
        if (this.commits[i].sha !== newCommits[i].sha) {
          different = true;
          break;
        }
      }
    }
    if (different) {
      this.commits = newCommits;
      this.emitCommitWithWIP();
    }
  }

  openRepo(): void {
    if (this.electron.available) {
      this.loading.enableLoading("Opening Repo...");
      this.electron.ipcRenderer.send('Repo-Open', { workingDir: this._currentWorkingPath });
    }
  }

  openBrowse(): void {
    this.electron.ipcRenderer.send('Repo-Browse', {});
  }

  fetch(): void {
    this.electron.ipcRenderer.send('Repo-Fetch', { username: this.cred.username, password: this.cred.password });
  }

  pullFFOnly(): void {
    this.electron.ipcRenderer.send('Repo-Pull', { username: this.cred.username, password: this.cred.password, option: this.pulloption });
  }

  push(force = false): void {
    this.electron.ipcRenderer.send('Repo-Push', { username: this.cred.username, password: this.cred.password, force: force });
  }

  createBranch(): void {
    let prompt = this.promptIj.injectComponent(CreateBranchPromptComponent);
    prompt.onEnter.subscribe(name => {
      this.electron.ipcRenderer.send('Repo-CreateBranch', { name: name, commit: this.currentBranch.target });
    });
  }

  checkout(shorthand): void {
    this.electron.ipcRenderer.send('Repo-Checkout', {branch: shorthand});
  }
  retry(): void {
    if (this._pendingOperation) {
      this._pendingOperation();
      this._pendingOperation = null;
    }
  }

}

interface Branch {
  name: string;
  fullName: string;
  shorthand: string;
  target: string;
}


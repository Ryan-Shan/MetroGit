import { Component, OnInit, Sanitizer, Input } from '@angular/core';
import { D3Service } from '../d3/d3.service';
import { DomSanitizer } from '@angular/platform-browser';
import { CommitDetail, WIPCommit } from '../prototypes/commit';
import * as moment from 'moment';
import { CommitSelectionService } from '../services/commit-selection.service';
import { NotificationsService } from 'angular2-notifications';
import { Router } from '@angular/router';
import { CredentialsService } from '../services/credentials.service';
import { CommitChangeService } from '../services/commit-change.service';

@Component({
  selector: 'app-commit-detail-info',
  templateUrl: './commit-detail-info.component.html',
  styleUrls: ['./commit-detail-info.component.scss']
})
export class CommitDetailInfoComponent implements OnInit {

  @Input() commit: CommitDetail | WIPCommit;
  private set newCommitMessage(msg) {
    this._message = msg;
    this.setCommitMessages();
  }
  private get newCommitMessage() {
    return this._message;
  }
  private set newCommitDetail(msg) {
    this._detail = msg;
    this.setCommitMessages();
  }
  private get newCommitDetail() {
    return this._detail;
  }
  private _message = "";
  private _detail = "";
  constructor(
    private d3: D3Service,
    private sanitize: DomSanitizer,
    private selection: CommitSelectionService,
    private noti: NotificationsService,
    private cred: CredentialsService,
    private commitChange: CommitChangeService
  ) {
    this.newCommitMessage = this.commitChange.newCommitMessage;
    this.newCommitDetail = this.commitChange.newCommitDetail;
    this.commitChange.messageChange.subscribe(msg => {
      this._message = msg;
    });
    this.commitChange.detailChange.subscribe(det => {
      this._detail = det;
    });
  }

  ngOnInit() {
  }
  getShortenedPath(path) {
    if (path.length > 65) {
      let front = path.substring(0, 20);
      let over = path.length - 65 - 3;
      let back = path.substring(20 + over, path.length);
      return `${front}...${back}`;
    } else {
      return path;
    }
  }
  getCommitter() {
    return this.d3.getAuthor(this.commit);
  }
  getDateTime() {
    return moment(this.commit.date).format('MM/DD/YYYY hh:mm a');
  }
  getBadgeColor() {
    return this.sanitize.bypassSecurityTrustStyle(`${this.d3.getColorByAuthor(this.commit.email)}`);
  }
  wipFileTrack(index, item) {
    return item.path;
  }
  stageAll() {
    if (this.commit.virtual && (<WIPCommit>this.commit).unstaged.length) {
      let unstagedPaths = (<WIPCommit>this.commit).unstaged.map(s => s.path);
      this.commitChange.stage(unstagedPaths);
    }
  }
  setCommitMessages() {
    this.commitChange.newCommitMessage = this.newCommitMessage;
    this.commitChange.newCommitDetail = this.newCommitDetail;
  }
  unstageAll() {
    if (this.commit.virtual && (<WIPCommit>this.commit).staged.length) {
      let stagedPaths = (<WIPCommit>this.commit).staged.map(s => s.path);
      this.commitChange.unstage(stagedPaths);
    }
  }
  stage(file) {
    this.commitChange.stage([file]);
  }
  unstage(file) {
    this.commitChange.unstage([file]);
  }
  discardAll() {
    this.commitChange.discardAll();
  }
  commitChanges() {
    if (!(<WIPCommit>this.commit).staged.length) {
      let unstagedPath = (<WIPCommit>this.commit).unstaged.map(s => s.path);
      this.commitChange.commit(unstagedPath);
    } else {
      let stagedPaths = (<WIPCommit>this.commit).staged.map(s => s.path);
      this.commitChange.commitStaged();
    }
  }
  fillKeyIfNeeded() {
    if (this._message.length === 0 && this.commitChange.defaultKey) {
      this.newCommitMessage = this.commitChange.defaultKey + '-';
    }
  }

}

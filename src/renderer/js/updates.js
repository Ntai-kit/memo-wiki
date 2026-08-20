/**
 * updates.js — バージョン表示と自動アップデートの通知
 *
 * 責務:
 *   - サイドバー下部に現在のバージョンを表示する
 *   - 「更新を確認」ボタンで手動確認する
 *   - メインプロセスから届く更新の状況を、画面右下の小さなバーに表示する
 *   - 更新の準備ができたら「再起動して更新」ボタンを出す
 *
 * 更新の確認・ダウンロードそのものは main/updater.js が行う。
 * ここは表示だけを担当する。
 *
 * 表示の方針:
 *   自動確認のとき  … 更新が見つかったときだけ知らせる(邪魔をしない)
 *   手動確認のとき  … 「最新です」「確認できませんでした」も必ず返事をする
 *
 * 更新はダウンロードが終わっても勝手には適用されない。
 * ボタンを押すか、次にアプリを閉じたときに適用される仕組みなので、
 * 編集中に突然再起動することはない。
 */
import * as api from './api.js';

/** 手動確認の結果メッセージを自動で消すまでの時間 */
const AUTO_HIDE_MS = 5000;

const banner = document.getElementById('update-banner');
const messageEl = document.getElementById('update-message');
const installBtn = document.getElementById('btn-update-install');
const dismissBtn = document.getElementById('btn-update-dismiss');
const versionEl = document.getElementById('app-version');
const checkBtn = document.getElementById('btn-check-update');

let manualCheck = false; // 「更新を確認」ボタンから確認したかどうか
let hideTimer = null;

export async function init() {
  installBtn.addEventListener('click', () => api.installUpdate());
  dismissBtn.addEventListener('click', hide);
  checkBtn.addEventListener('click', checkNow);
  api.onUpdateStatus(render);

  versionEl.textContent = `バージョン ${await api.getVersion()}`;
}

/** 「更新を確認」ボタンの処理 */
async function checkNow() {
  manualCheck = true;
  checkBtn.disabled = true;
  show('更新を確認しています…', false);
  await api.checkForUpdates();
  checkBtn.disabled = false;
}

/**
 * 更新の状況に応じて表示を切り替える。
 * @param {{state: string, version?: string, percent?: number, message?: string}} status
 */
function render(status) {
  switch (status.state) {
    case 'available':
      show(`新しいバージョン ${status.version} をダウンロードしています…`, false);
      manualCheck = false;
      break;
    case 'progress':
      show(`ダウンロード中… ${status.percent}%`, false);
      break;
    case 'ready':
      show(`バージョン ${status.version} の準備ができました。`, true);
      manualCheck = false;
      break;
    case 'none':
      // 最新だったとき。手動で確認した場合だけ返事をする
      if (manualCheck) showTemporarily('お使いのバージョンが最新です。');
      manualCheck = false;
      break;
    case 'disabled':
      if (manualCheck) showTemporarily('開発中(npm start)は更新を確認できません。');
      manualCheck = false;
      break;
    case 'error':
      // 自動確認の失敗は作業の邪魔をしないよう、記録だけ残す
      console.warn('[update]', status.message);
      if (manualCheck) showTemporarily('更新を確認できませんでした。通信状況を確認してください。');
      manualCheck = false;
      break;
    default:
      // checking のときは何も変えない
      break;
  }
}

/** バーを表示する。install が true なら「再起動して更新」ボタンも出す */
function show(message, install) {
  clearTimeout(hideTimer);
  messageEl.textContent = message;
  installBtn.hidden = !install;
  banner.hidden = false;
}

/** 一定時間だけ表示して自動的に消す(手動確認の結果表示に使う) */
function showTemporarily(message) {
  show(message, false);
  hideTimer = setTimeout(hide, AUTO_HIDE_MS);
}

/** バーを閉じる(更新自体は次回終了時に適用される) */
function hide() {
  clearTimeout(hideTimer);
  banner.hidden = true;
}

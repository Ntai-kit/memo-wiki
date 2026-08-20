/**
 * updates.js — 自動アップデートの通知バー
 *
 * 責務:
 *   - メインプロセスから届く更新の状況を、画面右下の小さなバーに表示する
 *   - 更新の準備ができたら「再起動して更新」ボタンを出す
 *
 * 更新の確認・ダウンロードそのものは main/updater.js が行う。
 * ここは表示だけを担当する。
 *
 * 更新はダウンロードが終わっても勝手には適用されない。
 * ボタンを押すか、次にアプリを閉じたときに適用される仕組みなので、
 * 編集中に突然再起動することはない。
 */
import * as api from './api.js';

const banner = document.getElementById('update-banner');
const messageEl = document.getElementById('update-message');
const installBtn = document.getElementById('btn-update-install');
const dismissBtn = document.getElementById('btn-update-dismiss');

export function init() {
  installBtn.addEventListener('click', () => api.installUpdate());
  dismissBtn.addEventListener('click', () => hide());
  api.onUpdateStatus(render);
}

/**
 * 更新の状況に応じて表示を切り替える。
 * @param {{state: string, version?: string, percent?: number, message?: string}} status
 */
function render(status) {
  switch (status.state) {
    case 'available':
      show(`新しいバージョン ${status.version} をダウンロードしています…`, false);
      break;
    case 'progress':
      show(`ダウンロード中… ${status.percent}%`, false);
      break;
    case 'ready':
      show(`バージョン ${status.version} の準備ができました。`, true);
      break;
    case 'error':
      // 更新の失敗は作業の邪魔をしないよう、バーには出さず記録だけ残す
      console.warn('[update]', status.message);
      break;
    default:
      // checking / none / disabled のときは何も出さない
      break;
  }
}

/** バーを表示する。install が true なら「再起動して更新」ボタンも出す */
function show(message, install) {
  messageEl.textContent = message;
  installBtn.hidden = !install;
  banner.hidden = false;
}

/** バーを閉じる(更新自体は次回終了時に適用される) */
function hide() {
  banner.hidden = true;
}

/**
 * datatools.js — 「データの管理」ダイアログ
 *
 * 責務:
 *   - サイドバー下部の「データ」ボタンでダイアログを開閉する
 *   - メモの書き出しを依頼する
 *   - 使っていない画像を探し、確認のうえでごみ箱へ移すよう依頼する
 *
 * 書き出しも整理も、実際の処理は main/exporter.js と main/cleanup.js が行う。
 * ここは操作の受け付けと結果の表示だけを担当する。
 *
 * どちらも始める前に、編集中のページを保存しておく必要がある
 * (保存前の内容が書き出しに入らない / 貼ったばかりの画像を「未使用」と誤判定する)。
 * その準備は app.js から prepare コールバックとして受け取る。
 */
import * as api from './api.js';

const dialog = document.getElementById('data-dialog');
const statusEl = document.getElementById('data-dialog-status');
const exportBtn = document.getElementById('btn-data-export');
const cleanupBtn = document.getElementById('btn-data-cleanup');

/** 編集中のページを保存し、まだ保存できない内容(本文など)を返すコールバック */
let prepare = async () => [];

/**
 * 初期化。
 * @param {{prepare: () => Promise<string[]>}} options
 */
export function init(options) {
  prepare = options.prepare;
  document.getElementById('btn-data').addEventListener('click', open);
  document.getElementById('btn-data-close').addEventListener('click', () => dialog.close());
  exportBtn.addEventListener('click', exportAll);
  cleanupBtn.addEventListener('click', cleanUnusedImages);
}

/** ダイアログを開く(前回の結果表示は消しておく) */
function open() {
  if (dialog.open) return;
  setStatus('');
  dialog.showModal();
}

/** すべてのメモを書き出す */
async function exportAll() {
  await runExclusive(async () => {
    await prepare();
    setStatus('書き出し先のフォルダを選んでください…');
    const result = await api.exportData();
    if (!result) {
      setStatus(''); // フォルダ選びをやめた
      return;
    }
    setStatus(`${result.pages} ページを書き出しました。書き出したフォルダを開きます。\n${result.path}`);
  });
}

/** 使っていない画像を探し、確認してからごみ箱へ移す */
async function cleanUnusedImages() {
  await runExclusive(async () => {
    const extraTexts = await prepare();
    setStatus('使っていない画像を探しています…');
    const found = await api.findUnusedImages(extraTexts);
    if (found.count === 0) {
      setStatus('使っていない画像はありませんでした。');
      return;
    }

    const ok = confirm(
      `使っていない画像が ${found.count} 件(${formatBytes(found.bytes)})見つかりました。\n` +
        'ごみ箱へ移しますか? (ごみ箱から元に戻せます)'
    );
    if (!ok) {
      setStatus('');
      return;
    }

    const result = await api.trashUnusedImages(extraTexts);
    let message = `${result.count} 件(${formatBytes(result.bytes)})をごみ箱へ移しました。`;
    if (result.failed > 0) message += `\n${result.failed} 件は移せませんでした。`;
    setStatus(message);
  });
}

/**
 * 処理中はボタンを押せなくして二重実行を防ぐ。
 * 失敗したときは、その旨を表示する(ダイアログを開いたまま止めない)。
 */
async function runExclusive(task) {
  exportBtn.disabled = true;
  cleanupBtn.disabled = true;
  try {
    await task();
  } catch (error) {
    console.warn('[datatools]', error);
    setStatus('うまくいきませんでした。もう一度お試しください。');
  } finally {
    exportBtn.disabled = false;
    cleanupBtn.disabled = false;
  }
}

function setStatus(text) {
  statusEl.textContent = text;
}

/** バイト数を「1.2 MB」のような読みやすい形にする */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

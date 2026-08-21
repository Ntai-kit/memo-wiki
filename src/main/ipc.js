/**
 * ipc.js — レンダラーとの通信(IPCハンドラ)
 *
 * 責務:
 *   - レンダラーから呼ばれる各チャンネルを storage の関数に橋渡しする
 *
 * チャンネル名は "対象:操作" の形式で統一する。
 * 新しい機能を追加するときは、ここにハンドラを1行追加し、
 * preload.js に対応するAPIを1行追加すればよい。
 */
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const metadata = require('./metadata');

function register(storage, updater, whatsnew) {
  // ページ操作
  ipcMain.handle('pages:list', () => storage.listPages());
  ipcMain.handle('pages:load', (_e, id) => storage.loadPage(id));
  ipcMain.handle('pages:save', (_e, id, fields) => storage.savePage(id, fields));
  ipcMain.handle('pages:delete', (_e, id) => storage.deletePage(id));
  ipcMain.handle('pages:search', (_e, query) => storage.searchPages(query));
  ipcMain.handle('pages:graph', () => storage.buildGraph());

  // 画像の保存
  ipcMain.handle('images:save', (_e, data, ext) => storage.saveImage(data, ext));

  // リンクカード用のメタデータ取得
  ipcMain.handle('meta:fetch', (_e, url) => metadata.fetchMetadata(url));

  // サムネイル画像を取ってきて、こちらに保存する。
  // 保存してしまえば、あとから見るときに相手のサーバーへ通信しない。
  // 取得できなければ null を返す(呼び出し側は画像なしで続ける)。
  ipcMain.handle('images:download', async (_e, url) => {
    const image = await metadata.fetchImage(url);
    return image ? storage.saveImage(image.data, image.ext) : null;
  });

  // アプリのバージョン(画面下部の表示に使う)
  ipcMain.handle('app:version', () => app.getVersion());

  // 更新内容の表示に使う「前回のバージョン」
  ipcMain.handle('whatsnew:previous', () => whatsnew.getPreviousVersion());
  ipcMain.handle('whatsnew:markSeen', () => whatsnew.markSeen(app.getVersion()));

  // 自動アップデート
  ipcMain.handle('update:check', () => updater.check());
  ipcMain.handle('update:install', () => updater.install());

  // ウィンドウの再描画を要求する。
  // ダイアログを閉じたあと、その部分が描き直されずに残ってしまう環境があるため、
  // 画面側から明示的に「描き直して」と伝えられるようにしておく。
  ipcMain.handle('window:repaint', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.webContents.invalidate();
  });

  // 外部リンクはOSの既定ブラウザで開く
  ipcMain.handle('shell:openExternal', (_e, url) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
}

module.exports = { register };

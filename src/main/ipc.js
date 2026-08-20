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
const { app, ipcMain, shell } = require('electron');
const metadata = require('./metadata');

function register(storage, updater) {
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

  // アプリのバージョン(画面下部の表示に使う)
  ipcMain.handle('app:version', () => app.getVersion());

  // 自動アップデート
  ipcMain.handle('update:check', () => updater.check());
  ipcMain.handle('update:install', () => updater.install());

  // 外部リンクはOSの既定ブラウザで開く
  ipcMain.handle('shell:openExternal', (_e, url) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
}

module.exports = { register };

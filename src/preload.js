/**
 * preload.js — レンダラーに公開する安全なAPI
 *
 * contextBridge 経由で window.memoAPI を定義する。
 * レンダラー側は api.js を通してこれを利用する。
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('memoAPI', {
  // ページ操作
  listPages: () => ipcRenderer.invoke('pages:list'),
  loadPage: (id) => ipcRenderer.invoke('pages:load', id),
  savePage: (id, fields) => ipcRenderer.invoke('pages:save', id, fields),
  deletePage: (id) => ipcRenderer.invoke('pages:delete', id),
  searchPages: (query) => ipcRenderer.invoke('pages:search', query),
  buildGraph: () => ipcRenderer.invoke('pages:graph'),

  // 画像保存(Uint8Array と拡張子を渡すと memo:// のURLが返る)
  saveImage: (data, ext) => ipcRenderer.invoke('images:save', data, ext),

  // Web上の画像を取ってきて保存する(サムネイル用。失敗すると null)
  downloadImage: (url) => ipcRenderer.invoke('images:download', url),

  // 使っていない画像の整理(探す / ごみ箱へ移す)
  findUnusedImages: (extraTexts) => ipcRenderer.invoke('images:findUnused', extraTexts),
  trashUnusedImages: (extraTexts) => ipcRenderer.invoke('images:trashUnused', extraTexts),

  // メモの書き出し(フォルダを選ぶ画面が出る。やめたら null)
  exportData: () => ipcRenderer.invoke('data:export'),

  // リンクカード用のメタデータ取得
  fetchMetadata: (url) => ipcRenderer.invoke('meta:fetch', url),

  // 外部リンクを既定ブラウザで開く
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // ウィンドウの再描画(ダイアログを閉じた跡が残る環境への対策)
  repaintWindow: () => ipcRenderer.invoke('window:repaint'),

  // アプリのバージョン
  getVersion: () => ipcRenderer.invoke('app:version'),

  // 更新内容の表示
  previousVersion: () => ipcRenderer.invoke('whatsnew:previous'),
  markVersionSeen: () => ipcRenderer.invoke('whatsnew:markSeen'),

  // 自動アップデート
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  /** 更新の状況(確認中・ダウンロード中・準備完了など)を受け取る */
  onUpdateStatus: (callback) => ipcRenderer.on('update:status', (_e, status) => callback(status)),
});

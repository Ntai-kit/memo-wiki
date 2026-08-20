/**
 * api.js — メインプロセスAPIの薄いラッパー
 *
 * preload.js が公開した window.memoAPI をモジュールとして
 * 再エクスポートする。他のモジュールは window を直接触らず
 * 必ずここを経由する(将来の差し替え・テストを容易にするため)。
 */
const api = window.memoAPI;

export const listPages = () => api.listPages();
export const loadPage = (id) => api.loadPage(id);
export const savePage = (id, fields) => api.savePage(id, fields);
export const deletePage = (id) => api.deletePage(id);
export const searchPages = (query) => api.searchPages(query);
export const buildGraph = () => api.buildGraph();
export const saveImage = (data, ext) => api.saveImage(data, ext);
export const fetchMetadata = (url) => api.fetchMetadata(url);
export const openExternal = (url) => api.openExternal(url);

// 自動アップデート
export const checkForUpdates = () => api.checkForUpdates();
export const installUpdate = () => api.installUpdate();
export const onUpdateStatus = (callback) => api.onUpdateStatus(callback);

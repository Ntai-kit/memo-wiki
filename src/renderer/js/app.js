/**
 * app.js — アプリ全体のまとめ役
 *
 * 責務:
 *   - 「いま開いているページ」の状態管理
 *   - ページの読み込み・保存・削除・新規作成
 *   - エディタ画面と関連マップ画面の切り替え
 *   - 各モジュール(editor / cover / links / images / paste / pages / search /
 *     graph / updates)の初期化と連携
 *
 * 個々の機能の詳細は各モジュールに任せ、ここでは
 * 「何をどの順番でつなぐか」だけを書く。
 */
import * as api from './api.js';
import * as editor from './editor.js';
import * as cover from './cover.js';
import * as links from './links.js';
import * as images from './images.js';
import * as paste from './paste.js';
import * as pages from './pages.js';
import * as search from './search.js';
import * as graph from './graph.js';
import * as updates from './updates.js';

const titleInput = document.getElementById('page-title');
const saveStatus = document.getElementById('save-status');
const editorPane = document.getElementById('editor-pane');
const mapPane = document.getElementById('map-pane');

let currentPageId = null; // 開いているページのID(未保存の新規ページは null)

/* ---------- ページ操作 ---------- */

/** 現在の編集内容を1つのオブジェクトにまとめる */
function collectFields() {
  return {
    title: titleInput.value.trim(),
    subtitle: cover.getSubtitle(),
    cover: cover.getCover(),
    html: editor.getHTML(),
  };
}

/** ページを開く(移動前に編集中の内容を自動保存する) */
async function openPage(pageId) {
  await saveCurrentPage({ silent: true });
  const page = await api.loadPage(pageId);
  if (!page) return;
  currentPageId = page.id;
  titleInput.value = page.title;
  cover.setPage({ cover: page.cover, subtitle: page.subtitle });
  editor.setHTML(page.html);
  pages.setActive(page.id);
  setStatus('');
  showEditor(); // マップから開いた場合はエディタに戻る
}

/** 編集中のページを保存する */
async function saveCurrentPage({ silent = false } = {}) {
  const fields = collectFields();
  // まっさらな新規ページ(タイトルも本文も空)は保存しない
  if (currentPageId === null && !fields.title && !editor.element().textContent.trim()) return;

  const page = await api.savePage(currentPageId, fields);
  currentPageId = page.id;
  await pages.refresh();
  pages.setActive(page.id);
  if (!silent) setStatus(`保存しました(${new Date().toLocaleTimeString()})`);
}

/** 空の新規ページを開く */
async function newPage() {
  await saveCurrentPage({ silent: true });
  currentPageId = null;
  titleInput.value = '';
  cover.setPage({ cover: '', subtitle: '' });
  editor.setHTML('');
  pages.setActive(null);
  search.clear();
  await pages.refresh();
  showEditor();
  titleInput.focus();
}

/** 現在のページを削除する */
async function deleteCurrentPage() {
  if (currentPageId === null) return;
  const ok = confirm(`「${titleInput.value}」を削除しますか?`);
  if (!ok) return;
  await api.deletePage(currentPageId);
  currentPageId = null;
  titleInput.value = '';
  cover.setPage({ cover: '', subtitle: '' });
  editor.setHTML('');
  await pages.refresh();
}

/**
 * タイトルだけの新規ページを作る(リンクダイアログの
 * 「新しいページを作ってリンク」から使われる)。
 */
async function createPageByTitle(title) {
  const page = await api.savePage(null, { title, html: '' });
  await pages.refresh();
  pages.setActive(currentPageId);
  return page;
}

/** ツールバー右端に保存状態を表示する */
function setStatus(text) {
  saveStatus.textContent = text;
}

/* ---------- 画面の切り替え ---------- */

/** エディタ画面を表示する */
function showEditor() {
  mapPane.hidden = true;
  editorPane.hidden = false;
  graph.hide();
}

/** 関連マップ画面を表示する(直前に保存して最新の状態を反映する) */
async function showMap() {
  await saveCurrentPage({ silent: true });
  editorPane.hidden = true;
  mapPane.hidden = false;
  await graph.show(currentPageId);
}

/* ---------- 初回起動時の使い方ページ ---------- */

async function createWelcomePageIfEmpty() {
  const existing = await api.listPages();
  if (existing.length > 0) return;
  await api.savePage(null, {
    title: 'はじめに',
    subtitle: 'このアプリの使い方',
    html:
      '<h2>Memo Wiki の使い方</h2>' +
      '<p>このアプリはWikipediaのように、ページ同士をリンクでつなげられるメモ帳です。</p>' +
      '<ul>' +
      '<li><b>ページ同士のリンク:</b> 文字を選択して「🔗 リンク」ボタン(Ctrl+K)を押し、リンク先ページをクリックで選びます。</li>' +
      '<li><b>Webサイトのリンク:</b> 同じダイアログの「表示する文字」と「リンク先URL」を入れて「🔗 文字にリンク」を押すと、その文字にリンクが埋め込まれます。文字を選んでから開けば選択した文字が初期値になります。カード表示や埋め込み(YouTubeなどの動画はメモ内で再生可能)も選べます。</li>' +
      '<li><b>リンクの編集:</b> 貼ったリンクを Ctrl+クリック すると、表示文字やリンク先を変更したり解除したりできます。</li>' +
      '<li><b>画像:</b> 「🖼 画像」ボタンのほか、Ctrl+V での貼り付けやドラッグ&ドロップでも挿入できます。</li>' +
      '<li><b>トップ画像・サブタイトル:</b> タイトルの上の「🖼 トップ画像を追加」でページ上部に大きな画像を置けます。タイトル下の欄には1行の説明を書けます。</li>' +
      '<li><b>関連マップ:</b> 左上の「🗺 関連マップ」で、ページ同士のつながりを図として見られます。丸をクリックするとそのページが開きます。</li>' +
      '<li><b>保存:</b> 「💾 保存」ボタンか Ctrl+S。別のページに移動するときは自動保存されます。</li>' +
      '<li><b>検索:</b> 左上の検索ボックスでタイトルと本文を検索できます。</li>' +
      '</ul>',
  });
}

/* ---------- 起動処理 ---------- */

async function main() {
  // 各モジュールを初期化し、必要なコールバックを渡す
  pages.init(openPage);
  search.init();
  images.init();
  paste.init(); // 貼り付け・ドロップの受け口(内容を浄化してから挿入)
  cover.init(() => setStatus('未保存の変更があります'));
  links.init({ navigate: openPage, createPage: createPageByTitle });
  graph.init(openPage); // マップのノードをクリックしたらそのページを開く
  updates.init(); // 自動アップデートの通知バー

  // ツールバー: 書式ボタン(data-cmd属性で共通処理)
  for (const btn of document.querySelectorAll('#toolbar button[data-cmd]')) {
    btn.addEventListener('click', () => editor.format(btn.dataset.cmd));
  }

  // ツールバー: 保存・削除・新規
  document.getElementById('btn-save').addEventListener('click', () => saveCurrentPage());
  document.getElementById('btn-delete').addEventListener('click', deleteCurrentPage);
  document.getElementById('btn-new-page').addEventListener('click', newPage);

  // 画面切り替え
  document.getElementById('btn-map').addEventListener('click', showMap);
  document.getElementById('btn-map-close').addEventListener('click', showEditor);

  // キーボードショートカット: Ctrl+S 保存 / Ctrl+K リンク
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === 's') {
      e.preventDefault();
      saveCurrentPage();
    } else if (e.key === 'k' && mapPane.hidden) {
      // マップ表示中は本文を編集していないので何もしない
      e.preventDefault();
      links.openDialog();
    }
  });

  // 初回起動なら使い方ページを作り、最新のページを開く
  await createWelcomePageIfEmpty();
  await pages.refresh();
  const all = await api.listPages();
  if (all.length > 0) await openPage(all[0].id);
}

main();

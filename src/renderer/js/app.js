/**
 * app.js — アプリ全体のまとめ役
 *
 * 責務:
 *   - 「いま開いているページ」の状態管理
 *   - ページの読み込み・保存・新規作成
 *   - ごみ箱への出し入れと完全な削除
 *   - エディタ画面と関連マップ画面の切り替え
 *   - 各モジュール(editor / cover / links / images / paste / pages / search /
 *     graph / updates / guide / whatsnew / repaint / toc / videos / datatools / folders)の初期化と連携
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
import * as guide from './guide.js';
import * as whatsnew from './whatsnew.js';
import * as repaint from './repaint.js';
import * as toc from './toc.js';
import * as videos from './videos.js';
import * as datatools from './datatools.js';
import * as folders from './folders.js';

const titleInput = document.getElementById('page-title');
const saveStatus = document.getElementById('save-status');
const editorPane = document.getElementById('editor-pane');
const mapPane = document.getElementById('map-pane');
const trashBanner = document.getElementById('trash-banner');

let currentPageId = null; // 開いているページのID(未保存の新規ページは null)

/* ---------- ページ操作 ---------- */

/** 現在の編集内容を1つのオブジェクトにまとめる */
function collectFields() {
  return {
    title: titleInput.value.trim(),
    subtitle: cover.getSubtitle(),
    cover: cover.getCover(),
    html: editor.getHTML(),
    folderId: folders.getSelected(),
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
  folders.setSelected(page.folderId);
  pages.setCurrentFolder(page.folderId); // 「新規ページ」などはこのページのフォルダに作る
  trashBanner.hidden = !page.trashedAt;
  editor.setHTML(page.html);
  toc.refresh(); // 保存されていた目次を最新の見出しで作り直す
  pages.setActive(page.id);
  setStatus('');
  showEditor(); // マップから開いた場合はエディタに戻る

  // 昔のバージョンで入れた動画の埋め込みを動画カードに置き換える。
  // 通信を伴うので待たずに進め、終わったら知らせるだけにする
  // (置き換えた結果は次に保存されたときにファイルへ反映される)。
  upgradeVideosInBackground(page.id);
}

/** 開いているページの古い動画埋め込みを、裏で動画カードに置き換える */
async function upgradeVideosInBackground(pageId) {
  const replaced = await videos.upgradeOldEmbeds();
  if (replaced > 0 && currentPageId === pageId) {
    setStatus(`動画${replaced}件を動画カードにしました`);
  }
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

/**
 * 空の新規ページを開く。
 * サイドバーで選んでいるフォルダ(開いていたページのフォルダ)に入れる。
 */
async function newPage() {
  await saveCurrentPage({ silent: true });
  const folderId = pages.getCurrentFolder();
  clearEditor();
  folders.setSelected(folderId);
  search.clear();
  await pages.showPages(); // ごみ箱を見ていたときも、ページ一覧に戻す
  showEditor();
  titleInput.focus();
}

/** 編集欄を空にする(どのページも開いていない状態にする) */
function clearEditor() {
  currentPageId = null;
  titleInput.value = '';
  cover.setPage({ cover: '', subtitle: '' });
  folders.setSelected('');
  trashBanner.hidden = true;
  editor.setHTML('');
  pages.setActive(null); // 一覧に消したページの選択が残らないようにする
}

/**
 * 現在のページをごみ箱へ移す。
 * ごみ箱から元に戻せるので確認は出さない。ごみ箱にあるページなら完全に削除する。
 */
async function deleteCurrentPage() {
  if (currentPageId === null) return;
  if (!trashBanner.hidden) {
    await deleteForever(currentPageId);
    return;
  }
  await saveCurrentPage({ silent: true });
  await api.trashPage(currentPageId);
  clearEditor();
  await pages.refresh();
  setStatus('ごみ箱へ移しました');
}

/** ごみ箱からページを戻す。開いているページなら案内を消す */
async function restorePage(pageId) {
  await api.restorePage(pageId);
  if (pageId === currentPageId) trashBanner.hidden = true;
  await pages.refresh();
  setStatus('ページを元に戻しました');
}

/** ページを完全に削除する(確認してから) */
async function deleteForever(pageId) {
  const page = await api.loadPage(pageId);
  const title = page ? page.title : '';
  const ok = confirm(`「${title}」を完全に削除しますか?\nこの操作は元に戻せません。`);
  if (!ok) return;
  await api.deletePage(pageId);
  if (pageId === currentPageId) clearEditor();
  await pages.refresh();
  setStatus('');
}

/** ごみ箱を空にする(確認してから) */
async function emptyTrash() {
  const trashed = await api.listTrash();
  if (trashed.length === 0) return;
  const ok = confirm(`ごみ箱の${trashed.length}ページを完全に削除しますか?\nこの操作は元に戻せません。`);
  if (!ok) return;
  const openIsTrashed = trashed.some((p) => p.id === currentPageId);
  await api.emptyTrash();
  if (openIsTrashed) clearEditor();
  await pages.refresh();
  setStatus(`${trashed.length}ページを完全に削除しました`);
}

/** 選択欄でフォルダを選び直したら、すぐにそのフォルダへ移す */
async function changeFolder(folderId) {
  pages.setCurrentFolder(folderId);
  if (currentPageId === null) return; // 新規ページは保存するときに入る
  await api.movePage(currentPageId, folderId);
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

/* ---------- 起動処理 ---------- */

async function main() {
  // 各モジュールを初期化し、必要なコールバックを渡す
  pages.init({
    open: openPage,
    moved: (pageId, folderId) => {
      if (pageId !== currentPageId) return;
      folders.setSelected(folderId);
      pages.setCurrentFolder(folderId);
    },
    // 開いているページの入り先がひとつ上の階層に変わっていることがあるので、
    // 保存されている入り先に選択欄を合わせ直す(合わせないと、次の保存で未分類へ移ってしまう)
    folderDeleted: async () => {
      if (currentPageId === null) return;
      const page = await api.loadPage(currentPageId);
      if (page) folders.setSelected(page.folderId);
    },
    restore: restorePage,
    deleteForever,
    emptyTrash,
  });
  folders.init(changeFolder);
  search.init();
  images.init();
  paste.init(); // 貼り付け・ドロップの受け口(内容を浄化してから挿入)
  cover.init(() => setStatus('未保存の変更があります'));
  links.init({ navigate: openPage, createPage: createPageByTitle });
  graph.init(openPage); // マップのノードをクリックしたらそのページを開く
  updates.init(); // 自動アップデートの通知バー
  guide.init(); // 「?」ボタンで開く使い方ガイド
  whatsnew.init(); // 更新内容のお知らせ
  repaint.init(); // ダイアログを閉じた跡が残る環境への対策
  toc.init(); // 目次の挿入と自動更新

  // データの管理(書き出し・画像の整理)。始める前に編集中のページを保存し、
  // まだ保存されていない新規ページの内容も「使用中」として渡す
  datatools.init({
    prepare: async () => {
      await saveCurrentPage({ silent: true });
      const fields = collectFields();
      return [fields.html, fields.cover];
    },
  });

  // ツールバー: 書式ボタン(data-cmd属性で共通処理)
  for (const btn of document.querySelectorAll('#toolbar button[data-cmd]')) {
    btn.addEventListener('click', () => editor.format(btn.dataset.cmd));
  }

  // ツールバー: 保存・削除・新規
  document.getElementById('btn-save').addEventListener('click', () => saveCurrentPage());
  document.getElementById('btn-delete').addEventListener('click', deleteCurrentPage);
  document.getElementById('btn-new-page').addEventListener('click', newPage);

  // ごみ箱にあるページの案内
  document.getElementById('btn-banner-restore').addEventListener('click', () =>
    restorePage(currentPageId)
  );
  document.getElementById('btn-banner-delete').addEventListener('click', () =>
    deleteForever(currentPageId)
  );

  // 画面切り替え
  document.getElementById('btn-map').addEventListener('click', showMap);
  document.getElementById('btn-map-close').addEventListener('click', showEditor);

  // キーボードショートカット: Ctrl+S 保存 / Ctrl+K リンク
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    // ダイアログを開いている間は本文の操作をしない
    if (document.querySelector('dialog[open]')) return;
    // CapsLockやShiftで大文字になっても効くように小文字にそろえる
    const key = String(e.key).toLowerCase();
    if (key === 's') {
      e.preventDefault();
      saveCurrentPage();
    } else if (key === 'k' && mapPane.hidden) {
      // マップ表示中は本文を編集していないので何もしない
      e.preventDefault();
      links.openDialog();
    }
  });

  // 最後に編集したページを開く。
  // まだ1つも無ければ(初回起動)、使い方ガイドを出す
  await pages.refresh();
  const all = await api.listPages();
  if (all.length > 0) await openPage(all[0].id);

  // 更新直後なら変更点をお知らせする
  const showedNotes = await whatsnew.showIfUpdated();

  // メモが1つも無ければ使い方ガイドを出す
  // (更新のお知らせを出したときは重ならないよう見送る)
  if (all.length === 0) {
    if (!showedNotes) guide.open();
    titleInput.focus();
  }
}

main();

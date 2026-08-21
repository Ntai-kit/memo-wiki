/**
 * links.js — リンク機能(クリック操作で設定)
 *
 * 責務:
 *   - リンク設定ダイアログの表示と操作
 *       ・既存ページ一覧から選んで内部リンクを張る
 *       ・選択中の文字で新規ページを作ってリンクを張る
 *       ・任意の文字にWebサイトのURLを埋め込む(表示する文字は自由に指定できる)
 *       ・URLを「文字リンク / カード / 埋め込み」として挿入する
 *       ・動画サイトの「埋め込みコード」を貼っても、中のURLを取り出して使う
 *   - すでに張ったリンクの編集(表示文字・リンク先の変更、リンクの解除)
 *   - 本文中のリンククリック時の動作
 *       ・内部リンク → そのページへ移動
 *       ・外部リンク、リンクカード → 既定ブラウザで開く
 *       ・Ctrl+クリック → そのリンクを編集する
 *
 * 文字にリンクを埋め込む方法は3通りあり、いずれも記法の入力は不要:
 *   1. 文字を選択してから「🔗 リンク」(選択した文字が表示文字になる)
 *   2. 何も選択せずに「🔗 リンク」→ ダイアログで表示文字とURLを入力
 *   3. Ctrl+K でダイアログを開く
 *
 * リンクのHTML表現:
 *   内部:   <a class="internal-link" data-page-id="ID">表示文字</a>
 *   外部:   <a class="external-link" href="URL">表示文字</a>
 *   カード: <a class="link-card" href="URL">…</a>      (生成は embeds.js)
 *   埋め込み: <span class="embed-wrapper"><iframe …></span>(生成は embeds.js)
 */
import * as api from './api.js';
import * as editor from './editor.js';
import * as embeds from './embeds.js';

const dialog = document.getElementById('link-dialog');
const filterInput = document.getElementById('link-page-filter');
const pageListEl = document.getElementById('link-page-list');
const urlInput = document.getElementById('link-url-input');
const textInput = document.getElementById('link-text-input');
const newPageBtn = document.getElementById('btn-link-new-page');
const statusEl = document.getElementById('link-dialog-status');
const removeBtn = document.getElementById('btn-link-remove');
const dialogTitle = document.getElementById('link-dialog-title');
const externalBtn = document.getElementById('btn-link-external');

let allPages = []; // ダイアログ表示中のページ一覧キャッシュ
let onNavigate = null; // 内部リンククリック時にページを開くコールバック
let editingAnchor = null; // 編集中の既存リンク(新規作成のときは null)

/**
 * 初期化。
 * @param {object} handlers
 * @param {(pageId: string) => void} handlers.navigate 内部リンクで移動する処理
 * @param {(title: string) => Promise<object>} handlers.createPage 新規ページ作成処理
 */
export function init(handlers) {
  onNavigate = handlers.navigate;

  // ツールバーの「リンク」ボタン → ダイアログを開く
  document.getElementById('btn-link').addEventListener('click', () => openDialog());

  // ツールバーの「リンク解除」ボタン
  document.getElementById('btn-unlink').addEventListener('click', () => editor.unlink());

  // ダイアログ内: ページ名で絞り込み
  filterInput.addEventListener('input', () => renderPageList(filterInput.value));

  // ダイアログ内: 「新しいページを作ってリンク」
  newPageBtn.addEventListener('click', async () => {
    const title = displayText() || '無題のページ';
    const page = await handlers.createPage(title);
    insertInternalLink(page.id, title);
  });

  // ダイアログ内: WebサイトURLの挿入(文字リンク / カード / 埋め込み)
  externalBtn.addEventListener('click', () => withValidUrl(applyExternalLink));
  document.getElementById('btn-link-card').addEventListener('click', () =>
    withValidUrl(applyLinkCard)
  );
  document.getElementById('btn-link-embed').addEventListener('click', () =>
    withValidUrl(applyEmbed)
  );

  // ダイアログ内: Enterキーでも文字リンクを作れるようにする
  for (const input of [textInput, urlInput]) {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      withValidUrl(applyExternalLink);
    });
  }

  // ダイアログ内: リンクの解除(編集中のみ表示)
  removeBtn.addEventListener('click', () => {
    if (editingAnchor) editor.removeLink(editingAnchor);
    dialog.close();
  });

  // ダイアログ内: キャンセル
  document.getElementById('btn-link-cancel').addEventListener('click', () => dialog.close());

  // 本文中のリンクのクリック処理
  editor.element().addEventListener('click', handleLinkClick);
}

/**
 * リンク設定ダイアログを開く。
 * @param {HTMLAnchorElement|null} anchor 編集する既存リンク(新規作成なら省略)
 */
export async function openDialog(anchor = null) {
  if (anchor) {
    // 既存リンクの編集: そのリンク全体を選択範囲として扱う
    editor.saveSelectionOnElement(anchor);
    editingAnchor = anchor;
  } else {
    editor.saveSelection(); // ダイアログで選択が失われる前に退避
    editingAnchor = editor.linkAtSavedSelection(); // カーソルがリンク内なら編集扱い
  }

  allPages = await api.listPages();
  filterInput.value = '';
  statusEl.textContent = '';
  renderPageList('');
  applyDialogMode();
  dialog.showModal();

  // 表示文字が既に決まっているならURL欄から、そうでなければ表示文字欄から入力できるようにする
  (textInput.value ? urlInput : textInput).focus();
}

/** 編集モード / 新規モードに応じてダイアログの表示を整える */
function applyDialogMode() {
  const selectedText = editor.savedSelectionText().trim();

  if (editingAnchor) {
    dialogTitle.textContent = 'リンクを編集';
    textInput.value = editingAnchor.textContent;
    urlInput.value = editingAnchor.getAttribute('href') || '';
    externalBtn.textContent = '🔗 更新';
  } else {
    dialogTitle.textContent = 'リンクを設定';
    textInput.value = selectedText; // 選択していた文字を初期値にする
    urlInput.value = '';
    externalBtn.textContent = '🔗 文字にリンク';
  }
  removeBtn.hidden = !editingAnchor;

  // 「新規ページを作ってリンク」ボタンのラベルにも表示文字を反映する
  const text = displayText();
  newPageBtn.textContent = text
    ? `「${text}」で新しいページを作ってリンク`
    : '新しいページを作ってリンク';
}

/** ダイアログで指定されている表示文字(空なら選択中の文字) */
function displayText() {
  return textInput.value.trim() || editor.savedSelectionText().trim();
}

/** ダイアログ内のページ一覧を描画する */
function renderPageList(filter) {
  const q = filter.toLowerCase();
  pageListEl.innerHTML = '';
  for (const page of allPages) {
    if (q && !page.title.toLowerCase().includes(q)) continue;
    const li = document.createElement('li');
    li.textContent = page.title;
    li.addEventListener('click', () => insertInternalLink(page.id, page.title));
    pageListEl.appendChild(li);
  }
}

/** 内部リンクを本文に挿入する(編集中なら既存リンクを置き換える) */
function insertInternalLink(pageId, pageTitle) {
  const text = displayText() || pageTitle;
  const html = `<a class="internal-link" data-page-id="${pageId}">${editor.escapeHTML(text)}</a>&nbsp;`;
  insertOrReplace(html);
}

/**
 * URL入力欄を検証してから処理を実行する共通ヘルパー。
 * http(s)以外や空欄のときはメッセージを出して何もしない。
 */
function withValidUrl(action) {
  // 「共有 → 埋め込む」で得られる <iframe …> のコードを貼られても
  // 中のURLを取り出して使えるようにする
  let url = embeds.extractUrl(urlInput.value);
  if (url && !/^https?:\/\//.test(url)) url = `https://${url}`; // スキーム省略を補う
  try {
    new URL(url);
  } catch {
    statusEl.textContent = 'URLを入力してください';
    urlInput.focus();
    return;
  }
  action(url);
}

/**
 * 文字にリンクを埋め込む。
 * 編集中の既存リンクがあれば、その表示文字とリンク先を書き換える。
 */
function applyExternalLink(url) {
  const text = displayText() || url; // 表示文字が無ければURLをそのまま見せる
  const anchor = editingAnchor;
  dialog.close();

  if (anchor) {
    editor.updateLink(anchor, { url, text });
    return;
  }
  editor.restoreSelection();
  editor.insertHTML(
    `<a class="external-link" href="${editor.escapeHTML(url)}">${editor.escapeHTML(text)}</a>&nbsp;`
  );
}

/** リンクカードを挿入する(メタデータ取得中はダイアログに状況を表示) */
async function applyLinkCard(url) {
  statusEl.textContent = 'ページ情報を取得中…';
  setUrlButtonsDisabled(true);
  try {
    const meta = await api.fetchMetadata(url); // 失敗時もURLだけのmetaが返る
    insertOrReplace(embeds.buildCardHTML(meta));
  } finally {
    setUrlButtonsDisabled(false);
    statusEl.textContent = '';
  }
}

/** iframe埋め込みを挿入する */
function applyEmbed(url) {
  insertOrReplace(embeds.buildEmbedHTML(url));
}

/**
 * HTMLを本文に反映する。
 * 既存リンクを編集中ならそれを置き換え、そうでなければ選択位置に挿入する。
 */
function insertOrReplace(html) {
  const anchor = editingAnchor;
  dialog.close();
  if (anchor) {
    editor.replaceElement(anchor, html);
    return;
  }
  editor.restoreSelection();
  editor.insertHTML(html);
}

/** URL挿入ボタンの有効/無効をまとめて切り替える */
function setUrlButtonsDisabled(disabled) {
  for (const id of ['btn-link-external', 'btn-link-card', 'btn-link-embed']) {
    document.getElementById(id).disabled = disabled;
  }
}

/** 本文中のリンクをクリックしたときの処理 */
function handleLinkClick(event) {
  const anchor = event.target.closest('a');
  if (!anchor) return;
  event.preventDefault(); // contenteditable内でのカーソル移動より優先する

  // Ctrl(macはCmd)+クリック → 開かずに編集する
  if (event.ctrlKey || event.metaKey) {
    if (!anchor.classList.contains('link-card')) openDialog(anchor);
    return;
  }

  const pageId = anchor.dataset.pageId;
  if (pageId) {
    onNavigate(pageId); // 内部リンク → ページ移動
  } else if (anchor.href) {
    api.openExternal(anchor.href); // 外部リンク → 既定ブラウザ
  }
}

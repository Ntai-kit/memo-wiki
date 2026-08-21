/**
 * editor.js — 本文エディタ(contenteditable)の操作
 *
 * 責務:
 *   - 本文HTMLの取得・設定
 *   - カーソル位置(選択範囲)の保存と復元
 *     ※ダイアログを開くと選択が失われるため、開く前に保存しておく
 *   - 書式設定(見出し・太字・箇条書き)とHTML挿入
 *
 * リンクや画像の「何を挿入するか」は links.js / images.js が決め、
 * 「どう挿入するか」はこのモジュールが担当する。
 */

const editorEl = document.getElementById('editor');

let savedRange = null; // ダイアログ表示中に退避しておく選択範囲

/** 本文のHTMLを取得する */
export function getHTML() {
  return editorEl.innerHTML;
}

/** 本文のHTMLを設定する */
export function setHTML(html) {
  editorEl.innerHTML = html;
}

/** エディタ本体の要素(クリックイベント購読などに使う) */
export function element() {
  return editorEl;
}

/** 現在の選択範囲を退避する(ダイアログを開く直前に呼ぶ) */
export function saveSelection() {
  const sel = window.getSelection();
  savedRange =
    sel.rangeCount > 0 && editorEl.contains(sel.anchorNode)
      ? sel.getRangeAt(0).cloneRange()
      : null;
}

/** 退避した選択範囲を復元する(ダイアログを閉じた後に呼ぶ) */
export function restoreSelection() {
  editorEl.focus();
  if (!savedRange) return;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedRange);
}

/** 退避してある選択範囲の文字列(リンクの表示文字などに使う) */
export function savedSelectionText() {
  return savedRange ? savedRange.toString() : '';
}

/** HTML特殊文字をエスケープする */
export function escapeHTML(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** カーソル位置にHTMLを挿入する(選択中なら置き換える) */
export function insertHTML(html) {
  editorEl.focus();
  document.execCommand('insertHTML', false, html);
}

/** ツールバーの見出しボタンと、実際に使うタグの対応 */
const HEADING_TAGS = {
  heading1: 'h2', // 大見出し(目次では「1.」の階層)
  heading2: 'h3', // 小見出し(目次では「1.1」の階層)
};

/**
 * ツールバーの書式コマンドを実行する。
 * cmd: "heading1" | "heading2" | "bold" | "list"
 */
export function format(cmd) {
  editorEl.focus();
  if (HEADING_TAGS[cmd]) {
    // すでに同じ見出しなら段落に戻す(トグル動作)
    const tag = HEADING_TAGS[cmd];
    const current = String(document.queryCommandValue('formatBlock')).toLowerCase();
    document.execCommand('formatBlock', false, current === tag ? 'p' : tag);
  } else if (cmd === 'bold') {
    document.execCommand('bold');
  } else if (cmd === 'list') {
    document.execCommand('insertUnorderedList');
  }
}

/** 選択範囲のリンクを解除する */
export function unlink() {
  editorEl.focus();
  document.execCommand('unlink');
}

/* ---------- リンク要素の操作 ---------- */

/**
 * 指定した要素全体を「保存された選択範囲」として扱う。
 * 既にあるリンクをクリックして編集するときに使う。
 */
export function saveSelectionOnElement(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  savedRange = range;
}

/**
 * 保存された選択範囲が既存のリンクの中にあれば、その <a> 要素を返す。
 * 無ければ null。カード形式のリンクは文字リンクではないので対象外。
 */
export function linkAtSavedSelection() {
  if (!savedRange) return null;
  const node = savedRange.commonAncestorContainer;
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const anchor = element ? element.closest('a') : null;
  if (!anchor || !editorEl.contains(anchor)) return null;
  return anchor.classList.contains('link-card') ? null : anchor;
}

/** 既存のリンクの表示文字とリンク先を書き換える */
export function updateLink(anchor, { url, text }) {
  editorEl.focus();
  anchor.className = 'external-link';
  anchor.removeAttribute('data-page-id');
  anchor.setAttribute('href', url);
  anchor.textContent = text;
}

/** 指定要素をHTMLで丸ごと置き換える(リンク→カードへの変更などに使う) */
export function replaceElement(element, html) {
  editorEl.focus();
  const range = document.createRange();
  range.selectNode(element);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand('insertHTML', false, html);
}

/** カードや埋め込みなど、ひとかたまりの要素を丸ごと削除する */
export function removeElement(element) {
  editorEl.focus();
  element.remove();
}

/** リンクを解除して、中の文字だけを残す */
export function removeLink(anchor) {
  editorEl.focus();
  anchor.replaceWith(document.createTextNode(anchor.textContent));
}

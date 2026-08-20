/**
 * pages.js — サイドバーのページ一覧
 *
 * 責務:
 *   - 全ページ一覧の描画
 *   - 検索結果一覧の描画(search.js から呼ばれる)
 *   - 現在開いているページのハイライト
 */
import * as api from './api.js';

const listEl = document.getElementById('page-list');

let onOpen = null;      // 項目クリック時にページを開くコールバック
let activeId = null;    // 現在開いているページID

/**
 * 初期化。
 * @param {(pageId: string) => void} openHandler ページを開く処理
 */
export function init(openHandler) {
  onOpen = openHandler;
}

/** 全ページの一覧を描画する(サブタイトルがあれば副見出しとして表示) */
export async function refresh() {
  const pages = await api.listPages();
  render(pages.map((p) => ({ id: p.id, title: p.title, snippet: p.subtitle || '' })));
}

/** 検索結果(スニペット付き)を描画する */
export function showSearchResults(results) {
  render(results);
}

/** 現在開いているページを記録し、一覧のハイライトを更新する */
export function setActive(pageId) {
  activeId = pageId;
  for (const li of listEl.children) {
    li.classList.toggle('active', li.dataset.pageId === pageId);
  }
}

/** 一覧を描画する共通処理。items: [{ id, title, snippet? }] */
function render(items) {
  listEl.innerHTML = '';
  for (const item of items) {
    const li = document.createElement('li');
    li.dataset.pageId = item.id;
    li.textContent = item.title;
    if (item.snippet) {
      const span = document.createElement('span');
      span.className = 'snippet';
      span.textContent = item.snippet;
      li.appendChild(span);
    }
    li.classList.toggle('active', item.id === activeId);
    li.addEventListener('click', () => onOpen(item.id));
    listEl.appendChild(li);
  }
}

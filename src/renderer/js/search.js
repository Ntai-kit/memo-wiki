/**
 * search.js — 検索ボックス
 *
 * 責務:
 *   - 入力に応じてタイトル・本文を検索し、結果を一覧に表示する
 *   - 入力が空になったら通常のページ一覧に戻す
 *
 * 連続入力で検索が走りすぎないよう、入力後少し待ってから
 * 実行する(デバウンス)。
 */
import * as api from './api.js';
import * as pages from './pages.js';

const DEBOUNCE_MS = 250;

const input = document.getElementById('search-input');
let timer = null;

export function init() {
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(runSearch, DEBOUNCE_MS);
  });
}

/** 検索ボックスを空にして一覧表示に戻す */
export function clear() {
  input.value = '';
}

async function runSearch() {
  const query = input.value.trim();
  if (!query) {
    await pages.refresh(); // 空なら全ページ一覧へ
    return;
  }
  const results = await api.searchPages(query);
  pages.showSearchResults(results);
}

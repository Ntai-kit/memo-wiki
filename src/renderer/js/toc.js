/**
 * toc.js — Wikipedia風の目次
 *
 * 責務:
 *   - 本文の好きな位置に「目次」を差し込む
 *   - 本文中の見出しから、目次の中身を自動で作り直す
 *   - 目次の項目をクリックしたら、その見出しまで移動する
 *
 * 目次のHTML表現:
 *   <div class="toc-block" contenteditable="false"> …自動生成… </div>
 *
 * 中身は毎回作り直すため、見出しを増やしたり書き換えたりしても自動的に追従する。
 * 目次そのものは編集できない「ひとかたまり」として扱い、
 * 選択して BackSpace で丸ごと消せる。
 *
 * 目次の項目は <a> ではなく <span> にしてある。
 * links.js が本文中の <a> のクリックを横取りするため、
 * それと取り違えられないようにするためである。
 */
import * as editor from './editor.js';

/** 目次に載せる見出し(大見出し → 小見出し → その下) */
const HEADING_SELECTOR = 'h2, h3, h4';

/** 入力のたびに作り直すと重いので、少し待ってからまとめて処理する */
const REFRESH_DELAY_MS = 300;

let refreshTimer = null;

export function init() {
  document.getElementById('btn-toc').addEventListener('click', insert);
  editor.element().addEventListener('input', scheduleRefresh);
  editor.element().addEventListener('click', handleClick);
}

/** カーソル位置に目次を差し込む */
function insert() {
  editor.insertHTML('<div class="toc-block" contenteditable="false"></div><p><br></p>');
  refresh();
}

/** 入力が落ち着いてから目次を作り直す */
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, REFRESH_DELAY_MS);
}

/**
 * 本文中のすべての目次を作り直す。
 * ページを開いた直後にも呼ぶこと(保存されていた古い中身を最新にするため)。
 */
export function refresh() {
  const root = editor.element();
  const blocks = [...root.querySelectorAll('.toc-block')];
  if (blocks.length === 0) return; // 目次が無いページでは何もしない

  // 見出しに移動先の目印を付ける
  const headings = [...root.querySelectorAll(HEADING_SELECTOR)];
  headings.forEach((heading, index) => {
    heading.id = `sec-${index + 1}`;
  });

  const html = buildHTML(headings);
  for (const block of blocks) {
    // 貼り付けなどで編集可能になっていても、必ず編集不可に直す
    block.setAttribute('contenteditable', 'false');
    block.innerHTML = html;
  }
}

/** 目次の中身を組み立てる */
function buildHTML(headings) {
  if (headings.length === 0) {
    return (
      '<div class="toc-title">目次</div>' +
      '<p class="toc-empty">「大見出し」「小見出し」を使うと、ここに自動で並びます。</p>'
    );
  }

  // 1. / 1.1 / 1.2 / 2. のような番号を振る
  const counters = [0, 0, 0]; // h2, h3, h4 それぞれの番号
  const items = headings.map((heading) => {
    const level = Number(heading.tagName[1]) - 2; // h2→0, h3→1, h4→2
    counters[level] += 1;
    for (let deeper = level + 1; deeper < counters.length; deeper++) counters[deeper] = 0;

    const number = counters.slice(0, level + 1).join('.');
    const text = editor.escapeHTML(heading.textContent.trim() || '(無題の見出し)');
    return (
      `<li class="toc-item toc-level-${level}">` +
      `<span class="toc-link" data-target="${heading.id}">` +
      `<span class="toc-number">${number}</span>${text}` +
      `</span></li>`
    );
  });

  return `<div class="toc-title">目次</div><ul class="toc-list">${items.join('')}</ul>`;
}

/** 目次の項目をクリックしたら、その見出しまで移動する */
function handleClick(event) {
  const link = event.target.closest('.toc-link');
  if (!link) return;
  event.preventDefault();

  const heading = document.getElementById(link.dataset.target);
  if (heading) heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

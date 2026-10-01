/**
 * exporter.js — メモの書き出し(エクスポート)
 *
 * 責務:
 *   - すべてのメモを、ブラウザで読めるHTMLとして書き出す
 *   - 同じフォルダに、復元に使える元データ(data/)のコピーを入れる
 *
 * 書き出したフォルダの構成:
 *   MemoWiki-書き出し-2026-10-01-12-00-00/
 *   ├── index.html          ← ページ一覧(ここから読み始める)
 *   ├── style.css
 *   ├── pages/<ID>.html     ← 1ページ = 1つのHTML
 *   ├── data/               ← アプリのデータそのもの(pages/ と images/)
 *   └── このフォルダについて.txt
 *
 * 画像は data/images/ を HTML からも参照するので、二重に持たない。
 * data/ を %APPDATA%\memo-wiki\data に置けば、そのままアプリで開ける。
 *
 * 本文HTMLの書き換え(toExportHTML など)は純粋関数にしてあり、単体テストできる。
 */
const fs = require('fs');
const path = require('path');

/**
 * すべてのメモを書き出す。
 * @param {object} storage storage.js
 * @param {string} parentDir 書き出し先として利用者が選んだフォルダ
 * @param {Date} now フォルダ名に使う日時(テストで固定する)
 * @returns {{path: string, pages: number, images: number}}
 */
function exportAll(storage, parentDir, now = new Date()) {
  const outDir = uniqueDir(path.join(parentDir, `MemoWiki-書き出し-${stamp(now)}`));
  const pagesOut = path.join(outDir, 'pages');
  fs.mkdirSync(pagesOut, { recursive: true });

  // 1. 元データをそのままコピーする(書きかけの一時ファイルは除く)
  const dataOut = path.join(outDir, 'data');
  fs.cpSync(storage.getDataDir(), dataOut, {
    recursive: true,
    filter: (src) => !src.endsWith('.tmp'),
  });

  // 2. 読む用のHTMLを作る
  const pages = storage
    .listPages()
    .map((meta) => storage.loadPage(meta.id))
    .filter(Boolean);
  const existingIds = new Set(pages.map((p) => p.id));

  for (const page of pages) {
    fs.writeFileSync(
      path.join(pagesOut, `${safeId(page.id)}.html`),
      buildPageDocument(page, existingIds),
      'utf8'
    );
  }
  fs.writeFileSync(path.join(outDir, 'index.html'), buildIndexDocument(pages), 'utf8');
  fs.writeFileSync(path.join(outDir, 'style.css'), EXPORT_CSS, 'utf8');
  fs.writeFileSync(path.join(outDir, 'このフォルダについて.txt'), README_TEXT, 'utf8');

  const imagesOut = path.join(dataOut, 'images');
  const images = fs.existsSync(imagesOut) ? fs.readdirSync(imagesOut).length : 0;
  return { path: outDir, pages: pages.length, images };
}

/**
 * 本文HTMLを、書き出したフォルダの中で読める形に直す(純粋関数)。
 *   - memo://images/xxx  → ../data/images/xxx
 *   - ページ間リンク     → 書き出した <ID>.html へのリンク(消えたページへのリンクはそのまま)
 *   - 目次の項目         → 見出しへ飛ぶリンク
 *   - 編集用の属性(contenteditable)は取り除く
 *
 * @param {string} html 保存されている本文HTML
 * @param {Set<string>} existingIds 書き出すページのID
 */
function toExportHTML(html, existingIds) {
  let headingCount = 0;
  return rewriteImageUrls(String(html))
    .replace(/\scontenteditable="[^"]*"/g, '')
    .replace(/<a\b([^>]*?)\sdata-page-id="([^"]*)"([^>]*)>/g, (_m, before, id, after) => {
      const href = existingIds.has(id) ? ` href="${safeId(id)}.html"` : '';
      const rest = `${before}${after}`.replace(/\shref="[^"]*"/g, '');
      return `<a${rest} data-page-id="${id}"${href}>`;
    })
    // 見出しに通し番号のIDを振り直す(目次の行き先。アプリの toc.js と同じ数え方)
    .replace(/<h([2-4])\b([^>]*)>/g, (_m, level, attrs) => {
      headingCount += 1;
      return `<h${level}${attrs.replace(/\sid="[^"]*"/g, '')} id="sec-${headingCount}">`;
    })
    .replace(
      /<span class="toc-link" data-target="([^"]*)">([\s\S]*?)<\/span><\/li>/g,
      '<a class="toc-link" href="#$1">$2</a></li>'
    );
}

/** memo://images/xxx を、pages/ から見た相対パスに直す */
function rewriteImageUrls(text) {
  return text.replace(/memo:\/\/images\//g, '../data/images/');
}

/** 1ページ分のHTML文書を作る(純粋関数) */
function buildPageDocument(page, existingIds) {
  const cover = page.cover
    ? `<img class="cover" src="${escapeHTML(rewriteImageUrls(page.cover))}" alt="">`
    : '';
  const subtitle = page.subtitle ? `<p class="subtitle">${escapeHTML(page.subtitle)}</p>` : '';
  return documentShell(
    page.title,
    '../style.css',
    `<nav class="back"><a href="../index.html">← ページ一覧</a></nav>
${cover}
<header>
<h1>${escapeHTML(page.title)}</h1>
${subtitle}
<p class="updated">最終更新: ${escapeHTML(formatDate(page.updatedAt))}</p>
</header>
<article>
${toExportHTML(page.html || '', existingIds)}
</article>`
  );
}

/** ページ一覧のHTML文書を作る(純粋関数。タイトル順に並べる) */
function buildIndexDocument(pages) {
  const sorted = [...pages].sort((a, b) => a.title.localeCompare(b.title, 'ja'));
  const items = sorted
    .map((page) => {
      const subtitle = page.subtitle
        ? `<span class="subtitle">${escapeHTML(page.subtitle)}</span>`
        : '';
      return `<li><a href="pages/${safeId(page.id)}.html">${escapeHTML(page.title)}</a>${subtitle}</li>`;
    })
    .join('\n');
  return documentShell(
    'Memo Wiki',
    'style.css',
    `<header>
<h1>Memo Wiki</h1>
<p class="subtitle">${pages.length} ページ</p>
</header>
<ul class="page-index">
${items}
</ul>`
  );
}

/**
 * HTML文書の外枠。
 * 書き出したファイルは利用者が普通のブラウザで開くので、
 * スクリプトは一切動かないようにしておく(本文に何が入っていても安全側に倒す)。
 */
function documentShell(title, cssHref, body) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(title)}</title>
<link rel="stylesheet" href="${cssHref}">
</head>
<body>
${body}
</body>
</html>
`;
}

/** ページIDをファイル名に使える文字だけにする(storage.js の pageFile と同じ規則) */
function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '');
}

function escapeHTML(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** ISO日時を「2026-10-01 12:00」の形にする */
function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** フォルダ名に使う日時(2026-10-01-12-00-00) */
function stamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-` +
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

/** 同じ名前のフォルダがあれば -2, -3 … を付けて重ならない名前にする */
function uniqueDir(dir) {
  let candidate = dir;
  for (let n = 2; fs.existsSync(candidate); n++) candidate = `${dir}-${n}`;
  return candidate;
}

/** 書き出したページの見た目(アプリの本文の見た目に近づけてある) */
const EXPORT_CSS = `body {
  max-width: 860px;
  margin: 0 auto;
  padding: 0 24px 48px;
  font-family: "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif;
  color: #202122;
  line-height: 1.8;
}
a { color: #3366cc; }
header { border-bottom: 1px solid #d9d9e3; margin-bottom: 16px; }
h1 { margin: 16px 0 4px; font-size: 28px; }
.subtitle { margin: 0 0 4px; color: #666; }
.updated { margin: 0 0 8px; font-size: 12px; color: #888; }
.back { padding: 12px 0; font-size: 13px; }
.cover { width: 100%; height: 210px; object-fit: cover; display: block; border-radius: 6px; }
article img { max-width: 90%; border: 1px solid #d9d9e3; border-radius: 4px; display: block; margin: 8px 0; }
.page-index { padding-left: 20px; }
.page-index li { margin: 6px 0; }
.page-index .subtitle { margin-left: 10px; font-size: 13px; }
.toc-block { display: inline-block; min-width: 260px; margin: 12px 0; padding: 10px 18px 12px;
  border: 1px solid #a2a9b1; border-radius: 4px; background: #f8f9fa; }
.toc-title { font-weight: bold; text-align: center; margin-bottom: 6px; }
.toc-list { list-style: none; margin: 0; padding: 0; }
.toc-level-1 { padding-left: 18px; }
.toc-level-2 { padding-left: 36px; }
.toc-link { text-decoration: none; }
.toc-number { display: inline-block; min-width: 28px; margin-right: 6px; color: #202122; }
.link-card, .video-card { display: flex; gap: 12px; max-width: 560px; margin: 10px 0; padding: 10px 14px;
  border: 1px solid #d9d9e3; border-radius: 8px; text-decoration: none; color: #202122; background: #fbfbfd; }
.card-body, .video-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.card-title, .video-title { font-weight: bold; color: #3366cc; }
.card-desc { font-size: 13px; color: #555; }
.card-site, .video-site { font-size: 12px; color: #888; }
.card-thumb { width: 120px; height: 84px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }
.video-visual { position: relative; flex-shrink: 0; width: 200px; aspect-ratio: 16 / 9; border-radius: 6px;
  overflow: hidden; background: #1d1f23; display: flex; align-items: center; justify-content: center; }
.video-thumb { width: 100%; height: 100%; object-fit: cover; }
.video-play { position: absolute; width: 46px; height: 46px; border-radius: 50%; background: rgba(0, 0, 0, 0.55);
  color: #fff; line-height: 46px; text-align: center; }
.embed-wrapper { display: block; margin: 10px 0; max-width: 720px; }
.embed-wrapper iframe { width: 100%; height: 420px; border: 1px solid #d9d9e3; border-radius: 8px; }
.embed-open { font-size: 12px; color: #666; }
`;

const README_TEXT = `Memo Wiki の書き出し

■ 読む
  index.html をブラウザで開くと、ページの一覧が表示されます。
  ページ同士のリンクや目次は、そのままクリックで移動できます。

■ アプリに戻す(復元)
  1. Memo Wiki を終了します
  2. エクスプローラーのアドレス欄に %APPDATA%\\memo-wiki と入れて開きます
  3. 中の data フォルダを、この書き出しの data フォルダに置き換えます
     (今のメモは置き換えで消えるので、必要なら先に別の場所へコピーしてください)
  4. Memo Wiki を起動します
`;

module.exports = {
  exportAll,
  toExportHTML,
  buildPageDocument,
  buildIndexDocument,
};

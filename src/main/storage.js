/**
 * storage.js — ページと画像のファイル入出力
 *
 * 責務:
 *   - 保存先フォルダ(pages / images)の管理
 *   - ページのCRUD(1ページ = 1つのJSONファイル)
 *   - 画像ファイルの保存
 *   - 全文検索
 *
 * ページJSONの形式:
 *   {
 *     "formatVersion": 2,
 *     "id": "...", "title": "...",
 *     "subtitle": "...",           // タイトル下の1行見出し
 *     "cover": "memo://images/...", // ページ上部のトップ画像(空なら無し)
 *     "html": "...", "updatedAt": "ISO日時"
 *   }
 *
 * 本文はHTML文字列として保存する。画像は images/ に置き、
 * 本文からは "memo://images/<ファイル名>" で参照する
 * (絶対パスを埋め込まないので、データフォルダごと移動できる)。
 *
 * ── 形式バージョンと移行処理 ──
 * ファイル形式を将来変更しても旧バージョンで作ったページが
 * 読めなくならないよう、各ページに formatVersion を記録する。
 * 形式を変えるときの手順:
 *   1. FORMAT_VERSION を +1 する
 *   2. MIGRATIONS に「旧形式 → 新形式」の変換関数を1つ追加する
 * これだけで、旧形式のファイルは読み込み時に自動で変換される
 * (ディスク上のファイルは、ユーザーがそのページを保存したときに
 *  新形式で書き直される。読むだけなら元ファイルは変更しない)。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** 現在のページファイル形式バージョン */
const FORMAT_VERSION = 2;

/**
 * 移行関数の一覧。キーは「移行元のバージョン」。
 * 例: 形式3で tags 欄を追加する場合
 *   2: (page) => ({ ...page, tags: [] }),
 */
const MIGRATIONS = {
  // v1 → v2: トップ画像(cover)とサブタイトル(subtitle)を追加
  1: (page) => ({ ...page, cover: '', subtitle: '' }),
};

/**
 * ページを現在の形式に移行する(純粋関数・テスト可能)。
 * formatVersion の無い古いファイルはバージョン1として扱う。
 * 未知の将来バージョンはそのまま返す(壊さない)。
 */
function migratePage(page) {
  let current = { formatVersion: 1, ...page };
  while (current.formatVersion < FORMAT_VERSION) {
    const migrate = MIGRATIONS[current.formatVersion];
    if (!migrate) break; // 対応する移行関数が無ければ安全側でそのまま
    current = { ...migrate(current), formatVersion: current.formatVersion + 1 };
  }
  return current;
}

let pagesDir = '';
let imagesDir = '';

/** 保存先フォルダを準備する(userData/data 以下) */
function init(userDataPath) {
  const dataDir = path.join(userDataPath, 'data');
  pagesDir = path.join(dataDir, 'pages');
  imagesDir = path.join(dataDir, 'images');
  fs.mkdirSync(pagesDir, { recursive: true });
  fs.mkdirSync(imagesDir, { recursive: true });
}

/** 画像フォルダのパス(protocol.js が配信に使う) */
function getImagesDir() {
  return imagesDir;
}

/** ID からページJSONのファイルパスを得る(パス操作文字は除去) */
function pageFile(id) {
  const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(pagesDir, `${safeId}.json`);
}

/** 保存されている全ページを読み込む(移行済み・内部用) */
function readAllPages() {
  return fs
    .readdirSync(pagesDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => migratePage(JSON.parse(fs.readFileSync(path.join(pagesDir, name), 'utf8'))));
}

/** 全ページのメタ情報一覧(更新日時の新しい順) */
function listPages() {
  return readAllPages()
    .map((page) => ({
      id: page.id,
      title: page.title,
      subtitle: page.subtitle,
      cover: page.cover,
      updatedAt: page.updatedAt,
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** ページを1件読み込む(存在しなければ null。旧形式は自動移行) */
function loadPage(id) {
  const file = pageFile(id);
  if (!fs.existsSync(file)) return null;
  return migratePage(JSON.parse(fs.readFileSync(file, 'utf8')));
}

/**
 * ページを保存する。
 * id が null なら新規作成し、採番したIDを含むページを返す。
 *
 * fields には変更したい項目だけを渡せばよく、省略した項目は
 * 保存済みの値が引き継がれる(例: マップからタイトルだけ変更する場合)。
 * @param {string|null} id
 * @param {{title?: string, html?: string, subtitle?: string, cover?: string}} fields
 */
function savePage(id, fields = {}) {
  const existing = id ? loadPage(id) : null;
  const page = {
    formatVersion: FORMAT_VERSION,
    id: id || crypto.randomUUID(),
    title: pick(fields.title, existing?.title, '') || '無題のページ',
    subtitle: pick(fields.subtitle, existing?.subtitle, ''),
    cover: pick(fields.cover, existing?.cover, ''),
    html: pick(fields.html, existing?.html, ''),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(pageFile(page.id), JSON.stringify(page, null, 2), 'utf8');
  return page;
}

/** 最初に見つかった undefined/null でない値を返す */
function pick(...values) {
  return values.find((v) => v !== undefined && v !== null);
}

/** ページを削除する */
function deletePage(id) {
  const file = pageFile(id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

/** HTMLからタグを除いた素のテキストを取り出す(検索用) */
function htmlToText(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * タイトル・サブタイトル・本文を対象に検索する。
 * 戻り値: [{ id, title, snippet }]
 */
function searchPages(query) {
  const q = query.toLowerCase();
  const results = [];
  for (const page of readAllPages()) {
    const text = htmlToText(page.html);
    const inTitle =
      page.title.toLowerCase().includes(q) || (page.subtitle || '').toLowerCase().includes(q);
    const bodyIndex = text.toLowerCase().indexOf(q);
    if (!inTitle && bodyIndex === -1) continue;

    // ヒット位置の前後を切り出してスニペットにする
    let snippet = '';
    if (bodyIndex !== -1) {
      const start = Math.max(0, bodyIndex - 30);
      snippet = (start > 0 ? '…' : '') + text.slice(start, bodyIndex + q.length + 40) + '…';
    } else {
      snippet = text.slice(0, 70);
    }
    results.push({ id: page.id, title: page.title, snippet });
  }
  return results;
}

/**
 * 本文HTMLから内部リンクの参照先ページIDを取り出す(純粋関数)。
 * リンクは <a class="internal-link" data-page-id="ID"> の形で埋め込まれている。
 */
function extractLinkedIds(html) {
  const ids = new Set();
  for (const m of String(html).matchAll(/data-page-id\s*=\s*"([^"]+)"/g)) ids.add(m[1]);
  return [...ids];
}

/**
 * ページ同士の関連マップ用データを組み立てる。
 * 戻り値: {
 *   nodes: [{ id, title, subtitle, cover, degree }],
 *   edges: [{ from, to }]   // from のページが to のページへリンクしている
 * }
 * 削除済みページへのリンクは辺に含めない(存在するページ同士だけを結ぶ)。
 */
function buildGraph() {
  const pages = readAllPages();
  const existingIds = new Set(pages.map((p) => p.id));

  const edges = [];
  const degree = new Map(pages.map((p) => [p.id, 0])); // つながりの本数(node の大きさに使う)

  for (const page of pages) {
    for (const targetId of extractLinkedIds(page.html)) {
      if (!existingIds.has(targetId) || targetId === page.id) continue; // 自己リンクは除く
      edges.push({ from: page.id, to: targetId });
      degree.set(page.id, degree.get(page.id) + 1);
      degree.set(targetId, degree.get(targetId) + 1);
    }
  }

  const nodes = pages.map((p) => ({
    id: p.id,
    title: p.title,
    subtitle: p.subtitle || '',
    cover: p.cover || '',
    degree: degree.get(p.id) || 0,
  }));

  return { nodes, edges };
}

/**
 * 画像を保存する。
 * @param {Uint8Array} data 画像のバイナリ
 * @param {string} ext 拡張子("png" など)
 * @returns {string} 本文に埋め込むURL(memo://images/...)
 */
function saveImage(data, ext) {
  const safeExt = String(ext).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
  const name = `${crypto.randomUUID()}.${safeExt}`;
  fs.writeFileSync(path.join(imagesDir, name), Buffer.from(data));
  return `memo://images/${name}`;
}

module.exports = {
  init,
  getImagesDir,
  listPages,
  loadPage,
  savePage,
  deletePage,
  searchPages,
  saveImage,
  buildGraph,
  migratePage, // テスト用に公開
  extractLinkedIds, // テスト用に公開
};

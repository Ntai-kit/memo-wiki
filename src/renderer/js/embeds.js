/**
 * embeds.js — リンクカードとiframe埋め込みのHTML生成
 *
 * 責務:
 *   - メタデータからリンクカードのHTMLを組み立てる
 *   - URLを埋め込み用URLに変換し(YouTubeなど)、iframeのHTMLを組み立てる
 *
 * 「ダイアログでどう操作するか」は links.js、「どんなHTMLを
 * 挿入するか」はこのモジュール、と役割を分けている。
 *
 * カード・埋め込みは contenteditable="false" で包み、
 * 本文編集中に中身が崩れないひとかたまりとして扱う
 * (クリックで選択し、BackSpace/Deleteで丸ごと削除できる)。
 */
import { escapeHTML } from './editor.js';

/**
 * リンクカードのHTMLを作る。
 * @param {{url, title, description, image, siteName}} meta
 */
export function buildCardHTML(meta) {
  const title = escapeHTML(meta.title || meta.url);
  const desc = escapeHTML(truncate(meta.description || '', 90));
  const site = escapeHTML(meta.siteName || hostnameOf(meta.url));
  const url = escapeHTML(meta.url);
  const thumb = meta.image
    ? `<img class="card-thumb" src="${escapeHTML(meta.image)}" alt="">`
    : '';

  return (
    `<a class="link-card" href="${url}" contenteditable="false">` +
    `<span class="card-body">` +
    `<span class="card-title">${title}</span>` +
    (desc ? `<span class="card-desc">${desc}</span>` : '') +
    `<span class="card-site">${site}</span>` +
    `</span>` +
    thumb +
    `</a><p><br></p>` // カード直後に文を続けられるよう空行を足す
  );
}

/**
 * iframe埋め込みのHTMLを作る。
 * @param {string} url 埋め込みたいページのURL
 */
export function buildEmbedHTML(url) {
  const embedUrl = toEmbedUrl(url);
  const isVideo = isVideoUrl(embedUrl);

  // sandbox の扱いについて:
  //   知らないサイトを埋め込むときは sandbox で権限を絞る。
  //   一方、下の EMBED_RULES で変換できた「素性の分かっている動画サイト」は
  //   sandbox を付けない。制限された枠の中では再生を拒否する配信元があるためである
  //   (それでも CSP と allow 属性による制限は効いている)。
  const sandbox = isVideo
    ? ''
    : 'sandbox="allow-scripts allow-same-origin allow-presentation allow-popups ' +
      'allow-popups-to-escape-sandbox allow-forms" ';

  // 埋め込みが再生できない場合に備え、必ず「ブラウザで開く」を添える。
  // 配信元の都合(埋め込み禁止など)で表示できないことがあり、
  // そのときに手詰まりにならないようにするため。
  const openLink =
    `<a class="embed-open" href="${escapeHTML(toWatchUrl(url))}">ブラウザで開く</a>`;

  return (
    `<span class="embed-wrapper${isVideo ? ' video' : ''}" contenteditable="false">` +
    `<iframe src="${escapeHTML(embedUrl)}" ` +
    sandbox +
    `allow="fullscreen; autoplay; encrypted-media; picture-in-picture" ` +
    `referrerpolicy="strict-origin-when-cross-origin" ` +
    `loading="lazy"></iframe>` +
    openLink +
    `</span><p><br></p>`
  );
}

/**
 * 「ブラウザで開く」用に、人が見るページのURLへ戻す(純粋関数)。
 *
 * 埋め込み用URLをそのままブラウザで開くと、プレーヤーだけの素っ気ない画面になる。
 * 説明欄やコメントも見られる通常のページを開きたいので、戻せる場合は戻す。
 */
export function toWatchUrl(url) {
  const youtube = url.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/);
  if (youtube) return `https://www.youtube.com/watch?v=${youtube[1]}`;

  const vimeo = url.match(/player\.vimeo\.com\/video\/(\d+)/);
  if (vimeo) return `https://vimeo.com/${vimeo[1]}`;

  const nico = url.match(/embed\.nicovideo\.jp\/watch\/([\w]+)/);
  if (nico) return `https://www.nicovideo.jp/watch/${nico[1]}`;

  return url;
}

/** 動画サイトの埋め込みURLかどうか(見た目を16:9にするかの判定に使う) */
function isVideoUrl(embedUrl) {
  return /(?:youtube(?:-nocookie)?\.com\/embed\/|player\.vimeo\.com\/|embed\.nicovideo\.jp\/)/.test(
    embedUrl
  );
}

/**
 * 入力から埋め込み用のURLを取り出す(純粋関数)。
 *
 * 次のどれを貼っても使えるようにするためのもの:
 *   - 動画ページのURL          https://www.youtube.com/watch?v=XXXX
 *   - 埋め込み用のURL          https://www.youtube.com/embed/XXXX
 *   - サイトが配る埋め込みコード <iframe src="https://..." ...></iframe>
 *
 * YouTubeの「共有 → 埋め込む」で得られるコードをそのまま貼れる。
 *
 * @param {string} input 貼り付けられた文字列
 * @returns {string} 取り出したURL(見つからなければ入力をそのまま返す)
 */
export function extractUrl(input) {
  const text = String(input).trim();

  // <iframe src="..."> の形なら src を取り出す
  const iframeSrc = text.match(/<iframe[^>]*\ssrc\s*=\s*("([^"]+)"|'([^']+)')/i);
  if (iframeSrc) return (iframeSrc[2] ?? iframeSrc[3]).trim();

  // それ以外にHTMLが混ざっている場合は、最初のURLを拾う
  if (text.includes('<')) {
    const anyUrl = text.match(/https?:\/\/[^\s"'<>]+/);
    if (anyUrl) return anyUrl[0];
  }

  return text;
}

/**
 * 主要サイトのURLを埋め込み用URLに変換する。
 * 対応外のURLはそのまま返す(サイト側が許可していればiframeで表示される)。
 *
 * 新しいサイトに対応するには、この配列にルールを1つ足せばよい。
 */
const EMBED_RULES = [
  {
    // YouTube: watch?v=ID / youtu.be/ID / shorts/ID / embed/ID
    //
    // 動画ページのURLを貼られたときは、こちらで埋め込み用URLに組み立てる。
    // ただし配信元が出した埋め込みURLをそのまま貼るのが最も確実なので、
    // 使い方ガイドではそちらを案内している。
    pattern: /(?:youtube\.com\/(?:watch\?.*?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/,
    toUrl: (m) => `https://www.youtube.com/embed/${m[1]}`,
  },
  {
    // Vimeo: vimeo.com/12345
    pattern: /vimeo\.com\/(\d+)/,
    toUrl: (m) => `https://player.vimeo.com/video/${m[1]}`,
  },
  {
    // ニコニコ動画: nicovideo.jp/watch/sm12345
    pattern: /nicovideo\.jp\/watch\/((?:sm|nm|so)?\d+)/,
    toUrl: (m) => `https://embed.nicovideo.jp/watch/${m[1]}`,
  },
  {
    // Google マップ: 共有URLをそのまま埋め込み表示に
    pattern: /google\.[^/]+\/maps/,
    toUrl: (_m, url) => url.includes('output=embed') ? url : `${url}${url.includes('?') ? '&' : '?'}output=embed`,
  },
];

export function toEmbedUrl(url) {
  // すでに埋め込み用のURLなら、そのまま使う。
  // 「共有 → 埋め込む」で得たURLには配信元が付けたパラメータが含まれており、
  // こちらで組み立て直すとそれを落としてしまうため。
  if (isVideoUrl(url)) return url;

  for (const rule of EMBED_RULES) {
    const m = url.match(rule.pattern);
    if (m) return rule.toUrl(m, url);
  }
  return url;
}

/** 文字数で切り詰めて「…」を付ける */
function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** URLからホスト名(失敗したら空文字) */
function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

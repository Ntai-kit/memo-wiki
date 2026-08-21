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
  const isVideo = embedUrl !== url; // 変換されたら動画サイトとみなす

  // referrerpolicy と sandbox の指定について:
  //   このアプリの画面はファイルとして読み込まれるため、
  //   何も指定しないと「どこから埋め込まれたか」の情報が相手に届かず、
  //   YouTube が「動画プレーヤーの設定エラー(エラー153)」を出すことがある。
  //   strict-origin-when-cross-origin を指定して必要な情報だけを渡す。
  //   sandbox は、動画の再生に必要な最小限の許可だけを与えている。
  return (
    `<span class="embed-wrapper${isVideo ? ' video' : ''}" contenteditable="false">` +
    `<iframe src="${escapeHTML(embedUrl)}" ` +
    `sandbox="allow-scripts allow-same-origin allow-presentation allow-popups ` +
    `allow-popups-to-escape-sandbox allow-forms" ` +
    `allow="fullscreen; autoplay; encrypted-media; picture-in-picture" ` +
    `referrerpolicy="strict-origin-when-cross-origin" ` +
    `loading="lazy"></iframe>` +
    `</span><p><br></p>`
  );
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
    // 通常の youtube.com ではなく youtube-nocookie.com を使う。
    // 埋め込み時の制限が緩く、「動画プレーヤーの設定エラー」が起きにくい。
    // (加えて、視聴履歴に基づく追跡も行われない)
    pattern: /(?:youtube\.com\/(?:watch\?.*?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/,
    toUrl: (m) => `https://www.youtube-nocookie.com/embed/${m[1]}`,
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

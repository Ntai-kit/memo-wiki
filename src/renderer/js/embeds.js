/**
 * embeds.js — リンクカード・動画カード・iframe埋め込みのHTML生成
 *
 * 責務:
 *   - メタデータからリンクカードのHTMLを組み立てる
 *   - 動画のURLから「動画カード」のHTMLを組み立てる
 *   - 動画以外のページを埋め込む iframe のHTMLを組み立てる
 *
 * 「ダイアログでどう操作するか」は links.js、「どんなHTMLを
 * 挿入するか」はこのモジュール、と役割を分けている。
 *
 * カード類は contenteditable="false" で包み、
 * 本文編集中に中身が崩れないひとかたまりとして扱う
 * (クリックで選択し、BackSpace/Deleteで丸ごと削除できる)。
 *
 * ── 動画をiframeで埋め込まない理由 ──
 * YouTubeは「どのサイトから埋め込まれたか(オリジン)」を見て再生の可否を決める。
 * パソコンの中で動くアプリの画面には、相手が認める正当なオリジンが存在しないため、
 * 何をしても「動画プレーヤーの設定エラー(エラー153)」になる。
 * 実在サイトを騙るような回避策は行わない方針なので、
 * 動画は「サムネイル + ▶ の動画カード」で見せ、クリックでブラウザに渡す。
 * サムネイルは取得時にこちらへ保存するので、あとから見るときに通信は発生しない。
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
 * 動画カードのHTMLを作る。
 *
 * 動画はメモの中で再生できないため(上のコメント参照)、
 * サムネイルと▶マークで「これは動画だ」と分かる見た目にして、
 * クリックしたらブラウザで開く形にしている。
 *
 * @param {{url: string, title?: string, siteName?: string, thumb?: string}} video
 *        thumb はこちらに保存済みの画像URL(memo://…)。無ければ▶だけを出す。
 */
export function buildVideoCardHTML(video) {
  const watchUrl = toWatchUrl(video.url);
  const title = escapeHTML(video.title || watchUrl);
  const site = escapeHTML(video.siteName || hostnameOf(watchUrl));
  const thumb = video.thumb
    ? `<img class="video-thumb" src="${escapeHTML(video.thumb)}" alt="">`
    : '';

  return (
    `<a class="video-card" href="${escapeHTML(watchUrl)}" contenteditable="false">` +
    `<span class="video-visual">${thumb}<span class="video-play" aria-hidden="true">▶</span></span>` +
    `<span class="video-body">` +
    `<span class="video-title">${title}</span>` +
    `<span class="video-site">${site} · クリックでブラウザ再生</span>` +
    `</span>` +
    `</a><p><br></p>` // カード直後に文を続けられるよう空行を足す
  );
}

/**
 * iframe埋め込みのHTMLを作る(動画以外のページ用)。
 *
 * 動画サイトのURLがここへ来ることは無い(links.js が動画カードへ振り分ける)。
 * 素性の分からないページを埋め込むので sandbox で権限を絞る。
 *
 * @param {string} url 埋め込みたいページのURL
 */
export function buildEmbedHTML(url) {
  const embedUrl = toEmbedUrl(url);

  // 埋め込みが表示できない場合に備え、必ず「ブラウザで開く」を添える。
  // 相手の都合(埋め込み禁止など)で真っ白になることがあり、
  // そのときに手詰まりにならないようにするため。
  const openLink =
    `<a class="embed-open" href="${escapeHTML(url)}">ブラウザで開く</a>`;

  return (
    `<span class="embed-wrapper" contenteditable="false">` +
    `<iframe src="${escapeHTML(embedUrl)}" ` +
    `sandbox="allow-scripts allow-same-origin allow-popups ` +
    `allow-popups-to-escape-sandbox allow-forms" ` +
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
  const id = youtubeIdOf(url);
  if (id) return `https://www.youtube.com/watch?v=${id}`;

  const vimeo = url.match(/player\.vimeo\.com\/video\/(\d+)/);
  if (vimeo) return `https://vimeo.com/${vimeo[1]}`;

  const nico = url.match(/embed\.nicovideo\.jp\/watch\/(\w+)/);
  if (nico) return `https://www.nicovideo.jp/watch/${nico[1]}`;

  return url;
}

/**
 * YouTubeのURLから動画IDを取り出す(純粋関数)。
 * watch?v= / youtu.be/ / shorts/ / embed/ / live/ のどれでも取れる。
 * YouTube以外のURLなら空文字を返す。
 */
export function youtubeIdOf(url) {
  const m = String(url).match(
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/
  );
  return m ? m[1] : '';
}

/**
 * 動画のサムネイル画像URLを推測する(純粋関数)。
 *
 * ページ情報(OGP)からサムネイルが取れなかったときの控えとして使う。
 * YouTubeはIDから画像URLを組み立てられる。それ以外は空文字。
 */
export function guessThumbUrl(url) {
  const id = youtubeIdOf(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
}

/**
 * 動画のURLかどうか(純粋関数)。
 * 動画ページのURLでも、埋め込み用のURLでも true になる。
 * これが true のものは iframe ではなく動画カードとして扱う。
 */
export function isVideoUrl(url) {
  return VIDEO_PATTERNS.some((pattern) => pattern.test(url));
}

/** 動画として扱うURLのパターン。対応サイトを増やすならここに1つ足す */
const VIDEO_PATTERNS = [
  /youtube(?:-nocookie)?\.com\/(?:watch\?|shorts\/|embed\/|live\/)/,
  /youtu\.be\//,
  /(?:^|\/\/)(?:www\.)?vimeo\.com\/\d/,
  /player\.vimeo\.com\/video\//,
  /nicovideo\.jp\/watch\//,
  /embed\.nicovideo\.jp\/watch\//,
];

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
 * 埋め込み表示のためにURLを整えるルール(動画以外のページ用)。
 * 対応外のURLはそのまま返す(サイト側が許可していればiframeで表示される)。
 *
 * 新しいサイトに対応するには、この配列にルールを1つ足せばよい。
 */
const EMBED_RULES = [
  {
    // Google マップ: 共有URLをそのまま埋め込み表示に
    pattern: /google\.[^/]+\/maps/,
    toUrl: (_m, url) =>
      url.includes('output=embed') ? url : `${url}${url.includes('?') ? '&' : '?'}output=embed`,
  },
];

export function toEmbedUrl(url) {
  for (const rule of EMBED_RULES) {
    const m = url.match(rule.pattern);
    if (m) return rule.toUrl(m, url);
  }
  return url;
}

/**
 * かたまりのHTMLから、末尾の空段落を取り除く(純粋関数)。
 *
 * カード類のHTMLは末尾に空段落を付けてある(直後に文章を書けるようにするため)が、
 * 既にあるかたまりを「置き換える」ときは、その後ろに既に段落があるので不要になる。
 * 付けたままだと差し替えのたびに空行が増えていく。
 */
export function withoutTrailingParagraph(html) {
  return html.replace(/<p><br><\/p>$/, '');
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

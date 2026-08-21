/**
 * metadata.js — WebページのOGPメタデータ取得
 *
 * 責務:
 *   - URL先のHTMLを取得し、リンクカード表示に必要な情報
 *     (タイトル・説明・サムネイル画像・サイト名)を抜き出す
 *
 * 取得優先順位: OGPタグ(og:*) → 通常のmetaタグ → <title>。
 * どれも取れなければURL自身をタイトルとして返す(カードは常に作れる)。
 *
 * サムネイル画像そのものを取ってくる fetchImage も持つ。
 * 画像をこちらで保存してしまえば、あとから見るときに
 * 相手のサーバーへ通信しない(オフラインでも見られる・見た記録も残らない)。
 *
 * parseMetadata は純粋関数として分離してあり、単体テストできる。
 */

const FETCH_TIMEOUT_MS = 10000;
const MAX_HTML_BYTES = 512 * 1024; // 先頭512KBだけ読めばmetaタグには十分

/**
 * URLからメタデータを取得する。
 * @returns {Promise<{url, title, description, image, siteName}>}
 *          失敗してもrejectせず、URLだけ入った結果を返す。
 */
async function fetchMetadata(url) {
  const fallback = { url, title: url, description: '', image: '', siteName: hostnameOf(url) };
  if (!/^https?:\/\//.test(url)) return fallback;

  try {
    // electronのrequireは関数内で行う(parseMetadataを素のNodeでテストするため)
    const { net } = require('electron');
    const res = await net.fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'Mozilla/5.0 (MemoWiki link preview)' },
    });
    if (!res.ok) return fallback;
    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    return { ...fallback, ...parseMetadata(html, res.url || url) };
  } catch {
    return fallback; // ネットワークエラー等はフォールバックで返す
  }
}

/**
 * HTML文字列からメタデータを取り出す(純粋関数)。
 * @param {string} html ページのHTML
 * @param {string} baseUrl 相対URL(og:imageなど)の解決に使う
 */
function parseMetadata(html, baseUrl) {
  const meta = collectMetaTags(html);
  const result = {};

  const title = meta['og:title'] || meta['twitter:title'] || textOfTitleTag(html);
  if (title) result.title = title;

  const description = meta['og:description'] || meta['description'] || '';
  if (description) result.description = description;

  const image = meta['og:image'] || meta['twitter:image'] || '';
  if (image) result.image = resolveUrl(image, baseUrl);

  const siteName = meta['og:site_name'] || '';
  if (siteName) result.siteName = siteName;

  return result;
}

/** <meta>タグを走査して {property/name: content} のマップを作る */
function collectMetaTags(html) {
  const map = {};
  for (const tag of html.match(/<meta\s[^>]*>/gi) || []) {
    const key = attrOf(tag, 'property') || attrOf(tag, 'name');
    const content = attrOf(tag, 'content');
    if (key && content && !(key in map)) map[key.toLowerCase()] = decodeEntities(content);
  }
  return map;
}

/** タグ文字列から属性値を取り出す(引用符の種類に依らない) */
function attrOf(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? m[2] ?? m[3] : '';
}

/** <title>タグの中身 */
function textOfTitleTag(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? decodeEntities(m[1].trim()) : '';
}

/** 相対URLを絶対URLにする */
function resolveUrl(url, base) {
  try {
    return new URL(url, base).toString();
  } catch {
    return '';
  }
}

/** URLからホスト名を取り出す(サイト名のフォールバック) */
function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** 最低限のHTMLエンティティ復号 */
function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'");
}

/** 画像として受け付けるMIMEタイプと、対応する拡張子 */
const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** 画像1枚の上限(サムネイルなのでこれで十分) */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * 画像URLから画像そのものを取得する。
 * @returns {Promise<{data: Buffer, ext: string} | null>} 取れなければ null
 */
async function fetchImage(url) {
  if (!/^https?:\/\//.test(url)) return null;
  try {
    const { net } = require('electron');
    const res = await net.fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'Mozilla/5.0 (MemoWiki link preview)' },
    });
    if (!res.ok) return null;

    const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const ext = IMAGE_TYPES[type];
    if (!ext) return null; // 画像以外は受け取らない

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return null;
    return { data: buffer, ext };
  } catch {
    return null;
  }
}

module.exports = { fetchMetadata, parseMetadata, fetchImage };

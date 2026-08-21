/**
 * sanitize.js — 外部から入ってくるHTMLの浄化
 *
 * 責務:
 *   - WebページからコピーしてきたHTMLから、危険な要素・属性を取り除く
 *
 * なぜ必要か:
 *   本文はHTMLとして保存・表示されるため、Webページからそのまま貼り付けると
 *   <script> や onclick= のような実行される仕掛けまで混ざり込みうる。
 *   「許可したものだけ残す」方式(許可リスト)で、知らない要素は落とす。
 *   知らないものを通さないので、新しい攻撃手法にも自動的に強い。
 *
 * 方針:
 *   - DROP_TAGS      : 中身ごと削除する(実行される可能性があるもの)
 *   - iframe         : このアプリが作った埋め込み(https)だけを、属性を作り直して残す
 *   - ALLOWED_TAGS   : そのまま残す(文章の構造と装飾)
 *   - それ以外       : タグだけ外して中の文字は残す(情報を失わないため)
 *   - 属性           : 許可した属性のみ残し、URLはスキームを検査する
 */

/** 中身ごと削除するタグ(スクリプトの実行や外部読み込みにつながるもの) */
const DROP_TAGS = new Set([
  'script', 'style', 'object', 'embed', 'link', 'meta',
  'form', 'input', 'button', 'select', 'textarea', 'svg', 'math',
  'noscript', 'template', 'base', 'frame', 'frameset', 'applet',
]);

/** そのまま残すタグ */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'div', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup', 'mark', 'small',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'a', 'img', 'iframe',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
]);

/** タグごとに残してよい属性 */
const ALLOWED_ATTRS = {
  a: ['href', 'class', 'data-page-id'],
  img: ['src', 'alt'],
  // iframe の属性はここでは絞らず、下の rebuildIframe で作り直す
  iframe: [],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
};

/** どのタグでも残してよい属性 */
const COMMON_ATTRS = ['class'];

/**
 * class に残してよい値。
 * このアプリ自身が使うもの(ページ間コピーで見た目を保つため)だけを許可し、
 * 外部サイトのclassは落として本文の見た目が崩れるのを防ぐ。
 */
const ALLOWED_CLASSES = new Set([
  'internal-link', 'external-link',
  'link-card', 'card-body', 'card-title', 'card-desc', 'card-site', 'card-thumb',
  'embed-wrapper', 'video', 'embed-open',
  'toc-block', 'toc-title', 'toc-list', 'toc-item', 'toc-link', 'toc-number', 'toc-empty',
  'toc-level-0', 'toc-level-1', 'toc-level-2',
]);

/** 属性値として許可するURLのスキーム */
const SAFE_URL = /^(https?:\/\/|memo:\/\/|data:image\/)/i;

/**
 * HTML文字列を浄化して返す(純粋関数)。
 * @param {string} html 貼り付けられたHTML
 * @returns {string} 安全な要素だけになったHTML
 */
export function sanitizeHTML(html) {
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  cleanChildren(doc.body);
  restoreBlocks(doc.body);
  return doc.body.innerHTML;
}

/**
 * カード・埋め込み・目次を「ひとかたまり」に戻す。
 *
 * contenteditable は外部サイトから持ち込ませたくないので属性としては許可せず、
 * 浄化が済んだあとにこちらから付け直す。
 * これを忘れると、貼り付けたカードの中に文字を打ててしまい、見た目が壊れる。
 */
function restoreBlocks(root) {
  for (const block of root.querySelectorAll('.link-card, .embed-wrapper, .toc-block')) {
    block.setAttribute('contenteditable', 'false');
  }
}

/** 要素の子を順に検査する(再帰) */
function cleanChildren(parent) {
  for (const element of [...parent.children]) {
    const tag = element.tagName.toLowerCase();

    if (DROP_TAGS.has(tag)) {
      element.remove(); // 中身ごと捨てる
      continue;
    }

    cleanChildren(element); // 先に中身を掃除する

    if (!ALLOWED_TAGS.has(tag)) {
      unwrap(element); // タグだけ外して文字は残す
      continue;
    }

    if (tag === 'iframe') {
      rebuildIframe(element); // 埋め込みは属性を作り直す(残せない場合は削除)
      continue;
    }

    cleanAttributes(element, tag);
  }
}

/**
 * 埋め込み(iframe)の属性を作り直す。
 *
 * メモ同士で埋め込みをコピーしたときに消えてしまわないよう残すが、
 * 貼り付けられたものをそのまま信用はしない。
 * https のURLだけを受け付け、属性はこのアプリが自分で作るときと
 * 同じものだけを付け直す(元の属性はすべて捨てる)。
 */
function rebuildIframe(element) {
  const src = (element.getAttribute('src') || '').trim();
  if (!/^https:\/\//i.test(src)) {
    element.remove(); // https 以外は残さない
    return;
  }
  for (const attr of [...element.attributes]) element.removeAttribute(attr.name);
  element.setAttribute('src', src);
  element.setAttribute('allow', 'fullscreen; autoplay; encrypted-media; picture-in-picture');
  element.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  element.setAttribute('loading', 'lazy');
}

/** 許可されていない属性を取り除く */
function cleanAttributes(element, tag) {
  const allowed = [...(ALLOWED_ATTRS[tag] || []), ...COMMON_ATTRS];

  for (const attr of [...element.attributes]) {
    const name = attr.name.toLowerCase();

    // on〜(onclick など)は必ず削除する
    if (!allowed.includes(name) || name.startsWith('on')) {
      element.removeAttribute(attr.name);
      continue;
    }
    // URLはスキームを検査する(javascript: などを弾く)
    if ((name === 'href' || name === 'src') && !SAFE_URL.test(attr.value.trim())) {
      element.removeAttribute(attr.name);
    }
  }

  // classは自前のものだけ残す
  if (element.hasAttribute('class')) {
    const kept = [...element.classList].filter((c) => ALLOWED_CLASSES.has(c));
    if (kept.length) element.setAttribute('class', kept.join(' '));
    else element.removeAttribute('class');
  }
}

/** 要素を外して、中の要素・文字だけを残す */
function unwrap(element) {
  const parent = element.parentNode;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  element.remove();
}

/**
 * embed-compat.js — 埋め込み動画を再生できるようにするための調整
 *
 * 背景:
 *   このアプリの画面はローカルのファイルとして読み込まれる。
 *   その状態で動画を埋め込むと「どのページから埋め込まれたか」(参照元)が
 *   相手のサイトにまったく届かない。
 *   YouTube は参照元を見て埋め込みの可否を判断するため、
 *   情報が無いと「動画プレーヤーの設定エラー(エラー153)」になり再生できない。
 *
 *   画面側の referrerpolicy 属性では解決しない。
 *   ファイル由来のページは、どんな指定をしても参照元を送らない仕組みだからである。
 *
 * 対策:
 *   動画配信元への通信に限って、参照元を補ってから送る。
 *   対象は下の EMBED_URL_PATTERNS に挙げたホストだけで、
 *   ほかの通信には一切手を加えない。
 */

/** 参照元を補う対象(YouTubeの再生に必要なホスト群) */
const EMBED_URL_PATTERNS = [
  'https://*.youtube.com/*',
  'https://*.youtube-nocookie.com/*',
  'https://*.ytimg.com/*',
  'https://*.googlevideo.com/*',
];

/** 補う参照元 */
const REFERER = 'https://www.youtube.com/';

/**
 * セッションに設定を適用する。ウィンドウ生成時に1回呼ぶ。
 * @param {Electron.Session} session
 */
function apply(session) {
  session.webRequest.onBeforeSendHeaders(
    { urls: EMBED_URL_PATTERNS },
    (details, callback) => {
      const headers = { ...details.requestHeaders };

      // すでに参照元が付いている通信には手を加えない
      if (!headers.Referer && !headers.referer) {
        headers.Referer = REFERER;
      }
      callback({ requestHeaders: headers });
    }
  );
}

module.exports = { apply, EMBED_URL_PATTERNS, REFERER };

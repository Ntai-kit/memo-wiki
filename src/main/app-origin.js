/**
 * app-origin.js — アプリの画面に正規のオリジンを与える
 *
 * 何のためか:
 *   画面をローカルのファイル(file://)として読み込むと、
 *   「どのサイトから来た通信か」という身元が存在しない状態になる。
 *   YouTube は埋め込みの可否をその身元で判断するため、
 *   身元不明のままだと再生を拒否される(エラー153)。
 *
 * どうするか:
 *   https の通信を横取りし、このアプリ専用のホスト名
 *   (APP_HOST)宛てだったら画面のファイルを返す。
 *   こうすると画面のオリジンが https://<APP_HOST> となり、
 *   YouTube から見て正規の身元を持つページとして扱われる。
 *
 *   APP_HOST はアプリの識別子をそのままホスト名にしたもので、
 *   実在のサイトを騙るものではない(名前を借りて偽装するのは行わない)。
 *   横取りするのはこのホスト名宛てだけで、
 *   それ以外の通信はそのまま本来の宛先へ素通しする。
 *
 * 注意:
 *   素通しの処理を誤ると、アプリのすべての通信が壊れる。
 *   変更する場合は必ず動作確認すること。
 */
const { protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

/** このアプリの画面に与えるホスト名(アプリ識別子をそのまま使う) */
const APP_HOST = 'com.nez.memowiki';

/** 画面の入口 */
const APP_URL = `https://${APP_HOST}/index.html`;

/** 画面のファイルが置いてあるフォルダ */
const RENDERER_DIR = path.join(__dirname, '..', 'renderer');

/**
 * https の横取りを登録する。app.whenReady のあとに1回呼ぶ。
 */
function register() {
  protocol.handle('https', (request) => {
    const url = new URL(request.url);

    // このアプリ宛て以外は、本来の宛先へそのまま流す。
    // bypassCustomProtocolHandlers を付けないと、
    // 自分の横取りに再び捕まって無限に繰り返してしまう。
    if (url.hostname !== APP_HOST) {
      return net.fetch(request, { bypassCustomProtocolHandlers: true });
    }

    const file = resolveLocalFile(url.pathname);
    if (!file) return new Response('Not Found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

/**
 * URLのパスを、画面フォルダ内の実ファイルに対応づける。
 * フォルダの外を指すパスは受け付けない。
 */
function resolveLocalFile(pathname) {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
  const target = path.resolve(RENDERER_DIR, relative);

  // 画面フォルダの外に出ていないか確認する
  const root = path.resolve(RENDERER_DIR);
  if (target !== root && !target.startsWith(root + path.sep)) return null;

  return fs.existsSync(target) && fs.statSync(target).isFile() ? target : null;
}

module.exports = { register, APP_HOST, APP_URL, resolveLocalFile };

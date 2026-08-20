/**
 * protocol.js — "memo://" カスタムスキーム
 *
 * 責務:
 *   - 本文中の画像URL "memo://images/<ファイル名>" を
 *     実際の画像ファイルに解決して配信する
 *
 * 本文に絶対パスを書かずに済むため、データフォルダを
 * 移動・バックアップしてもリンク切れしない。
 */
const { protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

/** スキームの事前登録(app.ready の前に呼ぶこと) */
function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'memo',
      privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true },
    },
  ]);
}

/** memo://images/<name> → images フォルダ内のファイル を配信 */
function registerHandler(storage) {
  protocol.handle('memo', (request) => {
    const url = new URL(request.url);
    // URL例: memo://images/xxxx.png → hostname="images", pathname="/xxxx.png"
    const name = path.basename(decodeURIComponent(url.pathname)); // フォルダ外参照を防ぐ
    if (url.hostname !== 'images' || !name) {
      return new Response('Not Found', { status: 404 });
    }
    const file = path.join(storage.getImagesDir(), name);
    return net.fetch(pathToFileURL(file).toString());
  });
}

module.exports = { registerScheme, registerHandler };

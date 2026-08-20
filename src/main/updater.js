/**
 * updater.js — 自動アップデート(GitHub Releases経由)
 *
 * 責務:
 *   - 新しいバージョンが公開されていないか確認する
 *   - 見つかったら裏でダウンロードし、準備ができたら画面に知らせる
 *   - ユーザーが「再起動して更新」を押したらインストールして再起動する
 *
 * 更新ファイルの置き場所は package.json の build.publish で指定する。
 * ビルド時に electron-builder が app-update.yml を埋め込むので、
 * このモジュール側で置き場所を書く必要はない。
 *
 * 開発中(npm start)は更新の仕組みが無効になる。
 * ビルドした実行ファイルからの起動時だけ動作する。
 */
const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

/** 起動後に最初の確認をするまでの待ち時間(起動直後の重い処理を避ける) */
const FIRST_CHECK_DELAY_MS = 5000;
/** 2回目以降の確認間隔(6時間) */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let mainWindow = null;

/**
 * 初期化。アプリ起動後にウィンドウを渡して1回だけ呼ぶ。
 * @param {BrowserWindow} win 状況を表示するウィンドウ
 */
function init(win) {
  mainWindow = win;

  // 見つかったら自動でダウンロードし、終了時に自動で適用する。
  // (ユーザーが「今すぐ再起動」を押せば、待たずに適用できる)
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => notify({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => notify({ state: 'none' }));
  autoUpdater.on('update-available', (info) =>
    notify({ state: 'available', version: info.version })
  );
  autoUpdater.on('download-progress', (progress) =>
    notify({ state: 'progress', percent: Math.round(progress.percent) })
  );
  autoUpdater.on('update-downloaded', (info) =>
    notify({ state: 'ready', version: info.version })
  );
  autoUpdater.on('error', (error) => notify({ state: 'error', message: String(error) }));

  // 起動直後に1回、その後は一定間隔で確認する
  setTimeout(check, FIRST_CHECK_DELAY_MS);
  setInterval(check, CHECK_INTERVAL_MS);
}

/**
 * 更新を確認する。
 * 開発中は app-update.yml が無く必ず失敗するので、何もしない。
 */
async function check() {
  if (!app.isPackaged) {
    notify({ state: 'disabled' });
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    // ネットワークが繋がらない等。次回の確認に任せればよいので落とさない
    notify({ state: 'error', message: String(error) });
  }
}

/** ダウンロード済みの更新を適用してアプリを再起動する */
function install() {
  if (!app.isPackaged) return;
  autoUpdater.quitAndInstall();
}

/** 画面側に更新の状況を伝える */
function notify(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:status', status);
  }
}

module.exports = { init, check, install };

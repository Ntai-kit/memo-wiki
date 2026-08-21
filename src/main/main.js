/**
 * main.js — アプリのエントリポイント
 *
 * 責務:
 *   - アプリの起動とウィンドウの生成
 *   - 各モジュール(storage / ipc / protocol)の初期化
 *
 * 機能そのものの実装は storage.js(ファイル入出力)と
 * ipc.js(レンダラーとの通信)に分割してある。
 */
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

const storage = require('./storage');
const ipc = require('./ipc');
const protocol = require('./protocol');
const backup = require('./backup');
const updater = require('./updater');
const whatsnew = require('./whatsnew');
const appOrigin = require('./app-origin');

/** メインウィンドウを生成する(生成したウィンドウを返す) */
function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true, // 画面側のJSとpreloadを分離する
      nodeIntegration: false, // 画面側からNode.jsを使えなくする
      sandbox: true, // 画面側のプロセスをOSレベルで隔離する
    },
  });

  hardenWindow(win);
  // ファイルとしてではなく、アプリ専用のオリジンから読み込む。
  // こうしないと埋め込み動画が「身元不明」として再生を拒否される
  win.loadURL(appOrigin.APP_URL);
  return win;
}

/**
 * ウィンドウの防御を固める。
 *
 * このアプリは本文にWebページの埋め込み(iframe)やリンクを持てるため、
 * 万一不正なページを読み込んでも被害が出ないよう、
 * 「アプリの画面が別のページに化ける」経路をすべて塞いでおく。
 */
function hardenWindow(win) {
  // 1. アプリ画面そのものが外部ページへ遷移するのを禁止する
  //    (画面が乗っ取られると preload 経由でファイル操作される恐れがあるため)
  //    自分のオリジン内への移動だけを許す
  win.webContents.on('will-navigate', (event, url) => {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(url).hostname === appOrigin.APP_HOST;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) event.preventDefault();
  });

  // 2. 新しいウィンドウ(target=_blank など)はアプリ内で開かせず、
  //    http(s) のときだけ既定ブラウザに渡す
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // 3. <webview> の埋め込みを禁止する(iframeより権限が強いため)
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());

  // 4. 権限要求(カメラ・マイク・位置情報など)はすべて拒否する。
  //    メモアプリに必要な権限は無い
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });

  // 5. 不具合を調べるときのために、開発者ツールだけ開けるようにしておく
  //    (メニューバーを消してあるため、代わりのキー操作を用意する)
  win.webContents.on('before-input-event', (_event, input) => {
    const isToggleDevTools =
      input.control && input.shift && String(input.key).toLowerCase() === 'i';
    if (isToggleDevTools) win.webContents.toggleDevTools();
  });
}

// データ保存先を「%APPDATA%/memo-wiki」に固定する。
// (npm start での開発時と、ビルドした実行ファイルとで
//  保存先がずれてメモが見えなくなるのを防ぐ)
app.setPath('userData', path.join(app.getPath('appData'), 'memo-wiki'));

// "memo://" スキームの事前登録(app.ready より前に必要)
protocol.registerScheme();

// 既定のメニューバー(File / Edit / View / Window / Help)を消す。
// このアプリの操作はすべて画面内のボタンで行うため不要である。
Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  // 「前回のバージョン」を先に読み取る
  // (backup がその記録を書き換える前に読む必要がある)
  whatsnew.init(app.getPath('userData'));

  // アップデート後の初回起動ならデータを丸ごとバックアップする
  backup.runIfVersionChanged(app.getPath('userData'), app.getVersion());

  storage.init(app.getPath('userData')); // 保存先フォルダの準備
  protocol.registerHandler(storage);     // memo:// で画像を配信
  appOrigin.register();                  // 画面に正規のオリジンを与える
  ipc.register(storage, updater, whatsnew); // IPCハンドラの登録
  updater.init(createWindow());          // ウィンドウ生成 + 自動アップデート開始

  // macOS: Dockクリックでウィンドウを再生成
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// macOS以外: 全ウィンドウが閉じたら終了
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

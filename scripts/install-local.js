/**
 * install-local.js — 手元で作ったインストーラを、画面を出さずに適用する
 *
 * 用途:
 *   開発中に「直す → 試す」を繰り返すとき、毎回インストーラのウィザードを
 *   操作するのは手間なので、その場で静かに入れ替えて起動し直すためのもの。
 *
 *   npm run update
 *     → ビルド(npm run dist) → このスクリプト → 静かにインストール → アプリ起動
 *
 * 配布物には含まれない開発用のツールである。
 * 利用者に配るときは通常どおりインストーラを渡せば、確認画面が表示される。
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const releaseDir = path.join(__dirname, '..', 'release');

if (process.platform !== 'win32') {
  console.error('このスクリプトはWindows専用である。');
  process.exit(1);
}

if (!fs.existsSync(releaseDir)) {
  console.error('release フォルダが無い。先に npm run dist を実行すること。');
  process.exit(1);
}

// 一番新しい Setup exe を選ぶ(バージョンを手で書かなくて済むように)
const installers = fs
  .readdirSync(releaseDir)
  .filter((name) => /^MemoWiki-Setup-.*\.exe$/.test(name))
  .map((name) => {
    const full = path.join(releaseDir, name);
    return { name, full, mtime: fs.statSync(full).mtimeMs };
  })
  .sort((a, b) => b.mtime - a.mtime);

if (installers.length === 0) {
  console.error('インストーラが見つからない。先に npm run dist を実行すること。');
  process.exit(1);
}

const installer = installers[0];
console.log(`静かにインストールする: ${installer.name}`);

// /S        … 画面を出さずにインストールする
// --force-run … インストール後にアプリを起動する
const child = spawn(installer.full, ['/S', '--force-run'], {
  detached: true,
  stdio: 'ignore',
});
child.unref();

console.log('インストールを開始した。数十秒でアプリが起動する。');

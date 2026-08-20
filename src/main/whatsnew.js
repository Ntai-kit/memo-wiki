/**
 * whatsnew.js — 「前回はどのバージョンだったか」の記録
 *
 * 責務:
 *   - アプリを最後に使ったときのバージョンを覚えておく
 *   - 更新後の初回起動で、画面側に「前回のバージョン」を伝える
 *
 * 画面側はこれと現在のバージョンを比べて、
 * 間に入るすべての更新内容を古い順に表示する
 * (1.4.0 から 1.7.0 に一気に上げた場合も、1.5.0 → 1.6.0 → 1.7.0 と順に見せられる)。
 *
 * 記録は userData/last-seen-version.txt に置く。
 * 更新内容を見せ終えたタイミングで markSeen() が呼ばれて書き換わる。
 */
const fs = require('fs');
const path = require('path');

let seenFile = '';
let previousVersion = null; // 起動時に読み取った「前回のバージョン」

/**
 * 起動時に1回呼ぶ。前回のバージョンを読み取って覚えておく。
 *
 * 注意: backup.js が last-run-version.txt を書き換える前に呼ぶこと。
 * この仕組みを入れる前のバージョンから更新した場合、
 * 自分の記録ファイルがまだ無いので、backup.js の記録を代わりに使う。
 *
 * @param {string} userDataPath
 */
function init(userDataPath) {
  seenFile = path.join(userDataPath, 'last-seen-version.txt');
  const fallbackFile = path.join(userDataPath, 'last-run-version.txt');

  if (fs.existsSync(seenFile)) {
    previousVersion = read(seenFile);
  } else if (fs.existsSync(fallbackFile)) {
    previousVersion = read(fallbackFile);
  } else {
    previousVersion = null; // 新規インストール(更新内容は見せない)
  }
}

/** 前回のバージョン(新規インストールなら null) */
function getPreviousVersion() {
  return previousVersion;
}

/** 更新内容を見せ終えたら呼ぶ。次回からは表示されなくなる */
function markSeen(version) {
  fs.mkdirSync(path.dirname(seenFile), { recursive: true });
  fs.writeFileSync(seenFile, String(version), 'utf8');
  previousVersion = String(version);
}

function read(file) {
  const text = fs.readFileSync(file, 'utf8').trim();
  return text || null;
}

module.exports = { init, getPreviousVersion, markSeen };

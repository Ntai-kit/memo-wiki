/**
 * backup.js — アップデート時の自動バックアップ
 *
 * 責務:
 *   - アプリのバージョンが前回起動時と変わっていたら、
 *     データフォルダ(pages/images)を丸ごとバックアップする
 *   - 古いバックアップを整理する(最新 MAX_BACKUPS 世代だけ残す)
 *
 * 万一アップデートに不具合があっても、
 * userData/backups/ 内のフォルダを data/ に戻せば復元できる。
 *
 * フォルダ構成:
 *   userData/
 *   ├── data/                 ← 現行データ
 *   ├── backups/
 *   │   └── v1.0.0-2026-08-20-12-00-00/   ← バックアップ(=旧data/のコピー)
 *   └── last-run-version.txt  ← 前回起動時のアプリバージョン
 */
const fs = require('fs');
const path = require('path');

/** 残すバックアップの世代数 */
const MAX_BACKUPS = 5;

/**
 * バージョンが変わっていればバックアップを実行する。
 * アプリ起動時(storage.init の前)に1回呼ぶ。
 * @param {string} userDataPath アプリのuserDataフォルダ
 * @param {string} appVersion 現在のアプリバージョン(package.jsonのversion)
 * @returns {string|null} 作成したバックアップのパス(作成しなければ null)
 */
function runIfVersionChanged(userDataPath, appVersion) {
  const dataDir = path.join(userDataPath, 'data');
  const backupsDir = path.join(userDataPath, 'backups');
  const versionFile = path.join(userDataPath, 'last-run-version.txt');

  const lastVersion = fs.existsSync(versionFile)
    ? fs.readFileSync(versionFile, 'utf8').trim()
    : null; // 初回起動 or この仕組み導入前のバージョンから更新

  let backupPath = null;
  const versionChanged = lastVersion !== appVersion;
  const hasData = fs.existsSync(dataDir);

  if (versionChanged && hasData) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    backupPath = path.join(backupsDir, `v${lastVersion || 'unknown'}-${stamp}`);
    fs.cpSync(dataDir, backupPath, { recursive: true });
    pruneOldBackups(backupsDir);
  }

  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(versionFile, appVersion, 'utf8');
  return backupPath;
}

/** 古いバックアップを削除して最新 MAX_BACKUPS 世代だけ残す */
function pruneOldBackups(backupsDir) {
  if (!fs.existsSync(backupsDir)) return;
  const dirs = fs
    .readdirSync(backupsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const full = path.join(backupsDir, e.name);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime); // 新しい順

  for (const old of dirs.slice(MAX_BACKUPS)) {
    fs.rmSync(old.full, { recursive: true, force: true });
  }
}

module.exports = { runIfVersionChanged, pruneOldBackups, MAX_BACKUPS };

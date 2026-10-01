/**
 * helpers.js — テスト共通の道具
 *
 * storage.js はフォルダの場所をモジュール内に持つため、
 * テストごとに一時フォルダを作って init し直して使う。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

/** 空の一時フォルダを作る(テストの終わりに消す関数も返す) */
function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-wiki-test-'));
  return { dir, remove: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** 一時フォルダを保存先にした storage を用意する */
function freshStorage() {
  const storage = require('../src/main/storage');
  const temp = makeTempDir();
  storage.init(temp.dir);
  return { storage, ...temp };
}

module.exports = { makeTempDir, freshStorage };

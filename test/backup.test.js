/**
 * backup.test.js — アップデート時の自動バックアップ
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeTempDir } = require('./helpers');
const backup = require('../src/main/backup');

/** userData に data/pages/a.json があり、前回起動時のバージョンが version の状態を作る */
function setup(version) {
  const temp = makeTempDir();
  fs.mkdirSync(path.join(temp.dir, 'data', 'pages'), { recursive: true });
  fs.writeFileSync(path.join(temp.dir, 'data', 'pages', 'a.json'), '{}');
  if (version) fs.writeFileSync(path.join(temp.dir, 'last-run-version.txt'), version);
  return temp;
}

test('バージョンが変わっていたら data を丸ごとバックアップする', (t) => {
  const temp = setup('1.0.0');
  t.after(temp.remove);

  const created = backup.runIfVersionChanged(temp.dir, '1.1.0');
  assert.ok(created);
  assert.match(path.basename(created), /^v1\.0\.0-/);
  assert.ok(fs.existsSync(path.join(created, 'pages', 'a.json')));
  assert.equal(fs.readFileSync(path.join(temp.dir, 'last-run-version.txt'), 'utf8'), '1.1.0');
});

test('バージョンが同じならバックアップしない', (t) => {
  const temp = setup('1.1.0');
  t.after(temp.remove);
  assert.equal(backup.runIfVersionChanged(temp.dir, '1.1.0'), null);
});

test('古いバックアップは最新の決まった世代数だけ残す', (t) => {
  const temp = makeTempDir();
  t.after(temp.remove);

  const total = backup.MAX_BACKUPS + 2;
  for (let i = 0; i < total; i++) {
    const dir = path.join(temp.dir, `v${i}`);
    fs.mkdirSync(dir);
    const time = new Date(2026, 0, 1 + i);
    fs.utimesSync(dir, time, time);
  }
  backup.pruneOldBackups(temp.dir);

  const left = fs.readdirSync(temp.dir).sort((a, b) => a.slice(1) - b.slice(1));
  assert.equal(left.length, backup.MAX_BACKUPS);
  assert.equal(left[0], 'v2'); // 古い2つ(v0, v1)が消えている
});

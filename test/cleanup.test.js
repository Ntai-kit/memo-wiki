/**
 * cleanup.test.js — 使っていない画像の整理
 *
 * ごみ箱へ移す関数は差し替えて、実際のごみ箱には触れない。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { freshStorage } = require('./helpers');
const cleanup = require('../src/main/cleanup');

/** 画像フォルダに中身の大きさを指定してファイルを置く */
function putImage(storage, name, bytes) {
  fs.writeFileSync(path.join(storage.getImagesDir(), name), Buffer.alloc(bytes));
}

test('どのページからも使われていない画像だけを見つける', (t) => {
  const { storage, remove } = freshStorage();
  t.after(remove);

  putImage(storage, 'used.png', 10);
  putImage(storage, 'cover.png', 10);
  putImage(storage, 'unused.png', 30);
  putImage(storage, 'editing.png', 10);
  storage.savePage(null, {
    title: 'A',
    cover: 'memo://images/cover.png',
    html: '<img src="memo://images/used.png">',
  });

  // 保存前の編集中の本文で使っている画像は残す
  const found = cleanup.findUnusedImages(storage, ['<img src="memo://images/editing.png">']);
  assert.deepEqual(found, [{ name: 'unused.png', size: 30 }]);
});

test('画面から文字列以外が届いても無視する', (t) => {
  const { storage, remove } = freshStorage();
  t.after(remove);
  putImage(storage, 'a.png', 1);
  assert.equal(cleanup.findUnusedImages(storage, [null, 1, { x: 1 }]).length, 1);
  assert.equal(cleanup.findUnusedImages(storage, 'not-array').length, 1);
});

test('見つけた画像をごみ箱へ移し、件数と容量を返す', async (t) => {
  const { storage, remove } = freshStorage();
  t.after(remove);

  putImage(storage, 'keep.png', 5);
  putImage(storage, 'old1.png', 100);
  putImage(storage, 'old2.png', 200);
  storage.savePage(null, { title: 'A', html: '<img src="memo://images/keep.png">' });

  const trashed = [];
  const result = await cleanup.trashUnusedImages(storage, [], async (file) => {
    trashed.push(path.basename(file));
    fs.unlinkSync(file);
  });

  assert.deepEqual(result, { count: 2, bytes: 300, failed: 0 });
  assert.deepEqual(trashed.sort(), ['old1.png', 'old2.png']);
  assert.deepEqual(fs.readdirSync(storage.getImagesDir()), ['keep.png']);
});

test('ごみ箱へ移せなかった画像は失敗として数え、残りは続ける', async (t) => {
  const { storage, remove } = freshStorage();
  t.after(remove);

  putImage(storage, 'a.png', 1);
  putImage(storage, 'b.png', 1);

  const result = await cleanup.trashUnusedImages(storage, [], async (file) => {
    if (file.endsWith('a.png')) throw new Error('使用中');
  });
  assert.equal(result.count, 1);
  assert.equal(result.failed, 1);
});

/**
 * storage.test.js — ページと画像のファイル入出力
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { freshStorage } = require('./helpers');

test('ページを作って読み込み、更新して、削除できる', (t) => {
  const { storage, dir, remove } = freshStorage();
  t.after(remove);

  const created = storage.savePage(null, { title: 'りんご', html: '<p>赤い</p>' });
  assert.ok(created.id);
  assert.equal(storage.loadPage(created.id).html, '<p>赤い</p>');

  // 渡さなかった項目は保存済みの値が引き継がれる
  storage.savePage(created.id, { subtitle: '果物' });
  const updated = storage.loadPage(created.id);
  assert.equal(updated.title, 'りんご');
  assert.equal(updated.subtitle, '果物');
  assert.equal(updated.html, '<p>赤い</p>');

  // 一時ファイルが残っていない(安全な書き込みが完了している)
  const files = fs.readdirSync(path.join(dir, 'data', 'pages'));
  assert.deepEqual(files, [`${created.id}.json`]);

  storage.deletePage(created.id);
  assert.equal(storage.loadPage(created.id), null);
});

test('タイトルが空なら「無題のページ」になる', (t) => {
  const { storage, remove } = freshStorage();
  t.after(remove);
  assert.equal(storage.savePage(null, { title: '' }).title, '無題のページ');
});

test('壊れたファイルがあっても他のページは一覧に出る', (t) => {
  const { storage, dir, remove } = freshStorage();
  t.after(remove);

  storage.savePage(null, { title: '無事なページ' });
  fs.writeFileSync(path.join(dir, 'data', 'pages', 'broken.json'), '{ 壊れている');

  const titles = storage.listPages().map((p) => p.title);
  assert.deepEqual(titles, ['無事なページ']);
  assert.equal(storage.loadPage('broken'), null);
});

test('ページIDにパス操作の文字を含めてもフォルダの外を読まない', (t) => {
  const { storage, remove } = freshStorage();
  t.after(remove);
  assert.equal(storage.loadPage('../../secret'), null);
});

test('旧形式(v1)のページは読み込み時に新形式へ移行される', () => {
  const { migratePage } = require('../src/main/storage');
  const migrated = migratePage({ id: 'a', title: 'T', html: '' });
  assert.equal(migrated.formatVersion, 2);
  assert.equal(migrated.cover, '');
  assert.equal(migrated.subtitle, '');
});

test('未知の新しい形式はそのまま返す(壊さない)', () => {
  const { migratePage } = require('../src/main/storage');
  const future = { formatVersion: 99, id: 'a', extra: 1 };
  assert.deepEqual(migratePage(future), future);
});

test('検索はタイトル・サブタイトル・本文を対象にする', (t) => {
  const { storage, remove } = freshStorage();
  t.after(remove);

  storage.savePage(null, { title: 'りんご', html: '<p>赤くて甘い果物</p>' });
  storage.savePage(null, { title: 'みかん', subtitle: '冬の果物', html: '' });
  storage.savePage(null, { title: 'にんじん', html: '<p>野菜</p>' });

  const titles = storage.searchPages('果物').map((r) => r.title).sort();
  assert.deepEqual(titles, ['みかん', 'りんご']);
  // タグの中身(属性名など)ではヒットしない
  assert.equal(storage.searchPages('<p>').length, 0);
});

test('関連マップは存在するページ同士のリンクだけを結ぶ', (t) => {
  const { storage, remove } = freshStorage();
  t.after(remove);

  const b = storage.savePage(null, { title: 'B' });
  const a = storage.savePage(null, {
    title: 'A',
    html:
      `<a class="internal-link" data-page-id="${b.id}">B</a>` +
      '<a class="internal-link" data-page-id="deleted">消えたページ</a>',
  });
  // 自分自身へのリンクは数えない
  storage.savePage(b.id, { html: `<a class="internal-link" data-page-id="${b.id}">自分</a>` });

  const graph = storage.buildGraph();
  assert.deepEqual(graph.edges, [{ from: a.id, to: b.id }]);
  const degree = Object.fromEntries(graph.nodes.map((n) => [n.title, n.degree]));
  assert.deepEqual(degree, { A: 1, B: 1 });
});

test('本文から内部リンクの参照先を重複なく取り出す', () => {
  const { extractLinkedIds } = require('../src/main/storage');
  const html =
    '<a class="internal-link" data-page-id="x">1</a>' +
    '<a class="internal-link" data-page-id="x">2</a>' +
    '<a class="internal-link" data-page-id="y">3</a>';
  assert.deepEqual(extractLinkedIds(html), ['x', 'y']);
});

test('画像を保存すると memo:// のURLが返り、拡張子は安全な文字だけになる', (t) => {
  const { storage, remove } = freshStorage();
  t.after(remove);

  const url = storage.saveImage(new Uint8Array([1, 2, 3]), 'P/N..G');
  assert.match(url, /^memo:\/\/images\/[0-9a-f-]+\.png$/);
  const name = url.replace('memo://images/', '');
  assert.equal(fs.readFileSync(path.join(storage.getImagesDir(), name)).length, 3);
});

test('使われている画像を、本文・トップ画像・壊れたページから拾う', (t) => {
  const { storage, dir, remove } = freshStorage();
  t.after(remove);

  storage.savePage(null, {
    title: 'A',
    cover: 'memo://images/cover.png',
    html: '<img src="memo://images/body.jpg" alt="">',
  });
  // 壊れていて読めないページが使っている画像も「使用中」とみなす
  fs.writeFileSync(
    path.join(dir, 'data', 'pages', 'broken.json'),
    '{ "html": "<img src=\\"memo://images/in-broken.png\\"'
  );

  const used = storage.collectUsedImages(['<img src="memo://images/unsaved.gif">']);
  assert.deepEqual([...used].sort(), ['body.jpg', 'cover.png', 'in-broken.png', 'unsaved.gif']);
});

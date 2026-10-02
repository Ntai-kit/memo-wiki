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
  assert.equal(migrated.formatVersion, 3);
  assert.equal(migrated.cover, '');
  assert.equal(migrated.subtitle, '');
  assert.equal(migrated.folderId, '');
  assert.equal(migrated.trashedAt, '');
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

test('ごみ箱へ移したページは一覧・検索・マップから外れ、元に戻せる', (t) => {
  const { storage, remove } = freshStorage();
  t.after(remove);

  const a = storage.savePage(null, { title: 'りんご', html: '<p>果物</p>' });
  const b = storage.savePage(null, {
    title: 'みかん',
    html: `<a class="internal-link" data-page-id="${a.id}">りんご</a>`,
  });
  const before = storage.loadPage(a.id).updatedAt;

  storage.trashPage(a.id);
  assert.deepEqual(storage.listPages().map((p) => p.title), ['みかん']);
  assert.deepEqual(storage.listTrash().map((p) => p.title), ['りんご']);
  assert.equal(storage.searchPages('果物').length, 0);
  assert.deepEqual(storage.buildGraph().edges, []);
  // ごみ箱にあっても中身は読める(リンクから開ける)
  assert.equal(storage.loadPage(a.id).html, '<p>果物</p>');

  // 編集して保存してもごみ箱からは出ない
  storage.savePage(a.id, { html: '<p>赤い果物</p>' });
  assert.equal(storage.listTrash().length, 1);

  storage.restorePage(a.id);
  assert.equal(storage.listTrash().length, 0);
  assert.deepEqual(storage.buildGraph().edges, [{ from: b.id, to: a.id }]);
  // 出し入れでは更新日時は変わらない(編集した分だけ変わる)
  assert.ok(storage.loadPage(a.id).updatedAt >= before);
});

test('ごみ箱を空にすると、ごみ箱のページだけが消える', (t) => {
  const { storage, remove } = freshStorage();
  t.after(remove);

  const keep = storage.savePage(null, { title: '残す' });
  const gone = storage.savePage(null, { title: '消す' });
  storage.trashPage(gone.id);

  assert.equal(storage.emptyTrash(), 1);
  assert.equal(storage.loadPage(gone.id), null);
  assert.ok(storage.loadPage(keep.id));
});

test('フォルダを作り、ページを移し、名前を変えられる', (t) => {
  const { storage, remove } = freshStorage();
  t.after(remove);

  const fruit = storage.createFolder('  果物  ');
  storage.createFolder('あいう');
  assert.deepEqual(storage.listFolders().map((f) => f.name), ['あいう', '果物']);

  const page = storage.savePage(null, { title: 'りんご', folderId: fruit.id });
  assert.equal(storage.listPages()[0].folderId, fruit.id);

  storage.renameFolder(fruit.id, 'くだもの');
  assert.ok(storage.listFolders().some((f) => f.name === 'くだもの'));

  storage.movePage(page.id, '');
  assert.equal(storage.listPages()[0].folderId, '');
  assert.throws(() => storage.movePage(page.id, 'no-such-folder'));
  assert.throws(() => storage.createFolder('   '));
});

test('フォルダの中にフォルダを作り、別のフォルダへ移せる', (t) => {
  const { storage, remove } = freshStorage();
  t.after(remove);

  const work = storage.createFolder('仕事');
  const meeting = storage.createFolder('会議', work.id);
  const weekly = storage.createFolder('週次', meeting.id);
  const parentOf = (id) => storage.listFolders().find((f) => f.id === id).parentId;
  assert.equal(parentOf(meeting.id), work.id);
  assert.equal(parentOf(weekly.id), meeting.id);

  // 自分自身や自分の中のフォルダへは移せない
  assert.throws(() => storage.moveFolder(work.id, work.id));
  assert.throws(() => storage.moveFolder(work.id, weekly.id));
  assert.throws(() => storage.createFolder('迷子', 'no-such-folder'));

  storage.moveFolder(weekly.id, '');
  assert.equal(parentOf(weekly.id), '');
});

test('入れ子のフォルダを消すと、中身はひとつ上の階層へ移る', (t) => {
  const { storage, remove } = freshStorage();
  t.after(remove);

  const work = storage.createFolder('仕事');
  const meeting = storage.createFolder('会議', work.id);
  const weekly = storage.createFolder('週次', meeting.id);
  const page = storage.savePage(null, { title: '議事録', folderId: meeting.id });

  storage.deleteFolder(meeting.id);
  assert.equal(storage.loadPage(page.id).folderId, work.id);
  assert.equal(storage.listFolders().find((f) => f.id === weekly.id).parentId, work.id);
});

test('親子の輪ができているフォルダは一番上の階層として扱う', (t) => {
  const { storage, dir, remove } = freshStorage();
  t.after(remove);

  fs.writeFileSync(
    path.join(dir, 'data', 'folders.json'),
    JSON.stringify({
      folders: [
        { id: 'a', name: 'A', parentId: 'b' },
        { id: 'b', name: 'B', parentId: 'a' },
        { id: 'c', name: 'C', parentId: 'gone' },
        { id: 'd', name: 'D' }, // 1階層だった頃の形式
      ],
    })
  );
  const parents = Object.fromEntries(storage.listFolders().map((f) => [f.id, f.parentId]));
  assert.deepEqual(parents, { a: '', b: '', c: '', d: '' });
});

test('ごみ箱に入れて30日たったページだけが自動で削除される', (t) => {
  const { storage, remove } = freshStorage();
  t.after(remove);

  const day = 24 * 60 * 60 * 1000;
  const now = new Date('2026-10-31T00:00:00Z');
  const old = storage.savePage(null, { title: '古い' });
  const recent = storage.savePage(null, { title: '新しい' });
  const active = storage.savePage(null, { title: 'ごみ箱ではない' });
  storage.savePage(active.id, {}); // 更新日時が古くても、ごみ箱でなければ消えない
  storage.trashPage(old.id);
  storage.trashPage(recent.id);
  // ごみ箱へ移した日時を書き換えて、時間がたった状態にする
  const setTrashedAt = (id, date) => {
    const file = path.join(storage.getDataDir(), 'pages', `${id}.json`);
    const page = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...page, trashedAt: date.toISOString() }));
  };
  setTrashedAt(old.id, new Date(now.getTime() - 30 * day));
  setTrashedAt(recent.id, new Date(now.getTime() - 29 * day));

  assert.equal(storage.purgeOldTrash(now), 1);
  assert.equal(storage.loadPage(old.id), null);
  assert.ok(storage.loadPage(recent.id));
  assert.ok(storage.loadPage(active.id));
});

test('フォルダを消すと、中のページは消えずに未分類へ移る', (t) => {
  const { storage, remove } = freshStorage();
  t.after(remove);

  const folder = storage.createFolder('仕事');
  const page = storage.savePage(null, { title: '会議メモ', folderId: folder.id });
  const trashed = storage.savePage(null, { title: '古いメモ', folderId: folder.id });
  storage.trashPage(trashed.id);

  storage.deleteFolder(folder.id);
  assert.deepEqual(storage.listFolders(), []);
  assert.equal(storage.loadPage(page.id).folderId, '');
  // ごみ箱から戻しても、消えたフォルダを指さない
  storage.restorePage(trashed.id);
  assert.equal(storage.loadPage(trashed.id).folderId, '');
});

test('フォルダの一覧が壊れていても、ページはすべて未分類として見える', (t) => {
  const { storage, dir, remove } = freshStorage();
  t.after(remove);

  const folder = storage.createFolder('仕事');
  storage.savePage(null, { title: '会議メモ', folderId: folder.id });
  fs.writeFileSync(path.join(dir, 'data', 'folders.json'), '{ 壊れている');

  assert.deepEqual(storage.listFolders(), []);
  const pages = storage.listPages();
  assert.equal(pages.length, 1);
  assert.equal(pages[0].folderId, '');
});

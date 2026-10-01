/**
 * exporter.test.js — メモの書き出し
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { freshStorage, makeTempDir } = require('./helpers');
const exporter = require('../src/main/exporter');

test('画像のURLを書き出し先から見た相対パスに直す', () => {
  const html = exporter.toExportHTML('<img src="memo://images/a.png" alt="">', new Set());
  assert.equal(html, '<img src="../data/images/a.png" alt="">');
});

test('ページ間リンクは書き出したHTMLへのリンクになり、消えたページへは張らない', () => {
  const html = exporter.toExportHTML(
    '<a class="internal-link" data-page-id="p1">あり</a>' +
      '<a class="internal-link" data-page-id="gone">なし</a>',
    new Set(['p1'])
  );
  assert.equal(
    html,
    '<a class="internal-link" data-page-id="p1" href="p1.html">あり</a>' +
      '<a class="internal-link" data-page-id="gone">なし</a>'
  );
});

test('目次の項目は見出しへ飛ぶリンクになり、見出しには通し番号のIDが付く', () => {
  const html = exporter.toExportHTML(
    '<div class="toc-block" contenteditable="false"><ul class="toc-list">' +
      '<li class="toc-item toc-level-0"><span class="toc-link" data-target="sec-1">' +
      '<span class="toc-number">1</span>はじめに</span></li></ul></div>' +
      '<h2 id="old">はじめに</h2><h3>詳しく</h3>',
    new Set()
  );
  assert.ok(html.includes('<a class="toc-link" href="#sec-1"><span class="toc-number">1</span>はじめに</a></li>'));
  assert.ok(html.includes('<h2 id="sec-1">はじめに</h2>'));
  assert.ok(html.includes('<h3 id="sec-2">詳しく</h3>'));
  assert.ok(!html.includes('contenteditable'));
});

test('タイトルなどの文字はHTMLとして解釈されないようにする', () => {
  const doc = exporter.buildPageDocument(
    { id: 'a', title: '<script>x</script>', subtitle: '"引用"', cover: '', html: '', updatedAt: '' },
    new Set(['a'])
  );
  assert.ok(doc.includes('&lt;script&gt;x&lt;/script&gt;'));
  assert.ok(!doc.includes('<script>'));
  // 書き出したページではスクリプトを動かさない
  assert.ok(doc.includes("script-src 'none'"));
});

test('すべてのメモを、読む用のHTMLと復元用のデータに書き出す', (t) => {
  const { storage, remove } = freshStorage();
  const out = makeTempDir();
  t.after(() => {
    remove();
    out.remove();
  });

  const url = storage.saveImage(new Uint8Array([1]), 'png');
  const b = storage.savePage(null, { title: 'B' });
  const a = storage.savePage(null, {
    title: 'A',
    cover: url,
    html: `<a class="internal-link" data-page-id="${b.id}">B</a>`,
  });
  // 書きかけの一時ファイルは書き出さない
  fs.writeFileSync(path.join(storage.getDataDir(), 'pages', 'x.json.tmp'), '');

  const now = new Date(2026, 9, 1, 12, 0, 0);
  const result = exporter.exportAll(storage, out.dir, now);

  assert.equal(path.basename(result.path), 'MemoWiki-書き出し-2026-10-01-12-00-00');
  assert.equal(result.pages, 2);
  assert.equal(result.images, 1);

  const read = (...p) => fs.readFileSync(path.join(result.path, ...p), 'utf8');
  assert.ok(read('index.html').includes(`href="pages/${a.id}.html"`));
  assert.ok(read('pages', `${a.id}.html`).includes(`href="${b.id}.html"`));
  assert.ok(read('pages', `${a.id}.html`).includes('src="../data/images/'));
  assert.ok(read('style.css').length > 0);
  assert.deepEqual(fs.readdirSync(path.join(result.path, 'data', 'pages')).sort(), [
    `${a.id}.json`,
    `${b.id}.json`,
  ].sort());

  // 同じ時刻にもう一度書き出しても、前の書き出しを上書きしない
  const again = exporter.exportAll(storage, out.dir, now);
  assert.equal(path.basename(again.path), 'MemoWiki-書き出し-2026-10-01-12-00-00-2');
});

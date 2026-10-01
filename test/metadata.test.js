/**
 * metadata.test.js — リンクカード用のメタデータの読み取り
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMetadata } = require('../src/main/metadata');

test('OGPタグからタイトル・説明・画像・サイト名を読む', () => {
  const html = `
    <meta property="og:title" content="記事の題">
    <meta property="og:description" content="説明 &amp; 補足">
    <meta property="og:image" content="/img/thumb.png">
    <meta property="og:site_name" content='サイト'>
    <title>使われない</title>`;
  assert.deepEqual(parseMetadata(html, 'https://example.com/a/b'), {
    title: '記事の題',
    description: '説明 & 補足',
    image: 'https://example.com/img/thumb.png',
    siteName: 'サイト',
  });
});

test('OGPが無ければ <title> と description を使う', () => {
  const html = '<title> 題名 </title><meta name="description" content="説明">';
  assert.deepEqual(parseMetadata(html, 'https://example.com/'), {
    title: '題名',
    description: '説明',
  });
});

test('何も無ければ空の結果を返す', () => {
  assert.deepEqual(parseMetadata('<p>本文だけ</p>', 'https://example.com/'), {});
});

/**
 * changelog.test.mjs — 更新内容の一覧と、表示するバージョンの判定
 *
 * 画面側のモジュール(ES modules)なので .mjs で書いている。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHANGELOG, compareVersions, entriesBetween } from '../src/renderer/js/changelog.js';

test('バージョンを数値として比べる(1.10.0 は 1.9.0 より新しい)', () => {
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
  assert.equal(compareVersions('1.8.4', '1.8.4'), 0);
  assert.equal(compareVersions('1.8', '1.8.1'), -1);
});

test('とばした分の更新内容を古い順に返す', () => {
  const versions = entriesBetween('1.4.0', '1.7.0').map((e) => e.version);
  assert.deepEqual(versions, ['1.5.0', '1.6.0', '1.7.0']);
});

test('新規インストールでは何も見せない', () => {
  assert.deepEqual(entriesBetween(null, '1.8.4'), []);
});

test('一覧は新しい順に並んでいて、先頭が package.json のバージョンと一致する', () => {
  // リリースのたびに CHANGELOG の先頭へ1件足す約束を守れているかの確認
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(CHANGELOG[0].version, pkg.version);
  for (let i = 1; i < CHANGELOG.length; i++) {
    assert.equal(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version), 1);
  }
});

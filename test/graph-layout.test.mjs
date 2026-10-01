/**
 * graph-layout.test.mjs — 関連マップのノード配置計算
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLayout } from '../src/renderer/js/graph-layout.js';

const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
const edges = [
  { from: 'a', to: 'b' },
  { from: 'b', to: 'c' },
  { from: 'a', to: 'missing' }, // 存在しないノードへの辺は無視される
];

test('存在するノード同士の辺だけを使う', () => {
  assert.equal(createLayout(nodes, edges).links.length, 2);
});

test('計算を進めると配置が落ち着く', () => {
  const layout = createLayout(nodes, edges);
  let movement = Infinity;
  for (let i = 0; i < 500; i++) movement = layout.step();
  assert.ok(movement < 1, `まだ動いている: ${movement}`);
});

test('乱数を使わないので、同じ入力なら同じ配置になる', () => {
  const run = () => {
    const layout = createLayout(nodes, edges);
    for (let i = 0; i < 50; i++) layout.step();
    return layout.nodes.map((n) => [n.x, n.y]);
  };
  assert.deepEqual(run(), run());
});

test('ドラッグ中(pinned)のノードは計算で動かない', () => {
  const layout = createLayout(nodes, edges);
  const node = layout.nodes[0];
  node.pinned = true;
  const before = { x: node.x, y: node.y };
  for (let i = 0; i < 20; i++) layout.step();
  assert.deepEqual({ x: node.x, y: node.y }, before);
});

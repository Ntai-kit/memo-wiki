/**
 * graph.js — 関連マップの描画とマウス操作
 *
 * 責務:
 *   - ページ同士のつながりをcanvasに描く
 *   - ホイールで拡大縮小、ドラッグで移動、ノードのクリックでページを開く
 *
 * ノードの配置計算は graph-layout.js に任せ、
 * ここは「描く」「触る」だけを担当する。
 *
 * 見方:
 *   丸 = ページ / 線 = 内部リンク(矢印はリンクの向き)
 *   丸の大きさ = つながりの多さ / 灰色 = どこともつながっていないページ
 */
import * as api from './api.js';
import { createLayout } from './graph-layout.js';

/* ---------- 見た目の設定 ---------- */
const COLORS = {
  node: '#3366cc',
  nodeIsolated: '#9aa0ad',
  nodeCurrent: '#e8710a',
  edge: '#c3cbdb',
  edgeHighlight: '#3366cc',
  label: '#202122',
};
const BASE_RADIUS = 9; // つながりが無いノードの半径
const RADIUS_PER_LINK = 1.8; // つながり1本あたりの半径の増分
const MAX_RADIUS = 26;
const SETTLE_THRESHOLD = 0.5; // これ以下の移動量になったら計算を止める

const canvas = document.getElementById('map-canvas');
const emptyMessage = document.getElementById('map-empty');
const infoEl = document.getElementById('map-info');
const isolatedCheckbox = document.getElementById('map-show-isolated');
const ctx = canvas.getContext('2d');

let layout = null; // 現在のレイアウト計算オブジェクト
let animationId = null;
let onOpenPage = null; // ノードのクリックでページを開くコールバック
let currentPageId = null; // 強調表示するページ

// 表示の変換(world座標 → 画面座標)
let scale = 1;
let offsetX = 0;
let offsetY = 0;

// マウス操作の状態
let hoveredNode = null;
let draggingNode = null;
let panning = false;
let pointerMoved = 0;
let lastPointer = { x: 0, y: 0 };

/**
 * 初期化(起動時に1回)。
 * @param {(pageId: string) => void} openHandler ノードのクリックで呼ばれる
 */
export function init(openHandler) {
  onOpenPage = openHandler;

  document.getElementById('btn-map-reset').addEventListener('click', () => {
    if (!layout) return;
    layout.reset();
    startAnimation();
  });
  document.getElementById('btn-map-fit').addEventListener('click', fitToView);
  isolatedCheckbox.addEventListener('change', () => show(currentPageId));

  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointerleave', handlePointerUp);
  canvas.addEventListener('wheel', handleWheel, { passive: false });

  // 表示領域の大きさが変わったら解像度を合わせ直す
  new ResizeObserver(() => {
    resizeCanvas();
    draw();
  }).observe(canvas.parentElement);
}

/**
 * マップを表示する(最新のページ状況を読み込み直す)。
 * @param {string|null} pageId 強調表示するページ(いま開いているページ)
 */
export async function show(pageId) {
  currentPageId = pageId;
  const graph = await api.buildGraph();

  // 「孤立ページも表示」がOFFなら、リンクを持たないページを除く
  const showIsolated = isolatedCheckbox.checked;
  const nodes = showIsolated ? graph.nodes : graph.nodes.filter((n) => n.degree > 0);
  const visibleIds = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to));

  const linkCount = new Set(graph.edges.map((e) => `${e.from}>${e.to}`)).size;
  infoEl.textContent = `${graph.nodes.length}ページ / ${linkCount}リンク`;

  emptyMessage.hidden = nodes.length > 0;
  layout = createLayout(nodes, edges);

  resizeCanvas();
  // 落ち着いた配置から見せたいので、あらかじめ何回か計算しておく
  for (let i = 0; i < 120; i++) layout.step();
  fitToView();
  startAnimation();
}

/** マップを閉じる(アニメーションを止める) */
export function hide() {
  stopAnimation();
}

/* ---------- アニメーション ---------- */

function startAnimation() {
  if (animationId !== null) return;
  const tick = () => {
    const movement = layout ? layout.step() : 0;
    draw();
    // 配置が落ち着き、操作もされていなければ計算を止める(CPU節約)
    if (movement < SETTLE_THRESHOLD && !draggingNode) {
      animationId = null;
      return;
    }
    animationId = requestAnimationFrame(tick);
  };
  animationId = requestAnimationFrame(tick);
}

function stopAnimation() {
  if (animationId !== null) cancelAnimationFrame(animationId);
  animationId = null;
}

/* ---------- 座標変換 ---------- */

function toScreen(x, y) {
  return { x: x * scale + offsetX, y: y * scale + offsetY };
}

function toWorld(x, y) {
  return { x: (x - offsetX) / scale, y: (y - offsetY) / scale };
}

/** canvasの解像度を表示サイズに合わせる(高DPI対応) */
function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 以降はCSSピクセルで描ける
}

/** 表示中のcanvasの大きさ(CSSピクセル) */
function viewSize() {
  const dpr = window.devicePixelRatio || 1;
  return { width: canvas.width / dpr, height: canvas.height / dpr };
}

/** 全ノードが画面に収まるよう拡大率と位置を合わせる */
function fitToView() {
  if (!layout || layout.nodes.length === 0) return;
  const { width, height } = viewSize();
  const { minX, minY, maxX, maxY } = layout.bounds();
  const margin = 80;
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  scale = Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanY, 1.6);
  scale = Math.max(0.1, scale);
  offsetX = width / 2 - ((minX + maxX) / 2) * scale;
  offsetY = height / 2 - ((minY + maxY) / 2) * scale;
  draw();
}

/* ---------- 描画 ---------- */

function radiusOf(node) {
  return Math.min(MAX_RADIUS, BASE_RADIUS + node.degree * RADIUS_PER_LINK);
}

function draw() {
  if (!layout) return;
  const { width, height } = viewSize();
  ctx.clearRect(0, 0, width, height);

  // ホバー中のノードにつながる辺を目立たせる
  const highlightId = hoveredNode ? hoveredNode.id : null;

  for (const link of layout.links) {
    const related = highlightId === link.source.id || highlightId === link.target.id;
    drawEdge(link.source, link.target, related);
  }
  for (const node of layout.nodes) {
    drawNode(node);
  }
}

/** 辺(矢印つきの線)を描く */
function drawEdge(source, target, highlighted) {
  const a = toScreen(source.x, source.y);
  const b = toScreen(target.x, target.y);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;

  // 線が円の内側に入り込まないよう、両端を半径分だけ縮める
  const startGap = radiusOf(source) * scale + 2;
  const endGap = radiusOf(target) * scale + 4;
  const x1 = a.x + ux * startGap;
  const y1 = a.y + uy * startGap;
  const x2 = b.x - ux * endGap;
  const y2 = b.y - uy * endGap;
  if (dist <= startGap + endGap) return; // 近すぎるときは描かない

  ctx.strokeStyle = highlighted ? COLORS.edgeHighlight : COLORS.edge;
  ctx.lineWidth = highlighted ? 2 : 1.2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // 矢印(リンクの向き)
  const head = 8;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux * head - uy * head * 0.4, y2 - uy * head + ux * head * 0.4);
  ctx.lineTo(x2 - ux * head + uy * head * 0.4, y2 - uy * head - ux * head * 0.4);
  ctx.closePath();
  ctx.fill();
}

/** ノード(丸とタイトル)を描く */
function drawNode(node) {
  const { x, y } = toScreen(node.x, node.y);
  const r = radiusOf(node) * scale;
  const isCurrent = node.id === currentPageId;
  const isHovered = hoveredNode && hoveredNode.id === node.id;

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = isCurrent
    ? COLORS.nodeCurrent
    : node.degree === 0
      ? COLORS.nodeIsolated
      : COLORS.node;
  ctx.fill();

  if (isCurrent || isHovered) {
    ctx.strokeStyle = isCurrent ? COLORS.nodeCurrent : COLORS.node;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // タイトル(縮小しすぎているときは省略。ホバー中は必ず出す)
  if (scale < 0.45 && !isHovered) return;
  const label = truncate(node.title, 18);
  ctx.font = `${isHovered || isCurrent ? 'bold ' : ''}12px "Hiragino Sans", "Yu Gothic UI", Meiryo, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // 文字を読みやすくするため背景を白く縁取る
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.strokeText(label, x, y + r + 5);
  ctx.fillStyle = COLORS.label;
  ctx.fillText(label, x, y + r + 5);
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/* ---------- マウス操作 ---------- */

/** 画面座標から、その位置にあるノードを探す */
function nodeAt(screenX, screenY) {
  if (!layout) return null;
  // 手前に描かれたもの(配列の後ろ)を優先する
  for (let i = layout.nodes.length - 1; i >= 0; i--) {
    const node = layout.nodes[i];
    const p = toScreen(node.x, node.y);
    const r = radiusOf(node) * scale + 4;
    if ((screenX - p.x) ** 2 + (screenY - p.y) ** 2 <= r * r) return node;
  }
  return null;
}

/**
 * カーソルの形を設定する。
 *
 * 同じ値を繰り返し設定するとちらつくため、変わったときだけ書き換える。
 * カーソルの指定をこの関数に集約することで、
 * ドラッグ中に指定が抜けて「カーソルが消える」状態になるのを防ぐ。
 */
function setCursor(shape) {
  if (canvas.style.cursor !== shape) canvas.style.cursor = shape;
}

/** イベントの座標をcanvas内の位置(CSSピクセル)に変換する */
function pointerPos(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function handlePointerDown(event) {
  const p = pointerPos(event);
  pointerMoved = 0;
  lastPointer = p;
  const node = nodeAt(p.x, p.y);
  if (node) {
    draggingNode = node;
    node.pinned = true; // ドラッグ中は計算で動かさない
  } else {
    panning = true;
  }
  // ドラッグ中はカーソルを固定する。
  // ここで明示しないと、環境によってはカーソルが消えたままになる
  setCursor('grabbing');
  canvas.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  const p = pointerPos(event);
  const dx = p.x - lastPointer.x;
  const dy = p.y - lastPointer.y;
  pointerMoved += Math.abs(dx) + Math.abs(dy);
  lastPointer = p;

  if (draggingNode) {
    const world = toWorld(p.x, p.y);
    draggingNode.x = world.x;
    draggingNode.y = world.y;
    setCursor('grabbing'); // ドラッグ中もカーソルを保ち続ける
    startAnimation(); // 周りのノードも追従させる
    return;
  }
  if (panning) {
    offsetX += dx;
    offsetY += dy;
    setCursor('grabbing');
    draw();
    return;
  }

  // ホバー表示の更新
  const node = nodeAt(p.x, p.y);
  setCursor(node ? 'pointer' : 'grab');
  if (node !== hoveredNode) {
    hoveredNode = node;
    canvas.title = node ? `${node.title}${node.subtitle ? `\n${node.subtitle}` : ''}` : '';
    draw();
  }
}

function handlePointerUp(event) {
  const wasDragging = draggingNode;
  if (draggingNode) {
    draggingNode.pinned = false;
    draggingNode = null;
  }
  panning = false;

  // ほとんど動かさずに離したらクリックとみなし、そのページを開く
  if (wasDragging && pointerMoved < 5) onOpenPage(wasDragging.id);
  if (event.pointerId !== undefined && canvas.hasPointerCapture?.(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  setCursor(hoveredNode ? 'pointer' : 'grab'); // 通常のカーソルに戻す
  startAnimation();
}

function handleWheel(event) {
  event.preventDefault();
  const p = pointerPos(event);
  const before = toWorld(p.x, p.y);
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
  scale = Math.max(0.15, Math.min(3, scale * factor));
  // カーソル位置を中心に拡大縮小する
  const after = toWorld(p.x, p.y);
  offsetX += (after.x - before.x) * scale;
  offsetY += (after.y - before.y) * scale;
  draw();
}

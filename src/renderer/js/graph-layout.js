/**
 * graph-layout.js — 関連マップのノード配置計算(力学モデル)
 *
 * 責務:
 *   - ノード同士を反発させ、リンクでつながったノードを引き寄せて、
 *     見やすい配置を自動的に求める
 *
 * 描画やマウス操作は graph.js が担当する。ここは座標計算だけなので、
 * 画面が無くても単体テストできる。
 *
 * 座標は原点(0,0)を中心とした「世界座標」で、画面への変換は描画側で行う。
 */

/** 力の強さの調整値(見た目の詰まり具合はここで変えられる) */
const REPULSION = 9000; // ノード同士が反発する強さ
const SPRING_LENGTH = 130; // リンクで結ばれたノードの理想距離
const SPRING_STRENGTH = 0.02; // 引き寄せる強さ
const CENTER_PULL = 0.004; // 全体が散らばりすぎないよう中心へ寄せる強さ
const DAMPING = 0.85; // 速度の減衰(1に近いほど揺れが長引く)
const MAX_SPEED = 40; // 1ステップの最大移動量(発散防止)

/**
 * レイアウト計算オブジェクトを作る。
 * @param {Array<{id: string}>} nodes ノード(idが必要。他の項目はそのまま保持)
 * @param {Array<{from: string, to: string}>} edges 有向の辺
 */
export function createLayout(nodes, edges) {
  const items = nodes.map((node, i) => ({
    ...node,
    ...initialPosition(i, nodes.length),
    vx: 0,
    vy: 0,
    pinned: false, // ドラッグ中のノードは計算で動かさない
  }));
  const byId = new Map(items.map((n) => [n.id, n]));

  // 存在するノード同士の辺だけを対象にする
  const links = edges
    .map((e) => ({ source: byId.get(e.from), target: byId.get(e.to) }))
    .filter((l) => l.source && l.target);

  /**
   * 1ステップ分だけ計算を進める。
   * @returns {number} 全体の移動量(小さくなったら配置が落ち着いた合図)
   */
  function step() {
    // ノード同士の反発(距離の2乗に反比例)
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 1) {
          // 完全に重なったときは決まった向きにずらす(乱数を使わず再現可能にする)
          dx = (i % 2 === 0 ? 1 : -1) * 0.5;
          dy = (j % 2 === 0 ? 1 : -1) * 0.5;
          distSq = dx * dx + dy * dy;
        }
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // リンクによる引き寄せ(理想距離からのずれに比例するバネ)
    for (const link of links) {
      const dx = link.target.x - link.source.x;
      const dy = link.target.y - link.source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - SPRING_LENGTH) * SPRING_STRENGTH;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      link.source.vx += fx;
      link.source.vy += fy;
      link.target.vx -= fx;
      link.target.vy -= fy;
    }

    // 中心への引力 + 速度の反映
    let movement = 0;
    for (const node of items) {
      node.vx -= node.x * CENTER_PULL;
      node.vy -= node.y * CENTER_PULL;
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      node.vx = clamp(node.vx, MAX_SPEED);
      node.vy = clamp(node.vy, MAX_SPEED);
      if (node.pinned) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      node.x += node.vx;
      node.y += node.vy;
      movement += Math.abs(node.vx) + Math.abs(node.vy);
    }
    return movement;
  }

  /** 初期配置に戻す */
  function reset() {
    items.forEach((node, i) => {
      Object.assign(node, initialPosition(i, items.length));
      node.vx = 0;
      node.vy = 0;
    });
  }

  /** 全ノードを囲む矩形(全体表示の計算に使う) */
  function bounds() {
    if (items.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of items) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    }
    return { minX, minY, maxX, maxY };
  }

  return { nodes: items, links, step, reset, bounds };
}

/**
 * 初期位置(黄金角のらせん)。
 * 乱数を使わないので、同じページ構成なら毎回同じ配置から始まる。
 */
function initialPosition(index, total) {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const radius = 40 * Math.sqrt(index + 1) * Math.max(1, Math.sqrt(total) / 3);
  const angle = index * goldenAngle;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/** 値を ±limit の範囲に収める */
function clamp(value, limit) {
  return Math.max(-limit, Math.min(limit, value));
}

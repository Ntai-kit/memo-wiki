/**
 * repaint.js — ダイアログを閉じた跡が画面に残る問題への対策
 *
 * 症状:
 *   使い方ガイドなどのダイアログを閉じても、その見た目が
 *   「残像」のように画面に残り続けることがある。
 *
 * 原因:
 *   ダイアログは画面の最前面(top layer)に描かれる特別な要素で、
 *   閉じたあとにその領域が描き直されないまま残ってしまう環境がある
 *   (画面の拡大表示や、グラフィック機能の組み合わせによって起きる)。
 *   要素自体は正しく閉じているので、見えているのは古い描画結果である。
 *
 * 対策:
 *   閉じた直後に「描き直して」と2段構えで伝える。
 *     1. 画面側 … 見た目に影響しない程度の変化を与えて描画をやり直させる
 *     2. アプリ本体 … ウィンドウ全体の再描画を要求する
 *
 * すべてのダイアログに共通の処理なので、1か所にまとめてある。
 */
import * as api from './api.js';

export function init() {
  // どのダイアログでも、閉じたときに描き直す
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('close', requestRepaint);
  }
}

/** 画面を描き直させる */
export function requestRepaint() {
  const root = document.getElementById('app');

  // 1. わずかに見た目を変えて戻すことで、画面側の描画をやり直させる
  root.classList.add('repainting');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove('repainting'));
  });

  // 2. ウィンドウ全体の再描画をアプリ本体に依頼する
  api.repaintWindow();
}

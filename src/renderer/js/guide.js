/**
 * guide.js — 使い方ガイド
 *
 * 責務:
 *   - 「?」ボタンで使い方ガイドのダイアログを開閉する
 *   - メモが1つも無いとき(初回起動)に自動で開く
 *
 * ガイドの本文は index.html の <dialog id="guide-dialog"> に書いてある。
 * メモとして保存されるわけではないので、
 * 利用者が誤って編集したり削除したりすることはなく、
 * 関連マップや検索結果にも現れない。
 *
 * 内容を直したいときは index.html のそのダイアログ部分だけを編集すればよい。
 */

const dialog = document.getElementById('guide-dialog');

export function init() {
  document.getElementById('btn-guide').addEventListener('click', open);
  document.getElementById('btn-guide-close').addEventListener('click', close);
  document.getElementById('btn-guide-ok').addEventListener('click', close);
}

/** ガイドを開く(毎回先頭から読めるようスクロール位置を戻す) */
export function open() {
  dialog.querySelector('.guide-body').scrollTop = 0;
  dialog.showModal();
}

/** ガイドを閉じる */
function close() {
  dialog.close();
}

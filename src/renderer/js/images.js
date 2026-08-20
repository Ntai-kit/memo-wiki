/**
 * images.js — 画像の保存と挿入
 *
 * 責務:
 *   - ツールバーの「画像」ボタンからのファイル選択
 *   - 画像ファイルを保存して本文に <img> を挿入する処理
 *
 * 貼り付け(Ctrl+V)やドラッグ&ドロップの受け口は paste.js が担当し、
 * 画像だったときにこのモジュールの insertImageFile を呼ぶ。
 *
 * どの経路でも画像バイナリをメインプロセスに渡して保存し、
 * 返ってきた "memo://images/..." のURLを <img> として本文に挿入する。
 */
import * as api from './api.js';
import * as editor from './editor.js';

const fileInput = document.getElementById('image-file-input');

export function init() {
  // ツールバーのボタン → ファイル選択
  document.getElementById('btn-image').addEventListener('click', () => {
    editor.saveSelection(); // ファイル選択ダイアログで選択位置が失われる前に退避
    fileInput.value = '';
    fileInput.click();
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    editor.restoreSelection();
    await insertImageFile(file);
  });
}

/** 画像ファイルを保存して本文に <img> を挿入する(paste.js からも使う) */
export async function insertImageFile(file) {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const ext = extensionOf(file);
  const url = await api.saveImage(buffer, ext);
  editor.insertHTML(`<img src="${url}" alt="">`);
}

/** MIMEタイプやファイル名から拡張子を決める */
function extensionOf(file) {
  const fromName = file.name && file.name.includes('.') ? file.name.split('.').pop() : '';
  const fromType = file.type.split('/').pop(); // 例: image/png → png
  return (fromName || fromType || 'png').toLowerCase();
}

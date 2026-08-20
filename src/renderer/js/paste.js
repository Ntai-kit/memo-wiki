/**
 * paste.js — 貼り付け・ドラッグ&ドロップの受け口
 *
 * 責務:
 *   - Ctrl+V やドロップで入ってきた内容を種類ごとに振り分ける
 *       画像       → images.js に渡して保存・挿入
 *       HTML       → sanitize.js で浄化してから挿入
 *       ただの文字 → ブラウザ標準の動作にまかせる
 *
 * 外部から入ってくる内容の入口をこのモジュール1つにまとめてあるので、
 * 「危険なものが入り込む経路」をここだけ見れば確認できる。
 */
import * as editor from './editor.js';
import * as images from './images.js';
import { sanitizeHTML } from './sanitize.js';

export function init() {
  const target = editor.element();
  target.addEventListener('paste', (event) => handle(event, event.clipboardData));
  target.addEventListener('dragover', (event) => event.preventDefault());
  target.addEventListener('drop', (event) => handle(event, event.dataTransfer));
}

/**
 * 貼り付け/ドロップの中身を振り分ける。
 * @param {Event} event
 * @param {DataTransfer} data クリップボード or ドロップされたデータ
 */
async function handle(event, data) {
  if (!data) return;

  // 1. 画像ファイルが含まれていれば画像として挿入する
  const file = imageFileFrom(data);
  if (file) {
    event.preventDefault();
    await images.insertImageFile(file);
    return;
  }

  // 2. HTMLなら浄化してから挿入する(標準の貼り付けは使わない)
  const html = data.getData('text/html');
  if (html) {
    event.preventDefault();
    editor.insertHTML(sanitizeHTML(html));
    return;
  }

  // 3. ただの文字は標準動作にまかせる(何もしない)
}

/** クリップボード/ドロップから画像ファイルを取り出す(無ければ null) */
function imageFileFrom(data) {
  const fromFiles = [...(data.files || [])].find((f) => f.type.startsWith('image/'));
  if (fromFiles) return fromFiles;

  const item = [...(data.items || [])].find((i) => i.type.startsWith('image/'));
  return item ? item.getAsFile() : null;
}

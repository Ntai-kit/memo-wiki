/**
 * cleanup.js — 使っていない画像の整理
 *
 * 責務:
 *   - どのページからも使われていない画像ファイルを探す
 *   - 見つけた画像を OS のごみ箱へ移す
 *
 * 画像は「戻せるように」わざと自動では消さない仕様になっている
 * (トップ画像を外したり、カードを消したりしても画像ファイルは残る)。
 * そのため長く使うと images/ が膨らむので、利用者が任意に整理できるようにする。
 *
 * 完全に削除せずごみ箱へ移すのは、整理したあとでも元に戻せるようにするためである。
 * 戻すときは、ごみ箱から元の場所(data/images)へ復元すればそのまま表示される。
 *
 * 「使われているか」の判定は storage.collectUsedImages が行う。
 * 保存前の編集中の内容も extraTexts として渡してもらい、使用中に含める。
 */
const path = require('path');

/**
 * 使っていない画像を探す。
 * @param {object} storage storage.js
 * @param {string[]} extraTexts 保存前の編集中の本文など
 * @returns {Array<{name: string, size: number}>}
 */
function findUnusedImages(storage, extraTexts = []) {
  const used = storage.collectUsedImages(onlyStrings(extraTexts));
  return storage.listImageFiles().filter((file) => !used.has(file.name));
}

/**
 * 使っていない画像をごみ箱へ移す。
 * 探し直してから移すので、確認から実行までの間に使われ始めた画像は移さない。
 *
 * @param {object} storage storage.js
 * @param {string[]} extraTexts 保存前の編集中の本文など
 * @param {(file: string) => Promise<void>} trash ごみ箱へ移す関数(テストで差し替える)
 * @returns {Promise<{count: number, bytes: number, failed: number}>}
 */
async function trashUnusedImages(storage, extraTexts = [], trash = moveToTrash) {
  const result = { count: 0, bytes: 0, failed: 0 };
  for (const file of findUnusedImages(storage, extraTexts)) {
    try {
      await trash(path.join(storage.getImagesDir(), file.name));
      result.count += 1;
      result.bytes += file.size;
    } catch (error) {
      console.warn(`[cleanup] ごみ箱へ移せませんでした: ${file.name}`, error.message);
      result.failed += 1;
    }
  }
  return result;
}

/** OS のごみ箱へ移す(electronのrequireは関数内で行い、素のNodeでテストできるようにする) */
function moveToTrash(file) {
  const { shell } = require('electron');
  return shell.trashItem(file);
}

/** 画面側から届いた値のうち、文字列だけを使う */
function onlyStrings(values) {
  return Array.isArray(values) ? values.filter((v) => typeof v === 'string') : [];
}

module.exports = { findUnusedImages, trashUnusedImages };

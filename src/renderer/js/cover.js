/**
 * cover.js — ページ上部のトップ画像(カバー)とサブタイトル
 *
 * 責務:
 *   - トップ画像の追加・変更・削除(すべてクリック操作)
 *   - トップ画像とサブタイトルの表示・取得
 *
 * 画像の実体は images/ に保存され、ページJSONには
 * "memo://images/..." のURLだけを持つ(本文中の画像と同じ扱い)。
 *
 * 「今どのページを編集しているか」は app.js が管理するため、
 * このモジュールは値の出し入れだけを担当し、保存はしない。
 * 変更があったときは onChange コールバックで app.js に知らせる。
 */
import * as api from './api.js';

const coverArea = document.getElementById('cover-area');
const coverImage = document.getElementById('cover-image');
const addBtn = document.getElementById('btn-cover-add');
const changeBtn = document.getElementById('btn-cover-change');
const removeBtn = document.getElementById('btn-cover-remove');
const fileInput = document.getElementById('cover-file-input');
const subtitleInput = document.getElementById('page-subtitle');

let coverUrl = ''; // 現在のページのトップ画像URL(空なら未設定)
let onChange = null; // 変更をapp.jsに知らせるコールバック

/**
 * 初期化。
 * @param {() => void} changeHandler 画像やサブタイトルが変わったときに呼ばれる
 */
export function init(changeHandler) {
  onChange = changeHandler || (() => {});

  // 「トップ画像を追加」「画像を変更」 → どちらもファイル選択を開く
  addBtn.addEventListener('click', () => fileInput.click());
  changeBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = ''; // 同じファイルを再選択できるようにする
    if (!file) return;
    const buffer = new Uint8Array(await file.arrayBuffer());
    const url = await api.saveImage(buffer, extensionOf(file));
    setCover(url);
    onChange();
  });

  // 「削除」 → 画像を外す(画像ファイル自体は残るので元に戻せる)
  removeBtn.addEventListener('click', () => {
    setCover('');
    onChange();
  });

  // サブタイトルの編集
  subtitleInput.addEventListener('input', () => onChange());
}

/** ページを開いたときに値を流し込む */
export function setPage({ cover = '', subtitle = '' }) {
  setCover(cover);
  subtitleInput.value = subtitle;
}

/** 現在のトップ画像URL */
export function getCover() {
  return coverUrl;
}

/** 現在のサブタイトル */
export function getSubtitle() {
  return subtitleInput.value.trim();
}

/** トップ画像を設定して表示を更新する(内部用) */
function setCover(url) {
  coverUrl = url || '';
  const hasCover = coverUrl !== '';
  coverArea.hidden = !hasCover;
  addBtn.hidden = hasCover; // 画像がある間は「追加」ボタンを隠す
  if (hasCover) coverImage.src = coverUrl;
}

/** MIMEタイプやファイル名から拡張子を決める */
function extensionOf(file) {
  const fromName = file.name && file.name.includes('.') ? file.name.split('.').pop() : '';
  const fromType = file.type.split('/').pop();
  return (fromName || fromType || 'png').toLowerCase();
}

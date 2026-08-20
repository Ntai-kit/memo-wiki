/**
 * whatsnew.js — 更新内容のお知らせ
 *
 * 責務:
 *   - 更新後の初回起動で、前回から今回までの更新内容を順番に見せる
 *   - 複数のバージョンをとばして更新した場合は、古いものから1つずつ表示する
 *
 * 更新内容そのものは changelog.js に、
 * 「前回のバージョン」の記録は main/whatsnew.js に分けてある。
 * このモジュールは表示と進行だけを担当する。
 *
 * 表示し終えたら「見た」と記録するので、次の起動では出ない。
 */
import * as api from './api.js';
import { entriesBetween } from './changelog.js';

const dialog = document.getElementById('whatsnew-dialog');
const versionEl = document.getElementById('whatsnew-version');
const dateEl = document.getElementById('whatsnew-date');
const listEl = document.getElementById('whatsnew-list');
const progressEl = document.getElementById('whatsnew-progress');
const nextBtn = document.getElementById('btn-whatsnew-next');
const closeBtn = document.getElementById('btn-whatsnew-close');

let entries = []; // 表示するバージョンの一覧(古い順)
let index = 0; // いま何件目を表示しているか

export function init() {
  nextBtn.addEventListener('click', showNext);
  closeBtn.addEventListener('click', finish);
}

/**
 * 更新があれば、その内容を順番に表示する。
 * 起動処理の最後に1回呼ぶ。
 * @returns {Promise<boolean>} 表示したら true(呼び出し側が他の案内と重ねないために使う)
 */
export async function showIfUpdated() {
  const [previous, current] = await Promise.all([api.previousVersion(), api.getVersion()]);
  entries = entriesBetween(previous, current);

  if (entries.length === 0) {
    // 新規インストール、または更新が無い。記録だけ更新して何も出さない
    await api.markVersionSeen();
    return false;
  }

  index = 0;
  render();
  dialog.showModal();
  return true;
}

/** 次のバージョンへ進む(最後まで来たら閉じる) */
function showNext() {
  if (index < entries.length - 1) {
    index += 1;
    render();
  } else {
    finish();
  }
}

/** 表示を終えて「見た」と記録する */
async function finish() {
  dialog.close();
  await api.markVersionSeen();
}

/** いま表示するバージョンの内容を画面に反映する */
function render() {
  const entry = entries[index];
  versionEl.textContent = `バージョン ${entry.version}`;
  dateEl.textContent = entry.date || '';

  listEl.innerHTML = '';
  for (const change of entry.changes) {
    const li = document.createElement('li');
    li.textContent = change;
    listEl.appendChild(li);
  }

  // 複数あるときだけ「1 / 3」のような進み具合を出す
  const multiple = entries.length > 1;
  progressEl.textContent = multiple ? `${index + 1} / ${entries.length}` : '';
  progressEl.hidden = !multiple;

  const isLast = index === entries.length - 1;
  nextBtn.hidden = isLast;
  closeBtn.hidden = !isLast;
}

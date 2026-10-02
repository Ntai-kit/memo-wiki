/**
 * folders.js — フォルダの選択欄と名前入力ダイアログ
 *
 * 責務:
 *   - ページ見出しにある「フォルダ」の選択欄に、フォルダの一覧を並べる
 *   - フォルダの名前を入力してもらうダイアログを出す
 *
 * Electron では window.prompt が使えないため、名前の入力は専用のダイアログで受け取る。
 * フォルダそのものの作成・削除は pages.js が行う。
 */
import * as api from './api.js';

const select = document.getElementById('page-folder');
const dialog = document.getElementById('folder-dialog');
const dialogTitle = document.getElementById('folder-dialog-title');
const nameInput = document.getElementById('folder-name');
const okBtn = document.getElementById('btn-folder-ok');
const cancelBtn = document.getElementById('btn-folder-cancel');

/**
 * 初期化。
 * @param {(folderId: string) => void} onSelect 選択欄でフォルダを選び直したとき
 */
export function init(onSelect) {
  select.addEventListener('change', () => onSelect(select.value));
}

/**
 * フォルダの一覧を読み直し、選択欄を作り直す。読み込んだ一覧を返す。
 * 入れ子のフォルダは「仕事 / 会議」のように上の階層からの道筋で表示する。
 */
export async function refresh() {
  const list = await api.listFolders();
  const current = select.value;
  select.innerHTML = '';
  select.appendChild(new Option('未分類', ''));
  const addChildren = (parentId, prefix) => {
    for (const folder of list.filter((f) => f.parentId === parentId)) {
      const label = prefix + folder.name;
      select.appendChild(new Option(label, folder.id));
      addChildren(folder.id, `${label} / `);
    }
  };
  addChildren('', '');
  // 選んでいたフォルダが消えていれば未分類になる
  select.value = list.some((f) => f.id === current) ? current : '';
  return list;
}

/** 選択欄で選ばれているフォルダID(未分類なら '') */
export function getSelected() {
  return select.value;
}

/** 選択欄を指定のフォルダにする(一覧に無いIDなら未分類) */
export function setSelected(folderId) {
  select.value = folderId || '';
  if (select.value !== (folderId || '')) select.value = '';
}

/**
 * フォルダの名前を入力してもらう。
 * やめたとき、または空のときは null を返す。
 * @param {{title: string, okLabel: string, initial?: string}} options
 * @returns {Promise<string|null>}
 */
export function askName({ title, okLabel, initial = '' }) {
  if (dialog.open) return Promise.resolve(null);
  dialogTitle.textContent = title;
  okBtn.textContent = okLabel;
  nameInput.value = initial;

  return new Promise((resolve) => {
    const finish = (value) => {
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      nameInput.removeEventListener('keydown', onKey);
      dialog.removeEventListener('close', onClose);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const onOk = () => finish(nameInput.value.trim() || null);
    const onCancel = () => finish(null);
    const onClose = () => finish(null); // Esc で閉じたとき
    const onKey = (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        onOk();
      }
    };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    nameInput.addEventListener('keydown', onKey);
    dialog.addEventListener('close', onClose);

    dialog.showModal();
    nameInput.select();
  });
}

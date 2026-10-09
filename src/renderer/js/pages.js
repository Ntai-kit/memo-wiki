/**
 * pages.js — サイドバーのページ一覧
 *
 * 責務:
 *   - 全ページ一覧の描画(フォルダごとにまとめ、開閉できる。フォルダは入れ子にできる)
 *   - 検索結果一覧の描画(search.js から呼ばれる)
 *   - ごみ箱の一覧の描画(元に戻す・完全に削除・自動で削除されるまでの日数)
 *   - 現在開いているページのハイライト
 *   - フォルダの作成・名前変更・削除と、ドラッグによるページ・フォルダの移動
 *
 * 一覧には「ページ」と「ごみ箱」の2つの表示があり、
 * サイドバー下部の「ごみ箱」ボタンで切り替える。
 * ページを開く・ごみ箱から戻すといった「いま開いているページ」に関わる操作は
 * app.js から受け取ったコールバックに任せる。
 */
import * as api from './api.js';
import * as folders from './folders.js';

const listEl = document.getElementById('page-list');
const listTitle = document.getElementById('list-title');
const newFolderBtn = document.getElementById('btn-new-folder');
const emptyTrashBtn = document.getElementById('btn-empty-trash');
const backBtn = document.getElementById('btn-trash-back');
const trashBtn = document.getElementById('btn-trash');
// 件数は文字の部分だけに書く(ボタン全体を書き換えるとアイコンまで消えるため)
const trashLabel = trashBtn.querySelector('.btn-label');

/** 閉じているフォルダを覚えておく場所(この端末の中だけの表示の好み) */
const COLLAPSED_KEY = 'memo-wiki.collapsedFolders';
/** ドラッグ中のページID・フォルダIDを運ぶときの種類名 */
const PAGE_DRAG = 'application/x-memo-page';
const FOLDER_DRAG = 'application/x-memo-folder';
/** 階層が1段深くなるごとに字下げする幅(px) */
const INDENT = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

let handlers = null;    // app.js から受け取る処理
let activeId = null;    // 現在開いているページID
let mode = 'pages';     // 'pages'(通常の一覧) | 'trash'(ごみ箱)
let collapsed = loadCollapsed();
let folderList = [];    // 最後に描画したときのフォルダ一覧(ドロップ先の判定に使う)
let trashDays = 30;     // ごみ箱のページが自動で削除されるまでの日数(main から受け取る)
/**
 * いま選んでいるフォルダ(空なら未分類 = 一番上の階層)。
 * 「新規ページ」「フォルダ」はこのフォルダの中に作る。
 * フォルダの見出しをクリックするか、ページを開くと、そのフォルダに切り替わる。
 */
let currentFolderId = '';

/**
 * 初期化。
 * @param {object} options
 * @param {(pageId: string) => void} options.open ページを開く
 * @param {(pageId: string, folderId: string) => void} options.moved ページを別のフォルダへ移した
 * @param {() => void} options.folderDeleted フォルダを消した(中のページの入り先が変わった)
 * @param {(pageId: string) => void} options.restore ごみ箱から戻す
 * @param {(pageId: string) => void} options.deleteForever 完全に削除する
 * @param {() => void} options.emptyTrash ごみ箱を空にする
 */
export function init(options) {
  handlers = options;
  newFolderBtn.addEventListener('click', createFolder);
  trashBtn.addEventListener('click', () => (mode === 'trash' ? showPages() : showTrash()));
  backBtn.addEventListener('click', showPages);
  emptyTrashBtn.addEventListener('click', () => handlers.emptyTrash());
  api.trashDays().then((days) => (trashDays = days));
}

/** いまの表示(ページ一覧 / ごみ箱)を描き直す */
export async function refresh() {
  await updateTrashCount();
  if (mode === 'trash') {
    renderTrash(await api.listTrash());
    return;
  }
  const [pages, list] = await Promise.all([api.listPages(), folders.refresh()]);
  folderList = list;
  renderGrouped(pages);
}

/** ページ一覧の表示に切り替える */
export async function showPages() {
  setMode('pages');
  await refresh();
}

/** ごみ箱の表示に切り替える */
export async function showTrash() {
  setMode('trash');
  await refresh();
}

/** 検索結果(スニペット付き)を描画する。フォルダには分けない */
export function showSearchResults(results) {
  setMode('pages');
  listEl.innerHTML = '';
  for (const item of results) listEl.appendChild(pageItem(item));
}

/** 現在開いているページを記録し、一覧のハイライトを更新する */
export function setActive(pageId) {
  activeId = pageId;
  for (const li of listEl.querySelectorAll('li[data-page-id]')) {
    li.classList.toggle('active', li.dataset.pageId === pageId);
  }
}

/** いま選んでいるフォルダのID(未分類なら '') */
export function getCurrentFolder() {
  return folderList.some((f) => f.id === currentFolderId) ? currentFolderId : '';
}

/** 選んでいるフォルダを切り替え、見出しのハイライトを更新する */
export function setCurrentFolder(folderId) {
  currentFolderId = folderId || '';
  for (const li of listEl.querySelectorAll('li.folder-row')) {
    li.classList.toggle('current', li.dataset.folderId === getCurrentFolder());
  }
}

/* ---------- 表示の切り替え ---------- */

function setMode(next) {
  mode = next;
  const inTrash = mode === 'trash';
  listTitle.textContent = inTrash ? 'ごみ箱' : 'ページ';
  newFolderBtn.hidden = inTrash;
  emptyTrashBtn.hidden = !inTrash;
  backBtn.hidden = !inTrash;
  trashBtn.classList.toggle('active', inTrash);
}

/** 下部の「ごみ箱」ボタンに件数を出す */
async function updateTrashCount() {
  const count = (await api.listTrash()).length;
  trashLabel.textContent = count > 0 ? `ごみ箱 ${count}` : 'ごみ箱';
  emptyTrashBtn.disabled = count === 0;
}

/* ---------- ページ一覧(フォルダごと) ---------- */

/**
 * フォルダの階層どおりにまとめて描画する。
 * フォルダが1つも無いうちは、これまでどおりの平らな一覧にする。
 */
function renderGrouped(pages) {
  listEl.innerHTML = '';
  const toItem = (p) => ({ id: p.id, title: p.title, snippet: p.subtitle || '' });

  if (folderList.length === 0) {
    for (const p of pages) listEl.appendChild(pageItem(toItem(p)));
    return;
  }

  const childFolders = groupBy(folderList, (f) => f.parentId);
  const pagesIn = groupBy(pages, (p) => p.folderId);
  // フォルダの中のページ数(中のフォルダに入っているページも数える)
  const total = (id) =>
    (pagesIn.get(id) || []).length +
    (childFolders.get(id) || []).reduce((sum, f) => sum + total(f.id), 0);

  const renderFolder = (folder, depth) => {
    const isOpen = !collapsed.has(folder.id);
    listEl.appendChild(folderHeader(folder, total(folder.id), isOpen, depth));
    if (!isOpen) return;
    for (const child of childFolders.get(folder.id) || []) renderFolder(child, depth + 1);
    for (const p of pagesIn.get(folder.id) || []) listEl.appendChild(pageItem(toItem(p), depth + 1));
  };
  for (const folder of childFolders.get('') || []) renderFolder(folder, 0);

  // フォルダに入っていないページ。見出しはページやフォルダを一番上に戻す先としても使う
  const unfiled = pagesIn.get('') || [];
  const isOpen = !collapsed.has('');
  listEl.appendChild(folderHeader({ id: '', name: '未分類' }, unfiled.length, isOpen, 0));
  if (isOpen) for (const p of unfiled) listEl.appendChild(pageItem(toItem(p), 1));
}

/**
 * フォルダの見出し行。
 * 見出しをクリックするとそのフォルダを選び、ダブルクリックで開閉する。
 * ページやフォルダをドロップすると、そのフォルダの中へ移す。
 */
function folderHeader(folder, count, isOpen, depth) {
  const li = document.createElement('li');
  li.className = 'folder-row';
  li.dataset.folderId = folder.id;
  li.style.paddingLeft = `${10 + depth * INDENT}px`;
  if (!folder.id) li.classList.add('unfiled');
  li.classList.toggle('current', folder.id === getCurrentFolder());

  // ▾/▸ は開いているかどうかの目印(開閉は見出しのダブルクリックで行う)
  const toggle = document.createElement('span');
  toggle.className = 'folder-toggle';
  toggle.textContent = isOpen ? '▾' : '▸';
  const label = document.createElement('span');
  label.className = 'folder-label';
  label.textContent = folder.name;
  label.title = folder.name;
  const countEl = document.createElement('span');
  countEl.className = 'folder-count';
  countEl.textContent = String(count);
  li.append(toggle, label, countEl);

  const actions = document.createElement('span');
  actions.className = 'folder-actions';
  if (folder.id) {
    actions.appendChild(actionButton('名前', 'フォルダの名前を変える', () => renameFolder(folder)));
    actions.appendChild(actionButton('×', 'フォルダを削除する(中身はひとつ上の階層へ移る)', () =>
      deleteFolder(folder)
    ));

    // 見出しをドラッグすると、フォルダごと別のフォルダへ移せる
    li.draggable = true;
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData(FOLDER_DRAG, folder.id);
      e.dataTransfer.effectAllowed = 'move';
    });
  }
  li.appendChild(actions);

  li.title = 'クリックで選ぶ / ダブルクリックで開閉';
  li.addEventListener('click', () => setCurrentFolder(folder.id));
  li.addEventListener('dblclick', () => toggleFolder(folder.id));
  acceptDrop(li, folder.id);
  return li;
}

/** ページの行。depth はフォルダの中に並べるときの深さ(0 なら字下げしない) */
function pageItem(item, depth = 0) {
  const li = document.createElement('li');
  li.dataset.pageId = item.id;
  if (depth > 0) li.style.paddingLeft = `${10 + depth * INDENT}px`;
  li.textContent = item.title;
  if (item.snippet) {
    const span = document.createElement('span');
    span.className = 'snippet';
    span.textContent = item.snippet;
    li.appendChild(span);
  }
  li.classList.toggle('active', item.id === activeId);
  li.addEventListener('click', () => handlers.open(item.id));

  // ドラッグしてフォルダの見出しに落とすと、そのフォルダへ移る
  li.draggable = true;
  li.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData(PAGE_DRAG, item.id);
    e.dataTransfer.effectAllowed = 'move';
  });
  return li;
}

/**
 * フォルダの見出しを、ページやフォルダを落とせる場所にする。
 * folderId が空(未分類の見出し)なら、ページは未分類へ、フォルダは一番上の階層へ移る。
 */
function acceptDrop(li, folderId) {
  const carries = (e) =>
    e.dataTransfer.types.includes(PAGE_DRAG) || e.dataTransfer.types.includes(FOLDER_DRAG);
  li.addEventListener('dragover', (e) => {
    if (!carries(e)) return;
    e.preventDefault();
    li.classList.add('drop-target');
  });
  li.addEventListener('dragleave', () => li.classList.remove('drop-target'));
  li.addEventListener('drop', async (e) => {
    li.classList.remove('drop-target');
    if (!carries(e)) return;
    e.preventDefault();

    const pageId = e.dataTransfer.getData(PAGE_DRAG);
    const movedFolderId = e.dataTransfer.getData(FOLDER_DRAG);
    if (pageId) {
      await api.movePage(pageId, folderId);
      handlers.moved(pageId, folderId);
    } else if (movedFolderId) {
      // 自分自身や、自分の中のフォルダへは移せないので何もしない
      if (folderId && isInside(folderId, movedFolderId)) return;
      await api.moveFolder(movedFolderId, folderId);
    }
    collapsed.delete(folderId); // 移した先が見えるように開いておく
    saveCollapsed();
    await refresh();
  });
}

/** folderId のフォルダが、ancestorId のフォルダ自身かその中にあれば true */
function isInside(folderId, ancestorId) {
  const byId = new Map(folderList.map((f) => [f.id, f]));
  const seen = new Set();
  for (let id = folderId; id && !seen.has(id); id = byId.get(id)?.parentId) {
    if (id === ancestorId) return true;
    seen.add(id);
  }
  return false;
}

function toggleFolder(folderId) {
  if (collapsed.has(folderId)) collapsed.delete(folderId);
  else collapsed.add(folderId);
  saveCollapsed();
  refresh();
}

/* ---------- フォルダの操作 ---------- */

/** いま選んでいるフォルダの中にフォルダを作る(未分類を選んでいれば一番上の階層) */
async function createFolder() {
  const parent = folderList.find((f) => f.id === getCurrentFolder());
  const name = await folders.askName({
    title: parent ? `「${parent.name}」の中に新しいフォルダ` : '新しいフォルダ',
    okLabel: '作る',
  });
  if (!name) return;
  await api.createFolder(name, parent ? parent.id : '');
  if (parent) {
    collapsed.delete(parent.id); // 作ったフォルダが見えるように開いておく
    saveCollapsed();
  }
  await refresh();
}

async function renameFolder(folder) {
  const name = await folders.askName({
    title: 'フォルダの名前を変える',
    okLabel: '変える',
    initial: folder.name,
  });
  if (!name || name === folder.name) return;
  await api.renameFolder(folder.id, name);
  await refresh();
}

/** フォルダを消す。中のページとフォルダは、ひとつ上の階層へ移る */
async function deleteFolder(folder) {
  const parent = folderList.find((f) => f.id === folder.parentId);
  const destination = parent ? `「${parent.name}」` : '「未分類」と一番上の階層';
  const ok = confirm(
    `フォルダ「${folder.name}」を削除しますか?\n中のページとフォルダは消えずに${destination}へ移ります。`
  );
  if (!ok) return;
  await api.deleteFolder(folder.id);
  if (currentFolderId === folder.id) currentFolderId = folder.parentId || ''; // 中身の移り先を選ぶ
  collapsed.delete(folder.id);
  saveCollapsed();
  await refresh();
  await handlers.folderDeleted();
}

/* ---------- ごみ箱 ---------- */

function renderTrash(items) {
  listEl.innerHTML = '';
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'list-empty';
    li.textContent = 'ごみ箱は空です';
    listEl.appendChild(li);
    return;
  }

  const note = document.createElement('li');
  note.className = 'list-note';
  note.textContent = `ごみ箱に入れて${trashDays}日たったページは、自動で完全に削除されます。`;
  listEl.appendChild(note);

  for (const item of items) {
    const li = pageItem({
      id: item.id,
      title: item.title,
      snippet: `あと${daysLeft(item.trashedAt)}日で自動削除`,
    });
    li.draggable = false; // ごみ箱からフォルダへは「元に戻す」で戻す
    li.classList.add('trash-item');
    const actions = document.createElement('span');
    actions.className = 'trash-actions';
    actions.appendChild(actionButton('元に戻す', 'ページ一覧に戻す', () => handlers.restore(item.id)));
    const deleteBtn = actionButton('完全に削除', '元に戻せなくなります', () =>
      handlers.deleteForever(item.id)
    );
    deleteBtn.classList.add('btn-danger'); // 元に戻せない操作なので赤い文字にする
    actions.appendChild(deleteBtn);
    li.appendChild(actions);
    listEl.appendChild(li);
  }
}

/** 自動で削除されるまでの残り日数(切り上げ。期限を過ぎていれば0) */
function daysLeft(trashedAt) {
  const deadline = Date.parse(trashedAt) + trashDays * DAY_MS;
  return Math.max(0, Math.ceil((deadline - Date.now()) / DAY_MS));
}

/* ---------- 共通 ---------- */

/** 配列をキーごとの Map にまとめる */
function groupBy(items, keyOf) {
  const map = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

/** 行の中の小さなボタン。押しても行のクリック(開く・開閉)は起こさない */
function actionButton(text, title, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = text;
  btn.title = title;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function loadCollapsed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function saveCollapsed() {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  } catch {
    // 覚えておけなくても、開閉そのものはできる
  }
}

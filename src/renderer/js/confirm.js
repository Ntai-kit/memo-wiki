/**
 * confirm.js — 確認ダイアログ
 *
 * Windows の Electron では、window.confirm を閉じたあとキーボードの入力先がページに戻らず、
 * ウィンドウを切り替えるまで文字が入らなくなる。そのため確認は専用のダイアログで受け取る。
 */

const dialog = document.getElementById('confirm-dialog');
const titleEl = document.getElementById('confirm-dialog-title');
const messageEl = document.getElementById('confirm-dialog-message');
const okBtn = document.getElementById('btn-confirm-ok');
const cancelBtn = document.getElementById('btn-confirm-cancel');

/**
 * 確認を出し、実行するなら true、やめるなら false を返す。
 * Enter だけで実行しないよう、最初は「やめる」にフォーカスを置く。
 * 閉じたら、開く前にフォーカスがあった場所へ戻す。
 * @param {{title: string, message: string, okLabel: string, danger?: boolean}} options
 * @returns {Promise<boolean>}
 */
export function ask({ title, message, okLabel, danger = false }) {
  if (dialog.open) return Promise.resolve(false);
  titleEl.textContent = title;
  messageEl.textContent = message;
  okBtn.textContent = okLabel;
  okBtn.classList.toggle('btn-danger', danger);
  okBtn.classList.toggle('btn-primary', !danger);
  const previousFocus = document.activeElement;

  return new Promise((resolve) => {
    const finish = (value) => {
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      dialog.removeEventListener('close', onClose);
      if (dialog.open) dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      resolve(value);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    const onClose = () => finish(false); // Esc で閉じたとき
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    dialog.addEventListener('close', onClose);

    dialog.showModal();
    cancelBtn.focus();
  });
}

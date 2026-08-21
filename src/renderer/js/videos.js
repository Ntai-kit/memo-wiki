/**
 * videos.js — 動画カードの作成と、古い動画埋め込みの置き換え
 *
 * 責務:
 *   - 動画のURLから「動画カード」を組み立てる
 *       ・ページ情報(タイトル・サムネイル)を取ってくる
 *       ・サムネイルはこちらに保存して、あとから通信しないようにする
 *   - 昔のバージョンで入れた動画の埋め込み(iframe)を、動画カードに置き換える
 *
 * なぜ動画をメモの中で再生しないのかは embeds.js の冒頭に書いてある。
 * 要点だけ言うと、パソコンの中で動くアプリの画面には
 * YouTubeが認める「身元(オリジン)」が存在せず、
 * 何をしてもエラー153になるためである。
 *
 * HTMLの組み立ては embeds.js、通信は api.js、
 * 本文への差し込みは editor.js と、役割を分けてある。
 */
import * as api from './api.js';
import * as editor from './editor.js';
import * as embeds from './embeds.js';

/**
 * 動画カードのHTMLを作る。
 *
 * ページ情報やサムネイルが取れなくてもカードは必ず作る
 * (通信できない環境でも動画を貼れるようにするため)。
 *
 * @param {string} url 動画のURL(動画ページでも埋め込み用でもよい)
 * @returns {Promise<string>} 挿入するHTML
 */
export async function buildCard(url) {
  const watchUrl = embeds.toWatchUrl(url);
  const meta = await safeMetadata(watchUrl);

  // サムネイルは「ページ情報にあるもの」→「URLから推測したもの」の順に試す
  const source = meta.image || embeds.guessThumbUrl(watchUrl);
  const thumb = source ? await safeDownload(source) : '';

  return embeds.buildVideoCardHTML({
    url: watchUrl,
    title: meta.title,
    siteName: meta.siteName,
    thumb,
  });
}

/**
 * 本文の中にある古い動画の埋め込みを、動画カードに置き換える。
 * ページを開いたあとに1回呼ぶ。
 *
 * 置き換えた結果は、そのページを次に保存したときにファイルへ反映される
 * (勝手に保存はしない)。
 *
 * @returns {Promise<number>} 置き換えた数
 */
export async function upgradeOldEmbeds() {
  const targets = findVideoEmbeds();
  if (targets.length === 0) return 0;

  for (const { element, url } of targets) {
    const html = await buildCard(url);
    // 置き換え中に利用者が別のページへ移動した場合は、もう触らない
    if (!element.isConnected) continue;
    // 埋め込みの後ろには既に段落があるので、カードの末尾の空段落は付けない
    element.outerHTML = embeds.withoutTrailingParagraph(html);
  }
  return targets.length;
}

/** 本文中の「動画の埋め込み」を集める */
function findVideoEmbeds() {
  const found = [];
  for (const element of editor.element().querySelectorAll('.embed-wrapper')) {
    const iframe = element.querySelector('iframe');
    const url = iframe ? iframe.getAttribute('src') || '' : '';
    if (url && embeds.isVideoUrl(url)) found.push({ element, url });
  }
  return found;
}

/** ページ情報の取得(失敗しても止まらない) */
async function safeMetadata(url) {
  try {
    return await api.fetchMetadata(url);
  } catch {
    return { title: '', image: '', siteName: '' };
  }
}

/** サムネイルの保存(失敗したら空文字。画像なしのカードになる) */
async function safeDownload(imageUrl) {
  try {
    return (await api.downloadImage(imageUrl)) || '';
  } catch {
    return '';
  }
}

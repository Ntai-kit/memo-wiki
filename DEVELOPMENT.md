# 開発者向けドキュメント

利用者向けの説明は [README.md](README.md)、
安全性の方針は [SECURITY.md](SECURITY.md) を参照。
このファイルは「作る側」が見るものをまとめてある。

## 動かす

Node.js(v18以上推奨)が必要である。

```bash
npm install   # 初回のみ(Electronをダウンロードする)
npm start     # アプリが起動する
```

開発中は自動アップデートが無効になる(更新情報が実行ファイルに埋め込まれていないため)。
異常ではない。

## 技術構成

- **Electron** — デスクトップアプリの土台
- **electron-builder** — インストーラの作成と配布
- **electron-updater** — 自動アップデート
- 依存はこれだけで、フレームワーク(React等)は使っていない。素のHTML/CSS/JavaScriptで書いてある

## コード構成(機能ごとにモジュール分割)

```
src/
├── main/                 # メインプロセス(Node.js側)
│   ├── main.js           # エントリポイント。ウィンドウ生成と各モジュールの初期化のみ
│   ├── storage.js        # ページ・画像のファイル入出力、検索、関連マップ用データの生成
│   ├── ipc.js            # レンダラーとの通信(IPCハンドラの登録)
│   ├── protocol.js       # memo:// スキームで画像を配信
│   ├── metadata.js       # リンクカード用のOGPメタデータ取得
│   ├── backup.js         # アップデート時の自動バックアップ
│   ├── whatsnew.js       # 前回起動時のバージョンの記録
│   └── updater.js        # 自動アップデート(GitHub Releasesの確認とダウンロード)
├── preload.js            # レンダラーに公開する安全なAPI(window.memoAPI)
└── renderer/             # 画面側
    ├── index.html        # 画面のレイアウト
    ├── styles.css        # スタイル
    └── js/
        ├── app.js        # まとめ役。状態管理と各モジュールの連携のみ
        ├── api.js        # window.memoAPI の薄いラッパー
        ├── editor.js     # 本文エディタ(contenteditable)の操作
        ├── cover.js      # トップ画像とサブタイトル
        ├── links.js      # リンク設定ダイアログとリンククリック処理
        ├── embeds.js     # リンクカード・iframe埋め込みのHTML生成
        ├── graph.js      # 関連マップの描画とマウス操作
        ├── graph-layout.js # 関連マップのノード配置計算(力学モデル)
        ├── images.js     # 画像の保存と挿入
        ├── paste.js      # 貼り付け・ドロップの受け口(内容を振り分ける)
        ├── sanitize.js   # 貼り付けHTMLの浄化(危険な要素を除去)
        ├── pages.js      # サイドバーのページ一覧
        ├── search.js     # 検索ボックス
        ├── guide.js      # 使い方ガイドの開閉(本文は index.html 内)
        ├── changelog.js  # 更新内容の一覧と、表示すべきバージョンの判定
        ├── whatsnew.js   # 更新内容のお知らせダイアログ
        ├── repaint.js    # ダイアログを閉じた跡が残る環境への対策
        └── updates.js    # バージョン表示と更新の通知バー
```

設計の方針は次の2つである。

- **1モジュール1責務**。各ファイルの冒頭コメントに担当範囲を書いてある
- **モジュール同士は直接呼び合わない**。やり取りは `app.js` がコールバックで橋渡しする

### 機能追加の手順

新しい機能(例: タグ付け)を追加する場合の典型的な流れ:

1. `storage.js` にデータ操作の関数を追加する
2. `ipc.js` にチャンネルを1行追加する(命名は `対象:操作`)
3. `preload.js` に対応するAPIを1行追加する
4. `renderer/js/` に新しいモジュール(例: `tags.js`)を作る
5. `app.js` の `main()` でそのモジュールを初期化する

### 埋め込み対応サイトの追加方法

`renderer/js/embeds.js` の `EMBED_RULES` 配列に
「URLのパターン」と「埋め込みURLへの変換」を1つ追加するだけでよい。

### 関連マップの見た目を調整する

- ノードの色・大きさ: `renderer/js/graph.js` の `COLORS` と `BASE_RADIUS` などの定数
- 配置の詰まり具合: `renderer/js/graph-layout.js` の `REPULSION`(反発)、
  `SPRING_LENGTH`(リンクの理想距離)などの定数

配置計算(`graph-layout.js`)は画面に依存しない純粋な計算なので、
描画を変えずにレイアウトだけ差し替えることもできる。

### 使い方ガイドの文面を直す

ガイドの本文は `renderer/index.html` の `<dialog id="guide-dialog">` に直接書いてある。
メモとして保存されるわけではないので、利用者が編集・削除することはなく、
検索結果や関連マップにも現れない。文面を直すときはそのダイアログ部分だけを編集すればよい。

なお、メモが1件も無いとき(初回起動)はこのガイドが自動で開く。

### 更新内容のお知らせ

更新後の初回起動で、前回のバージョンから今回までの変更点を古い順に1つずつ表示する。

- 文面: `renderer/js/changelog.js` の `CHANGELOG` 配列(新しい順に並べる)
- 表示: `renderer/js/whatsnew.js`
- 「前回のバージョン」の記録: `main/whatsnew.js`(`userData/last-seen-version.txt`)

**リリースのたびに `CHANGELOG` の先頭へ1件追加すること。**
利用者が読む文面なので、内部の用語ではなく「何ができるようになったか」で書く。

複数バージョンをとばして更新した場合(例: 1.4.0 → 1.7.0)は、
1.5.0 → 1.6.0 → 1.7.0 の順に「次へ」で送りながら表示される。
新規インストール時は何も表示せず、記録だけを行う。

### メニューバーについて

既定のメニューバー(File / Edit / View / Window / Help)は使わないので
`main.js` の `Menu.setApplicationMenu(null);` で非表示にしてある。
戻したい場合はこの行を消す。

## データの保存形式

保存先は `%APPDATA%\memo-wiki\data`(macOS/Linuxは `app.getPath('userData')` に準ずる)。

```
data/
├── pages/    # 1ページ = 1つのJSONファイル
│             #   { formatVersion, id, title, subtitle, cover, html, updatedAt }
└── images/   # 貼り付けた画像・トップ画像のファイル
```

本文中の画像は `memo://images/ファイル名` という相対的なURLで参照するため、
`data/` フォルダごとコピーすればそのまま移行できる。絶対パスは埋め込まない。

### 形式を変更するとき(移行処理)

旧バージョンで作ったファイルが読めなくならないよう、各ページに `formatVersion` を持たせてある。
形式を変えるときは `src/main/storage.js` の先頭で次の2つを行う。

1. `FORMAT_VERSION` を +1 する
2. `MIGRATIONS` に「旧形式 → 新形式」の変換関数を1つ追加する

これだけで、旧形式のファイルは読み込み時に自動変換される。
ディスク上のファイルは、そのページが保存されたタイミングで新形式に書き直される。

### 自動バックアップ

`backup.js` が、アプリのバージョンが前回起動時と変わっていたら
`data/` を丸ごと `backups/v旧バージョン-日時/` にコピーする(最新5世代を保持)。

## ビルド

```bash
npm run dist   # 公開せずに手元でexeを作る(release/ に出力)
```

生成物は `release/MemoWiki-Setup-<バージョン>.exe`。
自動更新に対応させるため、配布形式はインストーラ(NSIS)に統一している
(ポータブル版は仕組み上、自動更新できない)。

### 初回は確認画面あり、更新は無操作

インストーラは確認画面つき(`nsis.oneClick: false`)にしてある。
初回インストール時に誤って入れてしまうのを防ぐためである。

一方、**更新の適用時には画面を出さない**。これは
`main/updater.js` で `quitAndInstall(true, true)` と呼んでいるためで、
第1引数が「静かに適用する」、第2引数が「適用後に起動し直す」を意味する。
アプリ終了時に自動適用される経路も同様に画面を出さない。

つまり次のように使い分いている。

| 場面 | 画面 | 権限 |
|---|---|---|
| 初回インストール | 確認画面を表示(インストール先も選べる) | 不要 |
| 更新の適用 | 出さない | 不要 |

`perMachine: false` にしてあるためユーザー領域へのインストールとなり、
管理者権限の昇格が要らない。これは静かな更新を成立させるための条件でもある
(昇格が必要だとUACの確認画面が出てしまう)。

アイコンは `build/icon.ico` を差し替えれば変更できる(256x256を含むマルチサイズICO)。
ビルド設定は `package.json` の `build` セクションにまとまっている。

### 初回だけ必要な設定

`package.json` の `build.publish.owner` を自分のGitHubユーザー名にしておく。

```json
"publish": [{ "provider": "github", "owner": "自分のユーザー名", "repo": "memo-wiki" }]
```

## リリース(更新の公開)

### 推奨: タグを push する

`.github/workflows/release.yml` を用意してあるので、
バージョンを上げてタグを push するだけでよい。

```bash
# package.json の "version" を上げ、changelog.js に1件追加してから
git add -A && git commit -m "使い方ガイドを追加"
git tag v1.7.0
git push && git push origin v1.7.0
```

GitHubのWindows環境でビルドが走り、Releasesに下書きができる。
**Releasesページで Publish release を押すと配信開始**になり、
各PCのアプリが自動で気づいて更新する。

この方法なら自分のPCに公開用トークンを置かなくて済むため、安全である。

### 手元から直接公開する場合

`repo` 権限のトークンを環境変数に設定してから実行する。

```
setx GH_TOKEN あなたのトークン
npm run release
```

`setx` で設定した値は次に開いたコマンドプロンプトから有効になる。
トークンの扱いについては [SECURITY.md](SECURITY.md) の注意事項を必ず読むこと。

### 公開後の確認

Releasesページに次の3つが揃っていること。

- `MemoWiki-Setup-x.y.z.exe`
- `MemoWiki-Setup-x.y.z.exe.blockmap`
- `latest.yml` ← **これが無いと自動更新は動かない**

### 不具合を調べるとき

メニューバーを消してあるので、代わりに **Ctrl + Shift + I** で開発者ツールを開ける。
画面側のエラーはここのConsoleに出る。

### ダイアログに display を直接指定しないこと

`<dialog>` は閉じると自動で `display: none` になるが、
`#xxx-dialog { display: flex }` のように書くとその働きを打ち消してしまい、
**閉じたはずの中身が画面に残り続ける**(実際に一度この不具合を出した)。

中身を並べるための `display` は、必ず開いている状態に限定して書く。

```css
#guide-dialog[open] {
  display: flex;
  flex-direction: column;
}
```

### ダイアログの残像について

一部の環境(画面の拡大表示やグラフィック機能の組み合わせ)で、
ダイアログを閉じてもその見た目が画面に残ることがある。
要素自体は正しく閉じており、古い描画結果が消えていないだけである。

対策として `renderer/js/repaint.js` が、どのダイアログでも閉じた直後に

1. 画面側でわずかな変化を与えて描画をやり直させる
2. `webContents.invalidate()` でウィンドウ全体の再描画を要求する

の2段構えで描き直させている。
これでも残る場合は、`main.js` の先頭に `app.disableHardwareAcceleration();` を追加すると
描画をGPUに任せなくなるため確実に解消する(ただし全体の描画性能は落ちる)。

## テスト

自動テストのスイートは用意していない。変更したときは最低限、
`npm start` で起動して以下を確認する。

- メモの作成・保存・再読み込み
- ページ間リンクの作成と移動
- 画像の貼り付け(Ctrl+V)
- 関連マップの表示とノードのクリック
- 「更新を確認」ボタンが反応する

## 既知の制限

- 本文中のリンクは普通にクリックすると開く/移動する仕様のため、リンク自体を編集するには
  **Ctrl+クリック**(またはリンクを選択して `Ctrl+K`)を使う
- 書式設定に `document.execCommand` を使用している(非推奨APIだが、Electron/Chromiumでは安定して動作する)
- iframe埋め込みは、サイト側が埋め込みを禁止している場合(X-Frame-Options等)は表示されない
- リンクカードのサムネイルは元サイトのURLを参照しているため、オフライン時は画像部分だけ表示されない
- 関連マップに出るのは内部リンク(ページ同士のリンク)だけで、外部サイトへのリンクは含まれない
- 貼り付けたHTMLは安全のため一部の装飾(色・フォント・レイアウト指定)が落ちる

## ライセンス

GNU General Public License v3.0 以降(全文は [LICENSE](LICENSE))。
改変して配布する場合は、その改変版もソースを公開する必要がある。

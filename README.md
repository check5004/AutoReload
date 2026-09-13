# AutoReload

Chrome用の、混雑ページからの復旧監視とチケット購入の入力補助です。身内向けに GitHub Releases のZIPから手動インストールする構成で、ストア公開は不要です。

[ダウンロード](https://github.com/check5004/AutoReload/releases/latest) · [練習サイト](https://check5004.github.io/AutoReload/) · [導入・更新手順](docs/INSTALL.md) · [検証記録](docs/VALIDATION.md)

## 使える機能

- 拡張アイコンからドメインごとにON/OFF。ページ端の小さなパネルで手動開始・停止。
- 「つながりにくくなっています」等の混雑ページだけを、間隔を広げながら再読み込み。復旧後は停止。
- クリックで指定した入力欄・選択欄・チェック・遷移ボタンを記録。無効な発売前ボタンも対象にできます。
- IDだけに依存せず、ラベル・name・周辺の日時や席種で候補を再認識。複数一致は停止して利用者に戻します。
- `{{date}}`、`{{date+1}}`、`{{today+1}}`、`{{grade}}`、`{{name}}`、`{{email}}`、`{{quantity}}` の差し替え。
- 開始時刻予約、発売後に出現する項目の待機、実行しない対象プレビュー、操作の並べ替え。
- GitHub Releasesを1日1回確認。通知はポップアップ内だけ。7日間非表示・通知OFFにも対応。
- 前日準備・発売開始・混雑隔離・DOM変更を再現する、サーバー不要の静的な練習サイト。

## インストール

[詳しい導入・更新手順](docs/INSTALL.md)。ソースを使う場合は `chrome://extensions` → デベロッパーモード → 「パッケージ化されていない拡張機能を読み込む」で **extension/** を選ぶだけです。

設定はChrome内のローカルストレージに保存します。通信先は有効にしたサイトと、更新確認用の `api.github.com` だけです。氏名・入力値・閲覧履歴は更新確認に送信しません。クラウドのAI APIは使わず、項目認識は端末内の規則で行います。

## 最初の練習

```sh
node scripts/serve.mjs
```

表示されたローカルURLをChromeで開き、このドメインをONにします。[練習ガイド](tutorial/guide.html) の順で記録・実行できます。別ポートは環境変数 `PORT` で指定します。静的ファイルは **tutorial/** にあり、GitHub Pagesや任意の静的ホストにそのまま置けます。

復旧監視だけ使う場合は、混雑ページで「復旧監視を開始」を押します。サイト固有の混雑文言・復旧文言も設定可能です。復旧の判定が難しいサイトは、事前に復旧後の見出しを「復旧の目印を覚える」で指定してください。

## 配布とGitHub Actions

想定リポジトリは **check5004/AutoReload** です。新しいリポジトリへこのフォルダーをpushしてください。

```sh
git init -b main
git add .
git commit -m "Build AutoReload extension and rehearsal lab"
git remote add origin https://github.com/check5004/AutoReload.git
git push -u origin main
```

GitHub側の初回設定：

1. Actions を有効にする。
2. Settings → Pages → Build and deployment の Source を **GitHub Actions** にする。
3. `Tutorial Pages` を実行すると **tutorial/** を公開する。以後mainへの対象ファイル更新で自動反映。
4. 拡張機能のリリースは次のタグpushで実行する。

```sh
git tag v0.1.0
git push origin v0.1.0
```

`Release` は構文・ロジック・実ブラウザーのテスト後、配布ZIPとSHA256を作り、ドラフトに全ファイルを添付してからリリースを公開します。途中失敗したドラフトは再実行できます。公開済みリリースは上書きしません。個人用アクセストークンは不要で、標準の `GITHUB_TOKEN` を使います。

更新時は **package.json** と **extension/manifest.json** のversionを同じ値に変更し、**CHANGELOG.md** と **docs/RELEASE-NOTES.md** を更新して、対応する `vX.Y.Z` タグをpushしてください。タグとversionが違う場合は失敗します。

配布物には実行中の `GITHUB_REPOSITORY` から更新先が埋め込まれます。`manifest.json` の **keyを変更しないでください**。これはIDを固定する公開鍵であり、秘密鍵ではありません。

## 開発・検証

実行時の外部依存はありません。Node.js 22以降：

```sh
node scripts/check.mjs
node --test tests/*.test.mjs
node scripts/package.mjs
```

配布ファイルは **artifacts/** に生成します。

ブラウザーの統合テスト（開発用の依存のみ）：

```sh
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
node --test tests/browser.e2e.mjs
```

統合テストは分離した一時プロファイルのChromiumへ実際の拡張機能を読み込みます。テスト用コピーにlocalhostの権限を付与するので、ネイティブのChrome権限確認ダイアログそのものは自動テスト対象外です。利用者のChromeプロファイルは使いません。

## 対応範囲

- 購入・注文・申込の最終確定、決済、パスワード・カード・認証コード入力は手動です。確定ボタンの抑止は文字に基づくため、記録する操作を必ず確認してください。
- CAPTCHAや順番待ちの回避機能はありません。それらを検知したら停止します。
- HTTP(S)のメインフレームが対象。別ドメイン、iframe、閉じたShadow DOM、ブラウザー自身の通信エラー画面、独自の複雑なウィジェットは自動操作しません。
- 同じドメインで同時に動くのは1タブ。再読み込み・同一ドメインのページ遷移・サービスワーカー再起動では進捗を維持し、Chrome再起動後は自動再開しません。
- 予約時刻は端末時計を使用します。スリープ・バックグラウンドタブのタイマー制限・メモリセーバーによって遅延するため、時刻の厳密な保証や購入成功の保証はありません。
- 入力データは平文で端末内に保存されます。JSONの書き出しには入力値も含まれます。
- 練習サイトは単一利用者のシミュレーションです。在庫競争、販売サイトのサーバー・認証・決済の再現はしません。

実装時の参照：[Chromeの権限](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)、[Scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)、[Alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms)、[Playwrightの拡張機能テスト](https://playwright.dev/docs/chrome-extensions)、[GitHub PagesのActions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

MIT License

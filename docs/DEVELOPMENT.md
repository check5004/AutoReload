# 開発・検証・配布

[利用者向けREADMEに戻る](../README.md)

このページはコードを変更する人向けです。拡張機能を使うだけなら、Node.jsやGitのインストールは必要ありません。

## 構成

| 場所 | 内容 |
| --- | --- |
| `extension/` | Chromeに読み込む拡張機能。実行時の外部依存なし。 |
| `extension/tutorial/` | 拡張機能に同梱する練習ページとガイド。 |
| `docs/` | 利用者向け・開発者向けの文書。 |
| `docs/images/` | READMEのSVG原稿と、埋め込み用のPNG。 |
| `docs/site/` | 旧Web版のURLで表示する導入案内。練習の動作には不要。 |
| `scripts/` | 構文・配布の確認、ZIP生成など。 |
| `tests/` | Node.jsのテストと、Chromiumの統合テスト。 |

ソースから動かす場合は、`chrome://extensions` → デベロッパーモード →「パッケージ化されていない拡張機能を読み込む」で `extension/` を選びます。ビルドは不要です。

読み込み・ピン留め・再読み込みの手順は、[Chrome公式の説明](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)でも確認できます。

## ローカル検証

Node.js 22以降で、リポジトリのルートから実行します。

```sh
node scripts/check.mjs
node --test tests/*.test.mjs
node scripts/package.mjs
```

配布物は `artifacts/` に生成します。ブラウザーの統合テストには開発用のPlaywrightを使います。

```sh
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
node --test tests/browser.e2e.mjs
```

統合テストは一時的なプロファイルのChromiumへ拡張機能を読み込みます。利用者のChromeプロファイルは使いません。内蔵練習ページは配布用Manifestのまま、オフライン・追加のホスト権限なしで検証します。通常のHTTPページへの挿入は、localhostの権限を付けたテスト用コピーとHTTPフィクスチャで検証します。Chromeのネイティブ権限確認ダイアログは自動テスト対象外です。

実施したシナリオは[検証記録](VALIDATION.md)を参照してください。

## GitHub Actionsでリリースする

公開リポジトリは `check5004/AutoReload` です。

1. `package.json` と `extension/manifest.json` のversionを同じ値に変更します。
2. `CHANGELOG.md` と `docs/RELEASE-NOTES.md` を更新し、必要なテストを通します。
3. 変更をコミットしてpushします。
4. versionに対応する `vX.Y.Z` タグをpushします。以下は **0.2.0のときの例** です。公開済みのタグは再利用しません。

```sh
git tag v0.2.0
git push origin v0.2.0
```

`Release` ワークフローは構文・ロジック・実ブラウザーのテスト後、拡張機能ZIPとSHA256を作成します。ドラフトに全ファイルを添付してから公開します。途中失敗したドラフトは再実行でき、公開済みリリースは上書きしません。標準の `GITHUB_TOKEN` を使うため、個人用アクセストークンは不要です。タグとversionが一致しない場合は失敗します。

配布ZIPは `AutoReload-vX.Y.Z.zip` の1つで、練習ページも含みます。実行中の `GITHUB_REPOSITORY` が更新先として埋め込まれます。`manifest.json` の **keyは変更しないでください** 。拡張機能IDを固定する公開鍵で、秘密鍵ではありません。

`Validate` はmainへのpushとPRでWindows / Ubuntuの検証、Ubuntuの実ブラウザーテストを行います。`Download Guide Pages` は `docs/site/` の導入案内をGitHub Pagesへ公開します。フォーク先で案内を公開する場合は、Settings → PagesのSourceを **GitHub Actions** に設定してください。

## 実装上の範囲

- 実サイトはHTTP(S)のメインフレームが対象。別ドメイン、iframe、閉じたShadow DOM、ブラウザー自身の通信エラー画面、独自の複雑なウィジェットは自動操作しません。
- 権限はChromeのホスト単位、設定はorigin（スキーム・ホスト・ポート）単位です。内蔵練習ページは独立した `autoreload:practice` に保存します。
- 同じoriginで同時に動くのは1タブです。再読み込み・同一originのページ遷移・サービスワーカー再起動で進捗を維持し、Chrome再起動後は自動再開しません。
- 項目認識はラベル・name・ID・周辺の日時や席種に基づき、クラウドのAI APIは使いません。複数候補が残る場合は停止します。
- 購入確定・機密項目の抑止は文字や属性に基づくため、あらゆるサイトでの認識を保証しません。
- 設定の入力値は平文で端末内に保存します。JSONのエクスポートにも含まれます。

## 図版を編集する

`docs/images/` のSVGが編集用原稿です。同名のPNGをREADMEに埋め込んでいます。図版だけでなく本文と代替テキストにも手順を書き、画像が表示されなくても読めるようにしています。

SVGは外部フォント・外部画像を参照しません。日本語フォントのある環境で、次のコマンドからPNGに変換できます。使用するPlaywrightはブラウザーテストと共通です。

```sh
node scripts/render-readme-images.mjs
```

変換後は実際の画像を開き、文字の欠けや重なりがないか確認してください。

## 参照

- [Chromeの権限](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [Scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [Alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms)
- [Playwrightの拡張機能テスト](https://playwright.dev/docs/chrome-extensions)
- [GitHub PagesのActions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

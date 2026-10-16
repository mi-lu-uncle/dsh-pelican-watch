# @mi-lu-uncle/dsh-pelican-watch

[English](README.md) | [简体中文](README.zh-CN.md) | 日本語

DeepSeek Harness（DSH）向けの**コミュニティプラグイン**：同じモデルに対して固定間隔で**長期のモデル品質（劣化）プローブ**を実行します。

- **定時作画** — 30 分ごと（設定可能）に、**指定した 1 つのモデル**へ「自転車に乗るペリカン」を 1 枚のインライン SVG として含む単一 HTML ページで描かせるリクエストを送ります。
- **スキル・ツール不使用** — 毎回 `chat/completions` の素のリクエストです。ツール定義なし、エージェントループなし。測るのはモデルそのもので、ローカルスキルには依存しません。
- **ギャラリーパネル** — メインサイドバー（および Settings）の「Pelican Watch」に保存された各作品をインライン SVG プレビュー付きで一覧表示。カードをクリックするとサンドボックス化された全ページビューアが開き、モデル / 時刻 / 所要時間を確認できます。「今すぐ描く」ボタンもあり。
- **有界な履歴** — 最新 12 枚を保持（設定可能）。同じお題・同じモデルを数日続けると、劣化は構造の悪化、拒否（保存され「SVG なし」バッジが付く）、所要時間の増大としてそのまま現れます。

## インストール

GitHub リポジトリからのインストールを推奨します：

```sh
dsh plugin --profile desktop add https://github.com/mi-lu-uncle/dsh-pelican-watch.git
```

ローカルパスや tarball でも可能です：

```sh
dsh plugin --profile desktop add /absolute/path/to/dsh-pelican-watch
```

注意：`link:` 方式でインストールしたプラグインは HMR 監視の対象外のため、`lib/index.js` や `lib/client.js` を編集した後はアプリの再起動が必要です。

## 設定

デフォルトは一般的な構成に合わせてあります。上書きする場合はプロファイルパッチ（`cordis.patch.yml`）の `pelican-watch` 行で指定します：

```yaml
- id: pelican-watch
  config:
    model: glm-5.3-flash                 # プローブ対象のモデル
    baseURL: https://taotoken.net/api/v1 # OpenAI 互換エンドポイント
    apiKeyEnv: TAOTOKEN_API_KEY          # API キーを保持する環境変数…
    # apiKey: sk-…                       # …またはここに直接記述
    intervalMinutes: 30                  # 作画間隔
    maxImages: 12                        # 履歴の深さ（30 分間隔なら約 6 時間）
    dir: ~/.dsh/pelican-watch            # 保存ディレクトリ
    runOnStart: true                     # 起動後約 8 秒で最初の 1 枚を描く
    # temperature: 0.7                   # 任意。デフォルトではパラメータ自体を送らない
    # prompt: …                          # ベンチマーク文面の変更は最終手段
```

ベンチマークのプロンプトは意図的に固定しています。変更すると履歴の比較ができなくなるため、`prompt` は最終手段と考えてください。

## API キー

キーは呼び出し時に解決されます。まず `process.env[apiKeyEnv]`、次に設定値の `apiKey`。どちらも無い場合はその回の作画をスキップし、パネルに理由（`缺少 API Key：…`）を表示します。どちらかを設定すれば、次回の定時作画から正常に動作します。

## ストレージ

作品は `dir`（デフォルト `~/.dsh/pelican-watch`）に保存されます：

| ファイル | 役割 |
|---|---|
| `<時刻>_<モデル>.html` | 生成されたページ本体。先頭行にメタコメント（モデル・時刻・所要時間・SVG 検出の有無） |
| `<時刻>_<モデル>.svg` | 抽出したインライン SVG。パネルの `<img>` プレビュー用 |

ここにあるファイルを手動で削除しても安全です。パネルは常にディスク上の実態を表示します。

## プライバシーと安全性

- すべてのルートは他のプラグインと同様に同一オリジン検証を行います。
- 生成ページは `text/plain` として返され、権限なしのサンドボックス iframe（`sandbox=""`）内でレンダリングされるため、モデル出力がアプリのオリジンでスクリプトを実行することはありません。SVG プレビューには `x-content-type-options: nosniff` を付与しています。

## 構成

| ファイル | 役割 |
|---|---|
| `lib/index.js` | Host 側：スケジューラ、ストレージ、`/api/pelican-watch/*` ルート |
| `lib/client.js` | Client 側：ギャラリーパネル（React） |
| `cordis.patch.yml` | このパッケージを 1 つの host 行としてマウントするバンドルパッチ |
| `package.json` | npm メタデータ + `dsh.bundle`/`dsh.client`/`dsh.compatibility` |
| `test/pelican.test.mjs` | オフラインテスト：ヘルパー、ストレージのライフサイクル、フェイク fetch でのルート配線 |

## テスト

```sh
node test/pelican.test.mjs
```

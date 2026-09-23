# 共通プロフィール・セーブ同期基盤 設計仕様

## 目的

`plzsayyes3/for_my_sons` に、各アプリが共通利用できるプロフィール・ローカルセーブ・Private GitHub同期の基盤を段階導入する。子どもは端末に設定された現在プロフィールで通常利用し、プロフィール切替・認証情報・復元・競合解決は親PINで保護された設定画面から行う。

本仕様は既存Private save repositoryと `my-storage-note/objects/projects/for-my-sons.md` を照合した設計であり、どちらか一方に既存データを合わせて破壊的に置き換えるものではない。

## 正本と現行形式

### Private save repository

現在の `schema.json` は `schemaVersion: 1`、プロフィール順序情報、およびセーブ形状を定義する。現行の `saves/` にはプロフィールごとのJSONがあり、`version`、`profileId`、`displayName`、`updatedAt`、`revision`、`stageProgress`、`wallet`、`characters`、`math`、`gacha` 等を持つ。

照合で確認した注意点:

- 実セーブはschemaに記載された項目を持つ。
- 実セーブにはさらに数値の `profileOrder` があるが、現在の `saveShape` には記載されていない。
- schema側にはプロフィール順序情報が別途ある。
- 現在の実セーブはversion 1で、進捗配列・履歴配列は初期状態だった。

この差分を意図せず削除・再解釈しない。読み書きでは未知の既存フィールドを保持し、Private repoの実ファイルを形式変更する場合は、互換手順・schema更新・復元可能なバックアップを別途用意する。

### 設計ノート

設計ノートの正本方針を採用する。

- 通常利用時の正本は端末IndexedDB。
- Private `For-My-Sons-save` repositoryは同期・バックアップ・復元先。
- PAT/tokenは端末にのみ保存し、公開repository、save repositoryのファイル、設計ノート、分析・ログサービスに保存しない。
- アプリはGitHubの詳細を直接扱わず、共通層を利用する。
- 子どもの作品は編集可能な元データを正本にし、STL等は派生出力として扱う。

## プライバシーとプロフィール列挙

- 公開repositoryのHTML、JavaScript、テスト、ドキュメントに個人名・具体的プロフィールID・プロフィール表示名・セーブ実データ・tokenを含めない。
- 公開コードにはPrivate repositoryの接続先と一般的な形式定義だけを置き、プロフィール一覧は認証後にPrivate repoから取得する。
- 一覧順はschemaの順序情報、各プロフィール情報は対応する `saves/<profileId>.json` から構成する。IDはPrivate repoから得たものを検証して使い、ソースコードへ列挙しない。
- プロフィール表示名は親PIN下の管理UIで取得・表示する。通常のゲーム画面は `currentProfileId` のみを使い、プロフィール一覧や自由な切替UIを表示しない。
- PrivateデータはDOMの `textContent` 等で表示し、HTMLとして解釈しない。

## 認証情報

- 親PINからWeb Crypto APIで鍵を導出し、tokenはAES-GCMで暗号化して端末IndexedDBに保存する。暗号化形式にはアルゴリズム版、salt、nonceを含め、将来の鍵導出方式変更を可能にする。
- 復号済みtokenはGitHub通信中のメモリに限り、URL、リクエスト本文、ログ、例外メッセージ、同期データには入れない。
- tokenはPrivate repository専用の最小権限Fine-grained PATを前提とし、読み込み・書き込みに必要な範囲に限定する。token自体は端末間同期しない。
- 認証ヘッダーを送る通信先を `github.com` / `api.github.com` のPrivate save repository操作に限定し、他ホスト・公開repositoryへは決して転送しない。
- 親PINは管理UIのアクセス制御であり、同一オリジンの悪意あるスクリプトに対する完全なセキュリティ境界ではない。復号中は同一サイトのJavaScriptからtoken利用が可能であることを明示する。PIN暗号化は保存時の保護であって、XSS対策の代替ではない。
- 現在のGitHub PagesプロジェクトURLは同一アカウントの他プロジェクトと同じ `*.github.io` オリジン上にある。URLパスが違ってもIndexedDBの境界にはならないため、この共有オリジン上ではtokenの永続保存を有効にしない。[GitHub Pages URL](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) / [IndexedDB same-origin boundary](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Basic_Terminology)
- token永続化を有効にする前提条件として、他の公開プロジェクトとホスト名が異なる専用オリジン（例: 独自ドメイン）へ移行する。ホスト名が未決定・未検証なら、同期はtokenをメモリ内だけで受け取る一時運用に限定するか、無効のままにする。
- 専用オリジンでも同一オリジンJavaScriptは復号後のtokenを利用できる。サードパーティscriptを読み込まず、認証付きfetchをGitHub API allowlistに閉じる。
- 親PINの強度とオフライン総当たり耐性を考慮し、暗号化エンベロープの版、KDF、salt、iteration/work factorを定義・検証する。PIN暗号化を高度な端末侵害への完全な保護とは表現しない。
- GitHub REST APIはブラウザーからのCORSリクエストをサポートしている。実通信では認証・CORS・API制限・オフライン時の挙動を統合試験する。[GitHubのCORS説明](https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests)

## 共通層

### `profile-manager`

- Private repoからプロフィール一覧を取得・検証・キャッシュする。
- `currentProfileId` を端末ローカルに保持する。
- 親PINで保護された設定内で一覧、プロフィール切替、プロフィール追加・変更、復元操作を提供する。
- アプリ起動時に不変の `profileId` をセッションへ渡す。別画面でプロフィールを切り替えても、開いたままのアプリが新プロフィールへ誤保存しない。

### `parent-lock`

- 親PINの設定・検証、ロック状態、token暗号化・復号を担当する。
- 生PINや平文tokenを保存しない。tokenをアプリやSave APIへ返さず、GitHub通信層に限定して利用させる。

### `save-store`

- オフライン利用可能なローカルIndexedDBを読み書きする。
- APIは必須の `profileId` と `appId` で名前空間を分離する。概念APIは `get(profileId, appId, key)` / `put(profileId, appId, key, value)`。
- 既存アプリのIndexedDBやLocal Storageを初期化・削除しない。旧データの移行成功と復元確認前に元データを消さない。
- 保存は同期より先に完了させ、同期状態はpending / synced / conflict / errorとしてローカルに保持する。

### `github-sync`

- Private repo向けのGitHub REST通信を集約する。API tokenの復号利用者はこの層に限定する。
- schema、プロフィール列挙、`saves/<profileId>.json` の読み書き、二進ファイルの同期、SHA/revision比較、競合処理を担当する。
- GET/PUT等の対象パスを検証し、APIのエラーや通信失敗をローカル状態へ反映する。

## セーブ形式と互換性

- 現行のトップレベルセーブ項目は保持し、既存ゲーム・学習データを別形式へ一括移動しない。
- 新規のアプリ別データは `apps[appId]` 名前空間に追加し、各アプリに `dataVersion` とデータ本体を持たせる。
- `apps` 導入時はPrivate repoのschemaを更新して形状・version規則を明記する。既存 `schemaVersion` とレコード `version` を混同せず、version 1のセーブを引き続き読み込めるようにする。
- 実データに存在する `profileOrder` は既存拡張フィールドとして読み書きで保持する。schema更新時にその意味を明記し、既存値を公開側で再生成しない。
- わんこ大戦争の `wankoGameProgressV1` 等の旧端末データは、親がプロフィールを選択した後に対象プロフィールの `apps` 領域へコピーする。コピー元は移行・同期検証が完了するまで保持する。
- わんこ作品等の既存Blobは同期設計を確認してから移行対象を決める。既存Supabaseの作品同期をこの基盤へ暗黙に置換しない。

## 同期・競合・復元

- ローカル保存を先に確定し、ネット利用可能時に自動同期する。親設定には手動同期・再試行を用意する。
- 同一プロフィールのJSONを更新するときは、直近のGitHub blob SHAとレコード `revision` を確認して書く。成功時にrevisionとupdatedAtを更新する。
- 競合時にlast-write-winsで上書きしない。別 `appId` の独立データを安全に再ベースできる場合だけ統合し、同一アプリの競合は両候補を保持して親設定で選択できるようにする。
- 復元は対象プロフィール・端末上の現在データ・復元元revisionを確認し、明示確認後に行う。復元直前のローカル状態を戻せるようにする。
- 複数ファイルの作品は参照先のバイナリを先に同期し、参照を含むJSONを後で同期する。不完全な参照を公開・確定しない。

## バイナリ作品

- 3D作品はプロフィール名前空間の下に作品IDごとのディレクトリを置き、編集可能なproject JSONを正本として保存する。STLとthumbnailは任意の派生・表示ファイルとする。
- セーブJSONやアプリデータは、Private repo内の安定した相対パスでバイナリを参照する。
- GitHub APIのサイズ・rate limitに応じて、バイナリ同期上限とユーザー向けエラーを定義する。大きな作品の保存先を変更する場合は別設計を要求する。

## 既存プロフィール未割当データの導入

- 初回のみ親設定からPrivate repoを認証してプロフィール一覧を読み込む。
- 既存端末にプロフィール未割当のゲーム進行・作品がある場合、親が移行先を明示選択する。
- 配列順・ファイル順から自動で人物へ割り当てない。
- 移行前のバックアップ、移行件数のプレビュー、移行後の再読込検証を行い、旧ローカルデータは削除しない。
- 以後は端末に保存した現在プロフィールを自動利用し、プロフィールの変更は親PIN内に限定する。

## 段階導入

1. 現行schemaと保存ファイルの互換テストを作り、schema更新（`apps` と既存 `profileOrder` の明文化）を別途レビューする。
2. 専用オリジンを設定・公開し、現在の他プロジェクトとhostが異なることを検証する。移行完了前はtoken永続化を無効にする。
3. Parent Lockと端末内token暗号化、Private repoからの動的プロフィール取得を実装する。公開データにプロフィール固有値を入れない検査を加える。
4. プロフィール別ローカルSave APIとpending/conflict状態を実装する。まずはテスト用プロフィールデータで検証する。
5. GitHub同期・SHA/revision競合・明示復元を実装する。プロフィールごとにバックアップを確認しながら有効化する。
6. 既存アプリを一つずつ移行する。第一候補はわんこ大戦争の進行データ。既存アプリの保存形式を一度に変更しない。
7. 残るアプリ・画像・3D作品を個別に追加し、手動同期・自動同期・オフライン復帰を検証する。

## 検証要件

- 実データと同じ形の合成fixtureを使い、プロフィールIDや表示名は一般化した値のみをテストに使用する。
- schema version 1と新schemaの双方で読込でき、`profileOrder` 等の未知フィールドをラウンドトリップで保持する。
- 公開repoのソース、ビルド成果物、テスト出力にプロフィール具体値、平文token、Private save JSONがないことを検査する。
- API呼び出しテストでGitHub以外の宛先に認証ヘッダーが送られないこと、URL/ログ/例外にtokenが含まれないことを検査する。
- PIN暗号化・正しいPINでの復号・誤PIN・破損暗号文・salt/nonce更新・ロック後のメモリ破棄を検査する。
- オフライン時のローカル保存、復帰後の同期、stale SHA、同一アプリ競合、重複同期、復元とロールバックを検査する。
- 既存 IndexedDB/Local Storage のデータが移行前後で維持されることを検査する。

## 受け入れ条件

- 公開repoにはプロフィールの具体値、個人名、token、セーブ実データが存在しない。
- プロフィール一覧はPrivate repoから動的に取得され、公開コードへのプロフィール追加変更を必要としない。
- tokenは親PINで暗号化して端末内に保存され、GitHub認証時以外に送信・記録されない。公開repo宛て通信には決して載らない。
- token永続保存は専用オリジンでのみ有効化され、共有 `*.github.io` オリジン上では無効。
- ローカルIndexedDBを通常利用の正本として使い、Private repo同期が失敗してもセーブを失わない。
- 現行schemaと実ファイル差分を保持し、既存セーブを読み書き後も復元できる。
- プロフィール切替後にアプリ間でデータが混ざらず、競合時に無断上書きがない。
- 既存アプリの保存・作品同期は、個別に検証するまで破壊・置換しない。

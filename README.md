# shift-management-app

## データ管理 (Firebase)

このアプリはFirebase Authentication(メール/パスワード)とCloud Firestoreでデータを管理しています。

- `index.html` 内の `firebaseConfig`(空欄)に、Firebaseコンソール「プロジェクトの設定」→「マイアプリ」で取得できる値を貼り付けてください。
- ログインには、Firebase Authenticationの「Users」タブで発行したメールアドレス・パスワードを使用します。
- Firestore Security Rules(`firestore.rules`)は `main` ブランチへのpush時にGitHub Actionsで自動デプロイされます。デプロイには、リポジトリシークレット `FIREBASE_SERVICE_ACCOUNT`(サービスアカウントJSON)の登録と、`.firebaserc` の `default` プロジェクトIDの設定が必要です。

## スポットワーカー(店舗に属さない日雇いスタッフ)

- 通常のスタッフ・管理者と同様に、Firebase Authenticationの「Users」タブでスポットワーカー用のログインアカウント(メールアドレス・パスワード)を発行してください。
- アプリ内「⑦ スポットワーカー管理」タブから、そのメールアドレスと氏名を登録すると、そのアカウントでログインした際に通常の管理画面の代わりに「全店舗の募集中の空きシフト一覧」だけを閲覧・立候補できる専用画面が表示されます。
- スポットワーカーのアカウントは `stores/*` や `meta/*`(時給・スタッフ名簿など)には一切アクセスできず、安全な項目のみをミラーした `openShiftPostings` コレクションの読み取りと、自分自身の立候補欄への書き込みのみが許可されます(`firestore.rules` 参照)。

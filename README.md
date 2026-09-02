# shift-management-app

## データ管理 (Firebase)

このアプリはFirebase Authentication(メール/パスワード)とCloud Firestoreでデータを管理しています。

- `index.html` 内の `firebaseConfig`(空欄)に、Firebaseコンソール「プロジェクトの設定」→「マイアプリ」で取得できる値を貼り付けてください。
- ログインには、Firebase Authenticationの「Users」タブで発行したメールアドレス・パスワードを使用します。
- Firestore Security Rules(`firestore.rules`)は `main` ブランチへのpush時にGitHub Actionsで自動デプロイされます。デプロイには、リポジトリシークレット `FIREBASE_SERVICE_ACCOUNT`(サービスアカウントJSON)の登録と、`.firebaserc` の `default` プロジェクトIDの設定が必要です。

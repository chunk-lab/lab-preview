# lab-preview
chunk-lab/lab の確認用の置き場(コードは lab にある)。

- lab にプッシュしたときだけ、変わったブランチを組み立て → 本物のブラウザで点検(`tools/smoke.mjs`)→ 点検OKのものだけ公開する
- polish: https://chunk-lab.github.io/lab-preview/town/ ・ /town3d/ ・ /apps/<id>/
- ほかのブランチ: https://chunk-lab.github.io/lab-preview/b/<ブランチ名>/town/
- 一覧(いつ・どの commit・点検OKか): https://chunk-lab.github.io/lab-preview/
- 公開した中身は `site` ブランチ(履歴は残さず毎回1つ)。くわしくは `.github/workflows/preview.yml` の先頭

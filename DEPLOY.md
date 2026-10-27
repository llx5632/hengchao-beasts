# 部署到 GitHub Pages

当前仓库：https://github.com/llx5632/hengchao-beasts

发布后访问：https://llx5632.github.io/hengchao-beasts/

`web-game/` 本身就是 Git 仓库，请在 `D:\GDD\web-game` 中执行命令。上传后，仓库根目录应直接包含 `.github/`、`deploy/`、`dist/` 和 `package.json`。

## 首次上传

先在仓库 Settings → Pages → Build and deployment 中，将 Source 设为 **GitHub Actions**。免费账号使用公开仓库。

在 PowerShell 中执行：

```powershell
Set-Location D:\GDD\web-game
npm.cmd test
npm.cmd run build
git remote add origin https://github.com/llx5632/hengchao-beasts.git
git add .github deploy dist scripts test package.json README.md DEPLOY.md .gitignore
git commit -m "Prepare current game for GitHub Pages"
git push -u origin main
```

如已添加 origin，用 `git remote -v` 检查；地址正确时跳过 `git remote add`。首次推送可能要求通过浏览器登录 GitHub。

到仓库 Actions 查看 **Deploy game to GitHub Pages**，绿色成功后再打开站点。如果此前未选择 GitHub Actions，设置好后在 Actions 中手动运行此工作流。

## 以后更新

```powershell
Set-Location D:\GDD\web-game
npm.cmd test
npm.cmd run build
git add .github deploy dist scripts test package.json README.md DEPLOY.md .gitignore
git commit -m "Update game"
git push
```

`deploy/` 是随代码提交的预构建产物；Actions 检查规则后直接发布它。每次改动后必须重新运行 build。卡面修改后先执行 `python scripts/compress-art.py 1024 85`（需要 Pillow），再 build。`deploy-art/` 为本机中间产物，不入库；现有卡图已包含在 `deploy/`。

构建会将最新脚本、样式和十五张卡图打包到同一版本目录，并使用相对路径，兼容 `/hengchao-beasts/`。不要直接上传 `dist/`，它的本机卡图路由依赖预览服务。

GitHub Pages 托管玩家对 AI 的静态游戏。收藏、对局仍保存于各自浏览器；此发布方式不提供账号或联网对战。

官方说明：https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

---

# 备选：部署到 Cloudflare Pages（私有仓库 + 公开站点）

游戏站点已预构建在 `deploy/` 目录，Cloudflare Pages **无需构建命令**，直接托管即可。

## 一次性设置

1. 在 GitHub 创建**私有**仓库（如 `hengchao-beasts`），然后：
   ```bash
   git remote add origin https://github.com/<你的用户名>/hengchao-beasts.git
   git push -u origin main
   ```
2. 登录 [dash.cloudflare.com](https://dash.cloudflare.com)（免费账户即可）：
   - Workers & Pages → Create → Pages → **Connect to Git** → 授权并选择该私有仓库
   - 构建设置：
     - Framework preset: **None**
     - Build command: **留空**
     - Build output directory: **`deploy`**
   - Save and Deploy
3. 完成后得到 `https://<项目名>.pages.dev` 的公开链接，任何人可访问；源码仍只在私有仓库里。

## 以后更新版本

改完代码后在本机执行：

```bash
python scripts/compress-art.py 1024 85   # 卡面有变动时才需要
node scripts/build-deploy.mjs            # 生成新的 deploy/v<时间戳>/ 目录
git add -A && git commit -m "update" && git push
```

推送后 Cloudflare Pages 会自动重新发布（新版本目录名不同，无 CDN 缓存问题）。

## 备注

- `dist/` 是源码，`deploy/` 是构建产物；二者都入库，保证 CI 端零构建。
- `deploy-art/`（压缩 WebP）为中间产物，不入库，可随时用 compress-art.py 重新生成。

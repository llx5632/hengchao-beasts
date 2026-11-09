# 部署到 GitHub Pages

当前仓库：https://github.com/llx5632/hengchao-beasts

发布后访问：https://llx5632.github.io/hengchao-beasts/

`web-game/` 本身就是 Git 仓库，请在 `D:\GDD\web-game` 中执行命令。上传后，仓库根目录应直接包含 `.github/`、`deploy/`、`dist/` 和 `package.json`。

## 当前发布分工（2026-11-06用户更新）

发布前完成本地桌面和手机端交互验收，以及现有规则回归、原图验收、部署资源检查和隔离检出检查；按本次明确上线授权执行发布。一键发布保留测试、构建、check:deploy和check:clean门禁，并新增本地test:browser门禁；浏览器检查失败会在提交、推送前停止。首次使用需npm.cmd ci及可用Edge／Playwright Chromium，详见README。

发布后，助手确认GitHub Actions部署成功，记录提交、部署版本、工作流结果和本地验收证据，更新进度文档即可结束任务。线上浏览器交互、资源下载及哈希比对等站点测试由用户自行进行，助手不再主动追加或等待用户测试完成。没有用户反馈时记为“已部署上线，线上测试由用户进行”，不声称线上测试通过；用户后续另行要求线上排查时按当次任务处理。历史线上核验记录保留，此约定不构成后续卡牌的提前发布授权。

## 首次上传

先在仓库 Settings → Pages → Build and deployment 中，将 Source 设为 **GitHub Actions**。免费账号使用公开仓库。

在 PowerShell 中执行：

```powershell
Set-Location D:\GDD\web-game
npm.cmd test
npm.cmd run build
npm.cmd run check:deploy
npm.cmd run check:clean
npm.cmd run test:browser
git remote add origin https://github.com/llx5632/hengchao-beasts.git
git add .github deploy dist scripts test e2e playwright.config.mjs package.json package-lock.json README.md DEPLOY.md .gitignore
git commit -m "Prepare current game for GitHub Pages"
git push -u origin main
```

如已添加 origin，用 `git remote -v` 检查；地址正确时跳过 `git remote add`。首次推送可能要求通过浏览器登录 GitHub。

到仓库 Actions 查看 **Deploy game to GitHub Pages**，绿色成功后再打开站点。如果此前未选择 GitHub Actions，设置好后在 Actions 中手动运行此工作流。

## 以后更新

推荐直接双击项目根目录的 **`一键发布.cmd`**。首先选择是否更新图片资源：输入 **`1`** 会从当前卡面重新生成部署用 WebP，成功后再输入提交标题；输入其他内容或直接回车会跳过图片更新，直接进入提交标题。标题直接回车则取消提交和推送。脚本会自动读取 Windows 系统代理、检查远程分支、运行测试、重新打包、提交并推送，随后由 GitHub Actions 自动发布。窗口会保留执行结果，按任意键关闭。

保持现有代理软件运行；Git 已配置的代理或环境变量优先。首次认证或登录过期时可能需要按 GitHub 提示登录。推送成功后，以 Actions 的绿色成功状态为发布完成标志。

自动提交范围为 `.github/`、`deploy/`、`dist/`、`scripts/`、`test/`、`e2e/`，以及 `playwright.config.mjs`、`package-lock.json`、`package.json`、`README.md`、`DEPLOY.md`、`.gitignore`、`server.mjs` 和启动脚本；`qa/` 截图不会自动加入。测试、构建、远程同步检查或推送失败时会停止，不会强制覆盖远程；推送失败后可重新运行，之前的本地提交仍保留。

选择更新图片时需要 Python 和 Pillow；缺少依赖或压缩失败会停止发布。Pillow 在同一个 Python 环境中通常只需安装一次：`python -m pip install Pillow`，脚本不会每次安装。换用其他 Python 环境后需在新环境安装。跳过图片更新时不需要 Python 或 Pillow。图片更新只处理现有卡面映射中的卡牌，不会自动将候选卡加入卡池。

也可以手动执行：

```powershell
Set-Location D:\GDD\web-game
npm.cmd test
npm.cmd run build
npm.cmd run check:deploy
npm.cmd run check:clean
npm.cmd run test:browser
git add .github deploy dist scripts test e2e playwright.config.mjs package.json package-lock.json README.md DEPLOY.md .gitignore
git commit -m "Update game"
git push
```

`deploy/` 是随代码提交的预构建产物；Actions检查规则、部署资源及本地桌面／手机浏览器冒烟后才上传发布。浏览器依赖用npm ci锁定安装，CI使用Chromium；失败报告、截图和trace保留7天。所有浏览器请求仅访问回环地址的部署包，不执行线上站点测试。每次改动后必须重新运行 build。使用一键发布时，卡面修改后在开头输入 `1`；手动发布时先执行 `python scripts/compress-art.py 1024 85`（需要 Pillow），再 build。`deploy-art/` 为本机中间产物，不入库；现有卡图已包含在 `deploy/`。

2026-11-04起，规则测试与资产验收分开：`npm.cmd test`只依赖仓库内文件；`npm.cmd run check:art`在本机检查GDD原始PNG（可附卡牌ID，如`npm.cmd run check:art -- jiejing`），不在CI运行。构建后须依次执行`npm.cmd run check:deploy`和`npm.cmd run check:clean`；后者仅复制发布范围内文件到临时隔离目录，重跑全量测试及部署检查，不携带GDD原图、deploy-art或QA资料，结束后清理临时目录。一键发布已自动串联这两项，任何失败均在提交、推送前停止；GitHub Actions也会在上传前检查已提交部署资源。

手动发布同样必须在build后、git add前执行这两项。新增检查不能读取`../卡牌`等仓库外路径，也不能以跳过测试解决CI环境缺文件；先区分本地创作资料与真正需要部署的资产。

构建会将最新脚本、样式和当前卡面映射中的全部卡图打包到同一版本目录（数量以当前运行配置为准，状态见[主文档当前状态](../衡潮群岛项目文档.md#current-status)），并使用相对路径，兼容 `/hengchao-beasts/`。不要直接上传 `dist/`，它的本机卡图路由依赖预览服务。

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

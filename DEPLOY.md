# 部署到 Cloudflare Pages（私有仓库 + 公开站点）

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

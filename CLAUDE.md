# algo-viz · 项目须知

算法可视化实验室，线上 **algo.fim.ai**。Vite + React + TS + react-router，交互全 SVG 手写、零图表库。

## 部署（线上 algo.fim.ai）

**本地构建 + rsync 静态产物**，服务器不构建。aws-hk 是共享生产机（7.6G 内存跑着十几个容器，含 fim-one 全家桶），在上面构建的风险是内存尖峰把邻居 OOM 掉，不只是自己失败。这也是三个前端项目（algo-viz / linalg-to-attention / llm-from-scratch）的统一做法。改完代码四步：

```bash
git add -A && git commit                          # ① 先提交：部署不走 git，不提交就没有留痕
pnpm build                                        # 本地出 dist/（prerender 顺带写 sitemap.xml + robots.txt）
rsync -az --delete --exclude '.DS_Store' dist/ aws-hk:~/algo-viz/dist/
ssh aws-hk 'sudo docker restart algo-viz'         # bind-mount 的 nginx 容器重启读新内容
```

关键事实与坑：

- **提交是部署的前提**（2026-07-27 用户裁定，algo-viz / linalg-to-attention / llm-from-scratch 三个项目都适用）。部署链路完全不经过 git，「已上线」和「已入库」是两件独立的事，不先提交就会出现线上代码在仓库里查无此物。部署完顺手确认 `git status` 干净。
- 服务器 `~/algo-viz` 里那个 `.git` **停在 2026-07-08，是旧方案的残留**，与线上内容无关，别拿它当代码已入库的证据。

- 服务器主机 alias `aws-hk`；容器名 `algo-viz`（`nginx:1.27-alpine`），监听 `127.0.0.1:5194`，公网由服务器上的 nginx 反代 `algo.fim.ai`。
- 容器是 **bind-mount** 起的：`~/algo-viz/dist → /usr/share/nginx/html`、`~/algo-viz/nginx.conf → /etc/nginx/conf.d/default.conf`。所以 dist 一 rsync 上去内容立即生效，restart 只是为了让 nginx 重读配置。
- **`--exclude '.DS_Store'` 别省**：Finder 逛过 `dist/` 就会在里面留一个，rsync 照单送、nginx 照单公开（实测容器里访问 `/.DS_Store` 会返回 200 + 文件内容）。
- **改了 `nginx.conf` 要单独送**：上面三条命令只同步 dist。配置变更要 `scp nginx.conf aws-hk:~/algo-viz/nginx.conf` 再 restart，否则线上还是旧配置。改完先在本地拿一次性容器验一遍再送：
  `docker run --rm -p 8817:80 -v "$PWD/dist:/usr/share/nginx/html:ro" -v "$PWD/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.27-alpine`
- **不要用服务器上的 `~/algo-viz/deploy.sh`**：那是「服务器端 `docker build`」的备选方案，内存紧会 OOM；当前生产用的是上面的 bind-mount + rsync，不是 compose/Dockerfile。
- SSH 偶发 `banner exchange` / `connection reset`，是瞬时的，重试 1~2 次即可（可加 `-o ConnectTimeout=25 -o ServerAliveInterval=5`）。

## 每页分享卡片（OG）

- 纯客户端 SPA，社交抓取器不跑 JS，所以每页 OG 必须在**构建期**焊进静态 HTML。
- `scripts/prerender-og.mjs`（build 脚本末尾自动跑）读 `src/catalog.ts` 的 live 算法，为每个生成 `dist/a/<slug>/index.html`，覆盖 `<title>`/描述/`canonical`/`og:`/`twitter:`。加新 live 页无需改脚本，catalog 是唯一数据源。
- **OG 漏替换会构建失败，不用靠人记**：脚本有四道自检——index.html 少了任何一个待替换的 meta、catalog 里 slug 重复（会互相覆盖文件）、某页 title/hook 为空、成品里还剩着站级兜底文案，任何一条不满足就抛错，`pnpm build` 当场中断。分享卡片是只有别人转发时才看得见的东西，漏了不报错，所以卡在构建期。
- nginx 用 `try_files $uri $uri/index.html =404;` + `error_page 404 /index.html;` 让深链接直接命中预渲染文件、零跳转，同时让不存在的地址真的返回 404（响应体仍是 SPA 壳，前端渲染 404 页）。**别改回 `$uri/`**——那会 301 跳到带斜杠 URL；**也别把兜底改回 `/index.html`**——那会让所有拼错的地址返回 200，搜索引擎当正经页面收录。
- `scripts/prerender-og.mjs` 同时写 `dist/sitemap.xml` 和 `dist/robots.txt`，数据源同样是 catalog，加页不用改脚本。
- 站级兜底 OG + 品牌卡片图在 `index.html` 和 `public/og-cover.png`（1200×630，绝对 URL 指向 algo.fim.ai）。

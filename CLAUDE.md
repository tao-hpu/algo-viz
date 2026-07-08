# algo-viz · 项目须知

算法可视化实验室，线上 **algo.fim.ai**。Vite + React + TS + react-router，交互全 SVG 手写、零图表库。

## 部署（线上 algo.fim.ai）

**本地构建 + rsync 静态产物**，服务器不构建（内存紧，会 OOM）。改完代码三步：

```bash
pnpm build                                        # 本地出 dist/（含 prerender 的每页 OG）
rsync -az --delete dist/ aws-hk:~/algo-viz/dist/  # 送静态产物
ssh aws-hk 'sudo docker restart algo-viz'         # bind-mount 的 nginx 容器重启读新内容
```

关键事实与坑：

- 服务器主机 alias `aws-hk`；容器名 `algo-viz`（`nginx:1.27-alpine`），监听 `127.0.0.1:5194`，公网由服务器上的 nginx 反代 `algo.fim.ai`。
- 容器是 **bind-mount** 起的：`~/algo-viz/dist → /usr/share/nginx/html`、`~/algo-viz/nginx.conf → /etc/nginx/conf.d/default.conf`。所以 dist 一 rsync 上去内容立即生效，restart 只是为了让 nginx 重读配置。
- **改了 `nginx.conf` 要单独送**：上面三条命令只同步 dist。配置变更要 `scp nginx.conf aws-hk:~/algo-viz/nginx.conf` 再 restart，否则线上还是旧配置。
- **不要用服务器上的 `~/algo-viz/deploy.sh`**：那是「服务器端 `docker build`」的备选方案，内存紧会 OOM；当前生产用的是上面的 bind-mount + rsync，不是 compose/Dockerfile。
- SSH 偶发 `banner exchange` / `connection reset`，是瞬时的，重试 1~2 次即可（可加 `-o ConnectTimeout=25 -o ServerAliveInterval=5`）。

## 每页分享卡片（OG）

- 纯客户端 SPA，社交抓取器不跑 JS，所以每页 OG 必须在**构建期**焊进静态 HTML。
- `scripts/prerender-og.mjs`（build 脚本末尾自动跑）读 `src/catalog.ts` 的 live 算法，为每个生成 `dist/a/<slug>/index.html`，覆盖 `<title>`/描述/`og:`/`twitter:`。加新 live 页无需改脚本，catalog 是唯一数据源。
- nginx 用 `try_files $uri $uri/index.html /index.html;` 让深链接直接命中预渲染文件、零跳转。**别改回 `$uri/`**——那会 301 跳到带斜杠 URL。
- 站级兜底 OG + 品牌卡片图在 `index.html` 和 `public/og-cover.png`（1200×630，绝对 URL 指向 algo.fim.ai）。

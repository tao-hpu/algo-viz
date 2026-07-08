# algo-viz ｜ 算法可视化实验室

> 每个算法拆成一张能亲手拨动的图：改参数、看几何当场变，再一句话把它焊到现实里。
> **一本边学边长的活笔记**——没做完的先在首页留个虚线位子。

**🔗 在线 → [algo.fim.ai](https://algo.fim.ai)**

这不是教材，是我边学边画的实验笔记。风格：暖白方格纸、朱红一色贯穿交互、拖一拖比看十遍公式管用。和 [`linalg-to-attention`](https://l2a.fim.ai)（预科课）同架构、不同气质——那边是打磨好的线性课程，这边是散点式、慢慢生长的算法合集。

## 已上线

- **雅可比矩阵** — 弯曲的映射凑近看就是一个矩阵：拖红点选位置、缩小方块，看真·像怎么和 J 的线性近似贴到一起。

（其余排序 / 图 / 优化等以 TODO 卡片挂在首页，慢慢补。）

## 本地开发

```bash
pnpm install
pnpm dev        # http://localhost:5192
pnpm build      # 产物在 dist/
```

## 加一个新算法

1. 往 `src/catalog.ts` 加一条（`status: 'live'`）
2. 写 `src/pages/<Name>.tsx`，用 `AlgoShell` 包一层
3. 在 `src/App.tsx` 挂一条 `/a/<slug>` 路由

## 部署

线上 [algo.fim.ai](https://algo.fim.ai) 走**本地构建 + 静态托管**（服务器内存紧，不在服务器上构建）：

```bash
pnpm build                                          # 本地出 dist/
rsync -az --delete dist/ aws-hk:~/algo-viz/dist/    # 送静态产物
ssh aws-hk 'sudo docker restart algo-viz'           # nginx 容器 bind-mount，重启读新 dist
```

服务器上 `nginx:1.27-alpine` 容器 bind-mount `dist/` 与 `nginx.conf`，跑在 `127.0.0.1:5194`，公网由 nginx 反代 `algo.fim.ai`。仓库里的 `Dockerfile`/`docker-compose.yml` 是「服务器端源码构建」的备选方案（当前未用）。

## 技术栈

Vite + React + TypeScript + react-router。交互可视化全部 SVG 手写，零图表库依赖。

---

© 2026 FIM Labs · MIT

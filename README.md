# algo-viz ｜ 算法可视化实验室

> 每个算法拆成一张能亲手拨动的图：改参数、看几何当场变，再一句话把它焊到现实里。
> **一本边学边长的活笔记**：从「导数是什么」一路排到梯度下降、快排和最短路。

**🔗 在线 → [algo.fim.ai](https://algo.fim.ai)**

这不是教材，是我边学边画的实验笔记。风格：暖白方格纸、朱红一色贯穿交互、拖一拖比看十遍公式管用。和 [`linalg-to-attention`](https://l2a.fim.ai)（预科课）同架构、不同气质——那边是打磨好的线性课程，这边是散点式、慢慢生长的算法合集。

## 已上线

**数学基础 · 直觉扫盲**：导数是什么、次方一家人、求导词典、偏导数（三维盒子里切两刀）、单位圆与三角函数、矩阵乘向量、局部线性化。

**微分与几何**

- **雅可比矩阵**：弯曲的映射凑近看就是一个矩阵。拖红点选位置、缩小方块，看真·像怎么和 J 的线性近似贴到一起。
- **梯度场**：拖动红点，看梯度箭头永远垂直于等高线；转一圈方向盘，看方向导数按 cos 起落，最陡的那一个方向就是梯度自己。
- **泰勒展开**：阶数滑块从 0 推到 8，多项式一层层裹住曲线；`1/(1−x)` 那张图能看见收敛半径怎么把逼近卡死。
- **反向传播**：一张能逐帧走的计算图。正向算值、反向沿边乘局部导数，一趟拿到全部 6 个梯度，旁边并排放着中心差分的数值梯度当场对账。

**优化**

- **梯度下降**：等高线上滚小球。学习率拖大，狭长碗里的之字形一眼可见，再大就直接弹出去发散。
- **动量法**：同起点同学习率，左右两条轨迹同步跑。β 拖到 0，动量法变回梯度下降。

**排序**

- **快速排序**：柱状图 + 分区动画。「已排好（或逆序）的输入 + 取末尾做基准」当场把比较次数顶到 n(n−1)/2、递归深度打到 n−1。
- **归并排序**：自底向上一层层合并，红绿两段落进输出缓冲。换任何输入，层数都不变。

**图**

- **广度 / 深度优先**：同一份代码，只差「从队列哪头取」。下方画出队列本身，出口箭头换一头就换了算法。
- **最短路 · Dijkstra**：边权切成全 1，它就退化成 BFS。dist 表跟着帧在动。

**自然中的图样**

- **黄金角与向日葵**：137.5° 不是被存起来的常数，是「新种子挤进最大空隙」这条局部规则的不动点。顺带纠了鹦鹉螺和蜻蜓翅膀两个流传很广的说法。
- **Voronoi 剖分**：拖点实时重算格子，翻过来就是 Delaunay，再叠一条 Lloyd 松弛就收敛成六边形。

**前沿现场**

- **挂谷猜想**：针转一圈扫过的面积可以是 0，维数却一分不能少。含 Besicovitch 切片构造、Pál 接头，以及 2025 年三维证明的来龙去脉。

## 本地开发

```bash
pnpm install
pnpm dev        # http://localhost:5292
pnpm build      # 产物在 dist/（末尾自动跑 prerender：每页 OG + sitemap.xml + robots.txt）
```

## 加一个新算法

1. 往 `src/catalog.ts` 加一条（`status: 'live'`）
2. 写 `src/pages/<Name>.tsx`，用 `AlgoShell` 包一层
3. 在 `src/App.tsx` 挂一条 `/a/<slug>` 路由

## 部署

线上 [algo.fim.ai](https://algo.fim.ai) 走**本地构建 + 静态托管**（服务器内存紧，不在服务器上构建）：

```bash
git add -A && git commit                            # 部署不走 git，不提交就没有留痕
pnpm build                                          # 本地出 dist/
rsync -az --delete --exclude '.DS_Store' dist/ aws-hk:~/algo-viz/dist/
ssh aws-hk 'sudo docker restart algo-viz'           # nginx 容器 bind-mount，重启读新 dist
```

`--exclude '.DS_Store'` 不是洁癖：Finder 逛过 `dist/` 就会在里面留一个，rsync 会照单送上去，nginx 会照单公开。
改了 `nginx.conf` 要单独送：`scp nginx.conf aws-hk:~/algo-viz/nginx.conf` 再 restart，上面三条只同步 dist。

服务器上 `nginx:1.27-alpine` 容器 bind-mount `dist/` 与 `nginx.conf`，跑在 `127.0.0.1:5194`，公网由 nginx 反代 `algo.fim.ai`。仓库里的 `Dockerfile`/`docker-compose.yml` 是「服务器端源码构建」的备选方案（当前未用）。

## 技术栈

Vite + React + TypeScript + react-router。交互可视化全部 SVG 手写，零图表库依赖。

---

© 2026 FIM Labs · MIT

// 全站唯一的算法清单 —— 首页卡片网格、顶栏、页内导航都从这里读。
// 加新算法 = 往这里加一条 + 写对应页面组件 + 在 App.tsx 挂一条路由。
//
// 这是一本「慢慢长出来」的实验笔记：planned 的条目会以虚线 TODO 卡片
// 出现在首页——未完成也好看，没做完不丢人。
//
// 分类从「数学基础」→ 应用算法，由浅入深排。level 是软难度标签（入门/进阶），
// 只给小白一个路标，不做硬解锁。

export type AlgoStatus = 'live' | 'planned'
export type AlgoLevel = '入门' | '进阶'

export interface Algo {
  slug: string          // 路由：/a/<slug>
  title: string
  hook: string          // 这个算法回答的「一句话直觉」
  status: AlgoStatus
  level?: AlgoLevel      // 软难度标签（可选）
  todo?: string         // planned 时首页显示的手写小注
}

export interface Category {
  name: string
  blurb: string
  algos: Algo[]
}

export const catalog: Category[] = [
  {
    name: '数学基础 · 直觉扫盲',
    blurb: '从零到一。看不懂后面的公式？多半是这里某个字母没焊住。',
    algos: [
      { slug: 'derivative', title: '导数是什么', hook: '「多高」和「多陡」是两回事：位置 vs 速度。', status: 'planned', level: '入门', todo: '切线斜率 + 拖点看陡度' },
      { slug: 'powers', title: '次方一家人', hook: '底数/指数/幂/平方/立方；xⁿ 和 eˣ 谁涨得快？', status: 'planned', level: '入门', todo: '拖指数看 2ⁿ 爆炸' },
      { slug: 'deriv-rules', title: '求导词典', hook: '幂法则 + 常见函数 + 加/乘/除/链式，就这么点。', status: 'planned', level: '入门' },
      { slug: 'partial-derivatives', title: '偏导数', hook: '两个旋钮的机器：只动一个，另一个冻成常数。', status: 'planned', level: '入门', todo: '冻住 y 只拖 x' },
      { slug: 'matrix-vector', title: '矩阵乘向量', hook: '不是玄学：每个输入的贡献加总，就是 J·δ。', status: 'planned', level: '入门' },
      { slug: 'linearization', title: '局部线性化', hook: '凑够近，弯的都是直的：f(x₀+δ) ≈ f(x₀) + J·δ。', status: 'planned', level: '入门', todo: '承接 /jacobian，缩 δ 看误差' },
    ],
  },
  {
    name: '微分与几何',
    blurb: '把连续变化画成能拖动的几何动作。',
    algos: [
      {
        slug: 'jacobian',
        title: '雅可比矩阵',
        hook: '一个弯曲的映射，凑近看其实就是一个矩阵。',
        status: 'live',
        level: '进阶',
      },
      { slug: 'gradient-field', title: '梯度场', hook: '梯度为什么总指向最陡的上坡方向？', status: 'planned', level: '进阶', todo: '想画成拖着走看等高线' },
      { slug: 'taylor', title: '泰勒展开', hook: '用多项式一层层逼近一条曲线。', status: 'planned', level: '进阶', todo: 'todo: 加阶数滑块' },
    ],
  },
  {
    name: '优化',
    blurb: '一个数怎么被一步步推到最好。',
    algos: [
      { slug: 'gradient-descent', title: '梯度下降', hook: '小球怎么滚到谷底，学习率太大会怎样？', status: 'planned', todo: '先做等高线 + 轨迹' },
      { slug: 'momentum', title: '动量法', hook: '给小球加惯性，能不能滚得更稳更快？', status: 'planned' },
    ],
  },
  {
    name: '排序',
    blurb: '把乱序理顺，各家有各家的巧。',
    algos: [
      { slug: 'quicksort', title: '快速排序', hook: '选个基准，分而治之。', status: 'planned', todo: '柱状图 + 分区动画' },
      { slug: 'merge-sort', title: '归并排序', hook: '拆到最小再两两合并。', status: 'planned' },
    ],
  },
  {
    name: '图',
    blurb: '在节点与边之间怎么找路。',
    algos: [
      { slug: 'bfs-dfs', title: '广度 / 深度优先', hook: '一层层铺开，还是一条道走到黑？', status: 'planned' },
      { slug: 'dijkstra', title: '最短路 · Dijkstra', hook: '带权重的地图上，怎么找最省的路。', status: 'planned' },
    ],
  },
]

export const allAlgos = catalog.flatMap((c) => c.algos)
export const liveAlgos = allAlgos.filter((a) => a.status === 'live')
export function findAlgo(slug: string) {
  return allAlgos.find((a) => a.slug === slug)
}
export function categoryOf(slug: string) {
  return catalog.find((c) => c.algos.some((a) => a.slug === slug))?.name ?? ''
}

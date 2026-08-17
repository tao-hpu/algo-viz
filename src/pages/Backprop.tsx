import { type ReactNode, useMemo, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'
import { Player } from '../components/Player'
import { usePlayer } from '../lib/player'

/* ────────────────────────────────────────────────────────────
   反向传播 · 一次回程，取走全部梯度

   前面几页都在说「梯度指向最陡的方向」「沿 −∇f 走一步」，可梯度本身
   是怎么来的，一直没人交代。这一页补上：把式子摊成一张计算图，正向
   算一遍值，反向再走一遍，回程路上每个参数的偏导数就都拿到了。

   全页压在三句话上：
   · 每条边只认识一个数——它自己的局部导数，别的一概不管；
   · 一条路径上的局部导数连乘（链式法则），多条路径汇到同一个点就相加；
   · 正向一遍、反向一遍就够，不管有多少个参数。这才是它值钱的地方。

   页面里的数字全部当场算：
   · 正向值、反向梯度都按当前滑杆实算；
   · 每个参数同时给一份中心差分的数值梯度做对照，两列并排验货；
   · 「走一步梯度下降」按钮真的把梯度用掉，loss 当场变，不是演的。
   ──────────────────────────────────────────────────────────── */

type Vals = {
  x: number; y: number
  w1: number; b1: number; w2: number; b2: number; v1: number; v2: number
}
type NodeId = keyof Vals | 'z1' | 'a1' | 'z2' | 'a2' | 'o' | 'L'

/** 前向：一个 1→2→1 的小网络 + 平方损失。故意小到能整个塞进脑子里。 */
function forward(p: Vals) {
  const z1 = p.w1 * p.x + p.b1
  const a1 = Math.tanh(z1)
  const z2 = p.w2 * p.x + p.b2
  const a2 = Math.tanh(z2)
  const o = p.v1 * a1 + p.v2 * a2
  const L = 0.5 * (o - p.y) ** 2
  return { ...p, z1, a1, z2, a2, o, L }
}
type Forward = ReturnType<typeof forward>

/** 反向：每一步都是「上游梯度 × 这条边的局部导数」。顺序是正向的倒序。 */
function backward(f: Forward): Record<NodeId, number> {
  const dL = 1
  const dO = (f.o - f.y) * dL
  const dV1 = dO * f.a1
  const dA1 = dO * f.v1
  const dV2 = dO * f.a2
  const dA2 = dO * f.v2
  const dZ1 = dA1 * (1 - f.a1 * f.a1)
  const dZ2 = dA2 * (1 - f.a2 * f.a2)
  const dW1 = dZ1 * f.x
  const dB1 = dZ1
  const dW2 = dZ2 * f.x
  const dB2 = dZ2
  // x 有两条出边（喂给了两个神经元），所以它的梯度是两条路径之和。
  const dX = dZ1 * f.w1 + dZ2 * f.w2
  const dY = -(f.o - f.y)
  return { L: dL, o: dO, v1: dV1, a1: dA1, v2: dV2, a2: dA2, z1: dZ1, z2: dZ2, w1: dW1, b1: dB1, w2: dW2, b2: dB2, x: dX, y: dY }
}

const PARAMS = ['w1', 'b1', 'w2', 'b2', 'v1', 'v2'] as const
type Param = (typeof PARAMS)[number]

/** 数值梯度（中心差分）：拿来给反向传播验货，跟「求导词典」那页一个套路。 */
function numGrad(p: Vals, k: Param, h = 1e-5) {
  const up = forward({ ...p, [k]: p[k] + h }).L
  const dn = forward({ ...p, [k]: p[k] - h }).L
  return (up - dn) / (2 * h)
}

/* ── 图的画法 ──────────────────────────────────────────────── */

const VBW = 660
const VBH = 352  // 上下各留出 v₁ / v₂ 那两个节点的高度，别让它们被画布切掉
const NW = 54   // 节点半宽
const NH = 19   // 节点半高

type Slot = { id: NodeId; cx: number; cy: number; label: string; kind: 'input' | 'param' | 'op'; expr: string }

const SLOTS: Slot[] = [
  { id: 'w1', cx: 62, cy: 40, label: 'w₁', kind: 'param', expr: '参数' },
  { id: 'b1', cx: 62, cy: 92, label: 'b₁', kind: 'param', expr: '参数' },
  { id: 'x', cx: 62, cy: 165, label: 'x', kind: 'input', expr: '输入' },
  { id: 'w2', cx: 62, cy: 238, label: 'w₂', kind: 'param', expr: '参数' },
  { id: 'b2', cx: 62, cy: 290, label: 'b₂', kind: 'param', expr: '参数' },
  { id: 'z1', cx: 218, cy: 62, label: 'z₁', kind: 'op', expr: 'w₁·x + b₁' },
  { id: 'a1', cx: 348, cy: 62, label: 'a₁', kind: 'op', expr: 'tanh(z₁)' },
  { id: 'z2', cx: 218, cy: 268, label: 'z₂', kind: 'op', expr: 'w₂·x + b₂' },
  { id: 'a2', cx: 348, cy: 268, label: 'a₂', kind: 'op', expr: 'tanh(z₂)' },
  { id: 'v1', cx: 348, cy: 22, label: 'v₁', kind: 'param', expr: '参数' },
  { id: 'v2', cx: 348, cy: 326, label: 'v₂', kind: 'param', expr: '参数' },
  { id: 'o', cx: 480, cy: 165, label: 'o', kind: 'op', expr: 'v₁a₁ + v₂a₂' },
  { id: 'y', cx: 480, cy: 268, label: 'y', kind: 'input', expr: '目标值' },
  { id: 'L', cx: 604, cy: 165, label: 'L', kind: 'op', expr: '½(o−y)²' },
]
const slotOf = (id: NodeId) => SLOTS.find((s) => s.id === id)!

/** 边：from → to，外加这条边的局部导数怎么读。 */
type EdgeDef = { from: NodeId; to: NodeId; local: (f: Forward) => number; localLabel: (f: Forward) => string }
const EDGES: EdgeDef[] = [
  { from: 'w1', to: 'z1', local: (f) => f.x, localLabel: (f) => `∂z₁/∂w₁ = x = ${f.x.toFixed(2)}` },
  { from: 'b1', to: 'z1', local: () => 1, localLabel: () => '∂z₁/∂b₁ = 1' },
  { from: 'x', to: 'z1', local: (f) => f.w1, localLabel: (f) => `∂z₁/∂x = w₁ = ${f.w1.toFixed(2)}` },
  { from: 'w2', to: 'z2', local: (f) => f.x, localLabel: (f) => `∂z₂/∂w₂ = x = ${f.x.toFixed(2)}` },
  { from: 'b2', to: 'z2', local: () => 1, localLabel: () => '∂z₂/∂b₂ = 1' },
  { from: 'x', to: 'z2', local: (f) => f.w2, localLabel: (f) => `∂z₂/∂x = w₂ = ${f.w2.toFixed(2)}` },
  { from: 'z1', to: 'a1', local: (f) => 1 - f.a1 * f.a1, localLabel: (f) => `∂a₁/∂z₁ = 1−a₁² = ${(1 - f.a1 * f.a1).toFixed(3)}` },
  { from: 'z2', to: 'a2', local: (f) => 1 - f.a2 * f.a2, localLabel: (f) => `∂a₂/∂z₂ = 1−a₂² = ${(1 - f.a2 * f.a2).toFixed(3)}` },
  { from: 'a1', to: 'o', local: (f) => f.v1, localLabel: (f) => `∂o/∂a₁ = v₁ = ${f.v1.toFixed(2)}` },
  { from: 'v1', to: 'o', local: (f) => f.a1, localLabel: (f) => `∂o/∂v₁ = a₁ = ${f.a1.toFixed(3)}` },
  { from: 'a2', to: 'o', local: (f) => f.v2, localLabel: (f) => `∂o/∂a₂ = v₂ = ${f.v2.toFixed(2)}` },
  { from: 'v2', to: 'o', local: (f) => f.a2, localLabel: (f) => `∂o/∂v₂ = a₂ = ${f.a2.toFixed(3)}` },
  { from: 'o', to: 'L', local: (f) => f.o - f.y, localLabel: (f) => `∂L/∂o = o−y = ${(f.o - f.y).toFixed(3)}` },
  { from: 'y', to: 'L', local: (f) => -(f.o - f.y), localLabel: (f) => `∂L/∂y = −(o−y) = ${(-(f.o - f.y)).toFixed(3)}` },
]

const RED = '#d6452c'
const RED_INK = '#b5391f'
const MOSS = '#4a6b52'
const FAINT = '#9a968a'

/** 一帧：正向算某个节点，或者反向把某个节点的梯度算出来。 */
type Frame = {
  phase: 'forward' | 'backward' | 'done'
  node: NodeId | null
  edges: { from: NodeId; to: NodeId }[]   // 这一帧被点亮的边
  knownV: NodeId[]                        // 已经算出正向值的节点
  knownG: NodeId[]                        // 已经算出梯度的节点
  note: ReactNode
}

function buildFrames(f: Forward, g: Record<NodeId, number>): Frame[] {
  const out: Frame[] = []
  const knownV: NodeId[] = []
  const knownG: NodeId[] = []
  const n3 = (v: number) => v.toFixed(3)

  const leaves: NodeId[] = ['x', 'y', 'w1', 'b1', 'w2', 'b2', 'v1', 'v2']
  knownV.push(...leaves)
  out.push({
    phase: 'forward', node: null, edges: [], knownV: [...knownV], knownG: [],
    note: <>正向开始。左边这些是<em>叶子</em>：输入 x、目标 y，和 6 个参数。它们的值是给定的，不用算。</>,
  })

  const fwd: { id: NodeId; deps: NodeId[]; text: ReactNode }[] = [
    { id: 'z1', deps: ['w1', 'x', 'b1'], text: <>z₁ = w₁·x + b₁ = {n3(f.w1)}×{n3(f.x)} + {n3(f.b1)} = <em>{n3(f.z1)}</em></> },
    { id: 'a1', deps: ['z1'], text: <>a₁ = tanh(z₁) = <em>{n3(f.a1)}</em>。tanh 把任意实数压进 (−1, 1)，这一层的非线性全靠它。</> },
    { id: 'z2', deps: ['w2', 'x', 'b2'], text: <>z₂ = w₂·x + b₂ = {n3(f.w2)}×{n3(f.x)} + {n3(f.b2)} = <em>{n3(f.z2)}</em>。同一个 x，第二个神经元自己一套参数。</> },
    { id: 'a2', deps: ['z2'], text: <>a₂ = tanh(z₂) = <em>{n3(f.a2)}</em></> },
    { id: 'o', deps: ['v1', 'a1', 'v2', 'a2'], text: <>o = v₁a₁ + v₂a₂ = <em>{n3(f.o)}</em>。两个神经元的输出加权合成一个预测。</> },
    { id: 'L', deps: ['o', 'y'], text: <>L = ½(o−y)² = ½({n3(f.o)} − {n3(f.y)})² = <em>{n3(f.L)}</em>。正向到此结束，我们有了一个数：这次预测差多少。</> },
  ]
  for (const step of fwd) {
    knownV.push(step.id)
    out.push({
      phase: 'forward', node: step.id, edges: step.deps.map((d) => ({ from: d, to: step.id })),
      knownV: [...knownV], knownG: [], note: step.text,
    })
  }

  knownG.push('L')
  out.push({
    phase: 'backward', node: 'L', edges: [], knownV: [...knownV], knownG: [...knownG],
    note: <>回程开始。终点对自己的导数 <em>∂L/∂L = 1</em>——这不是约定，是「L 变一点，L 就变那么一点」。整条回程都从这个 1 出发。</>,
  })

  const back: { id: NodeId; via: { from: NodeId; to: NodeId }[]; text: ReactNode }[] = [
    {
      id: 'o', via: [{ from: 'o', to: 'L' }],
      text: <>∂L/∂o = 1 × (o−y) = <em>{n3(g.o)}</em>。上游梯度乘这条边的局部导数，就这一个动作，后面每一步都是它。</>,
    },
    {
      id: 'v1', via: [{ from: 'v1', to: 'o' }],
      text: <>∂L/∂v₁ = ∂L/∂o × a₁ = {n3(g.o)} × {n3(f.a1)} = <em>{n3(g.v1)}</em>。第一个参数的梯度到手。</>,
    },
    {
      id: 'a1', via: [{ from: 'a1', to: 'o' }],
      text: <>∂L/∂a₁ = ∂L/∂o × v₁ = {n3(g.o)} × {n3(f.v1)} = <em>{n3(g.a1)}</em>。同一个上游梯度，换一条边、换一个局部导数。</>,
    },
    {
      id: 'v2', via: [{ from: 'v2', to: 'o' }],
      text: <>∂L/∂v₂ = ∂L/∂o × a₂ = <em>{n3(g.v2)}</em></>,
    },
    {
      id: 'a2', via: [{ from: 'a2', to: 'o' }],
      text: <>∂L/∂a₂ = ∂L/∂o × v₂ = <em>{n3(g.a2)}</em></>,
    },
    {
      id: 'z1', via: [{ from: 'z1', to: 'a1' }],
      text: <>∂L/∂z₁ = ∂L/∂a₁ × (1−a₁²) = {n3(g.a1)} × {n3(1 - f.a1 * f.a1)} = <em>{n3(g.z1)}</em>。tanh 的局部导数最大只有 1，越靠近饱和区越接近 0——梯度消失就是从这里开始的。</>,
    },
    {
      id: 'w1', via: [{ from: 'w1', to: 'z1' }],
      text: <>∂L/∂w₁ = ∂L/∂z₁ × x = {n3(g.z1)} × {n3(f.x)} = <em>{n3(g.w1)}</em></>,
    },
    {
      id: 'b1', via: [{ from: 'b1', to: 'z1' }],
      text: <>∂L/∂b₁ = ∂L/∂z₁ × 1 = <em>{n3(g.b1)}</em>。偏置那条边的局部导数恒等于 1，梯度原样透过去。</>,
    },
    {
      id: 'z2', via: [{ from: 'z2', to: 'a2' }],
      text: <>∂L/∂z₂ = ∂L/∂a₂ × (1−a₂²) = <em>{n3(g.z2)}</em></>,
    },
    {
      id: 'w2', via: [{ from: 'w2', to: 'z2' }],
      text: <>∂L/∂w₂ = ∂L/∂z₂ × x = <em>{n3(g.w2)}</em></>,
    },
    {
      id: 'b2', via: [{ from: 'b2', to: 'z2' }],
      text: <>∂L/∂b₂ = ∂L/∂z₂ × 1 = <em>{n3(g.b2)}</em>。6 个参数的梯度全齐了，正向只跑过一遍。</>,
    },
    {
      id: 'x', via: [{ from: 'x', to: 'z1' }, { from: 'x', to: 'z2' }],
      text: (
        <>
          x 有<em>两条出边</em>，所以要把两条路径加起来：∂L/∂x = ∂L/∂z₁·w₁ + ∂L/∂z₂·w₂
          = {n3(g.z1 * f.w1)} + {n3(g.z2 * f.w2)} = <em>{n3(g.x)}</em>。
          <strong>分叉处相加</strong>是链式法则在图上的完整形态，只会连乘是不够的。
        </>
      ),
    },
  ]
  for (const step of back) {
    knownG.push(step.id)
    out.push({
      phase: 'backward', node: step.id, edges: step.via,
      knownV: [...knownV], knownG: [...knownG], note: step.text,
    })
  }

  out.push({
    phase: 'done', node: null, edges: [], knownV: [...knownV], knownG: [...knownG],
    note: (
      <span className="done">
        一次正向 + 一次反向，6 个参数的偏导数全部到手。下面那张表把它们和数值梯度并排放着，自己核。
      </span>
    ),
  })
  return out
}

const fmt = (v: number) => (Math.abs(v) < 5e-4 ? '0.000' : v.toFixed(3))

// 验货表的列宽：HTML 会把连续空格压成一个，靠 padStart 对不齐，只能用定宽格子。
const COL_K = { display: 'inline-block', minWidth: '5.4em' } as const
const COL_N = { display: 'inline-block', minWidth: '6.4em', textAlign: 'right', paddingRight: '0.5em' } as const
const PRETTY: Record<Param, string> = { w1: 'w₁', b1: 'b₁', w2: 'w₂', b2: 'b₂', v1: 'v₁', v2: 'v₂' }

/* ═══════════ 计算图面板 ═══════════ */

function GraphPanel({ f, g, frame }: { f: Forward; g: Record<NodeId, number>; frame: Frame }) {
  const known = new Set(frame.knownV)
  const gradKnown = new Set(frame.knownG)
  const hot = new Set(frame.edges.map((e) => `${e.from}->${e.to}`))
  const back = frame.phase !== 'forward'

  return (
    // 图里全是小字，窄屏上整张压到 330px 会糊掉。给它一个可横向滚动的外框 +
    // 最小宽度：手机上变成「左右推着看」，比整体缩到看不清强。
    <div style={{ overflowX: 'auto' }}>
    <svg viewBox={`0 0 ${VBW} ${VBH}`} role="img" style={{ minWidth: 560 }}
      aria-label="计算图：正向算值、反向算梯度，当前步骤高亮">
      {/* 边 */}
      {EDGES.map((e) => {
        const a = slotOf(e.from)
        const b = slotOf(e.to)
        const x1 = a.cx + NW
        const y1 = a.cy
        const x2 = b.cx - NW
        const y2 = b.cy
        const isHot = hot.has(`${e.from}->${e.to}`)
        const live = known.has(e.from) && known.has(e.to)
        const col = isHot ? (back ? MOSS : RED) : live ? '#c9c2b2' : '#e4ded1'
        const mx = (x1 + x2) / 2
        return (
          <g key={`${e.from}-${e.to}`}>
            <path
              d={`M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
              fill="none" stroke={col} strokeWidth={isHot ? 2.6 : 1.1}
            />
            {/* 反向那一步：在边中点标出这条边的局部导数 */}
            {isHot && back && (
              <text x={mx} y={(y1 + y2) / 2 - 6} fontSize={9.5} textAnchor="middle"
                fill={MOSS} fontFamily="var(--font-mono)">
                × {fmt(e.local(f))}
              </text>
            )}
          </g>
        )
      })}

      {/* 节点 */}
      {SLOTS.map((s) => {
        const isHot = frame.node === s.id
        const val = (f as unknown as Record<string, number>)[s.id]
        const grad = g[s.id]
        const hasV = known.has(s.id)
        const hasG = gradKnown.has(s.id)
        const fill = isHot ? (back ? 'rgba(74,107,82,0.16)' : 'rgba(214,69,44,0.14)') : hasV ? '#f5f0e6' : '#faf7f0'
        const stroke = isHot ? (back ? MOSS : RED) : s.kind === 'param' ? RED_INK : hasV ? '#c9c2b2' : '#e4ded1'
        return (
          <g key={s.id}>
            <rect
              x={s.cx - NW} y={s.cy - NH} width={NW * 2} height={NH * 2} rx={5}
              fill={fill} stroke={stroke}
              strokeWidth={isHot ? 2.2 : s.kind === 'param' ? 1.4 : 1}
              strokeDasharray={s.kind === 'param' ? '4 2.5' : undefined}
            />
            <text x={s.cx - NW + 8} y={s.cy - 3} fontSize={12} fontFamily="var(--font-mono)"
              fill="#2a2a28" fontWeight={600}>{s.label}</text>
            <text x={s.cx + NW - 8} y={s.cy - 3} fontSize={11.5} textAnchor="end"
              fontFamily="var(--font-mono)" fill={hasV ? RED_INK : '#c9c2b2'}>
              {hasV ? fmt(val) : '—'}
            </text>
            <text x={s.cx - NW + 8} y={s.cy + 11} fontSize={8.5} fill={FAINT}>{s.expr}</text>
            <text x={s.cx + NW - 8} y={s.cy + 11} fontSize={9.5} textAnchor="end"
              fontFamily="var(--font-mono)" fill={hasG ? MOSS : '#ddd5c5'}>
              {hasG ? `∂ ${fmt(grad)}` : ''}
            </text>
          </g>
        )
      })}

      <text x={10} y={VBH - 6} fontSize={10.5} fill={FAINT} fontFamily="var(--font-mono)">
        {frame.phase === 'forward' ? '正向 →　左边的数往右流，最后合成一个 loss'
          : frame.phase === 'backward' ? '← 反向　梯度从 L 往回流，每过一条边乘一次局部导数'
            : '正向一遍 + 反向一遍，全部梯度到手'}
      </text>
    </svg>
    </div>
  )
}

/* ═══════════ 页面 ═══════════ */

const INIT: Vals = { x: 0.9, y: 1, w1: 0.8, b1: -0.3, w2: -1.1, b2: 0.4, v1: 1.2, v2: 0.7 }

export function Backprop() {
  const [p, setP] = useState<Vals>(INIT)
  const [lr, setLr] = useState(0.5)
  const [steps, setSteps] = useState(0)

  const f = useMemo(() => forward(p), [p])
  const g = useMemo(() => backward(f), [f])
  const frames = useMemo(() => buildFrames(f, g), [f, g])
  const pl = usePlayer(frames.length, 3)
  const frame = frames[pl.i]

  const nums = useMemo(
    () => Object.fromEntries(PARAMS.map((k) => [k, numGrad(p, k)])) as Record<Param, number>,
    [p],
  )
  const worst = Math.max(...PARAMS.map((k) => Math.abs(nums[k] - g[k])))

  // 拿刚算出来的梯度真的走一步：loss 会当场往下掉，梯度是不是对的一眼就知道。
  function descend() {
    setP((q) => {
      const gg = backward(forward(q))
      const next = { ...q }
      for (const k of PARAMS) next[k] = q[k] - lr * gg[k]
      return next
    })
    setSteps((s) => s + 1)
    pl.reset()
  }

  function reset() {
    setP(INIT)
    setSteps(0)
    pl.reset()
  }

  function randomize() {
    const r = () => +(Math.random() * 2.4 - 1.2).toFixed(2)
    setP((q) => ({ ...q, w1: r(), b1: r(), w2: r(), b2: r(), v1: r(), v2: r() }))
    setSteps(0)
    pl.reset()
  }

  const slider = (k: Param | 'x' | 'y', label: string, min: number, max: number) => (
    <div className="control" key={k}>
      <label htmlFor={`bp-${k}`}>{label} <b>{p[k].toFixed(2)}</b></label>
      <input id={`bp-${k}`} type="range" min={min} max={max} step={0.01} value={p[k]}
        onChange={(e) => { setP((q) => ({ ...q, [k]: +e.target.value })); pl.reset() }} />
    </div>
  )

  return (
    <AlgoShell
      slug="backprop"
      lede={
        <>
          前面几页一直在用梯度，却没说它从哪来。答案是一张<span className="k">计算图</span>：
          正向把式子一层层算成一个 loss，反向沿原路走一遍，每过一条边乘上这条边的局部导数，
          回到起点时<strong>所有参数的偏导数已经全在手里了</strong>。按播放，跟着走一遍。
        </>
      }
    >
      <div className="lab">
        <GraphPanel f={f} g={g} frame={frame} />

        <div className="legend">
          <span><i style={{ background: RED }} />正向：值往右流</span>
          <span><i style={{ background: MOSS }} />反向：梯度往左流（节点右下角的 ∂ 就是它）</span>
          <span><i style={{ border: `1.4px dashed ${RED_INK}`, borderRadius: 2 }} />虚线框 = 要训练的参数</span>
        </div>

        <div className="step-note">{frame.note}</div>

        <Player
          p={pl}
          extra={
            <>
              <button className="btn" onClick={randomize}>随机初始化</button>
              <button className="btn" onClick={reset}>复位</button>
            </>
          }
        />

        <div className="controls">
          {slider('x', '输入 x', -2, 2)}
          {slider('y', '目标 y', -1.5, 1.5)}
          <div className="control">
            <label htmlFor="bp-lr">学习率 lr <b>{lr.toFixed(2)}</b></label>
            <input id="bp-lr" type="range" min={0.05} max={2} step={0.05} value={lr}
              onChange={(e) => setLr(+e.target.value)} />
          </div>
          <button className="btn primary" onClick={descend}>按梯度走一步</button>
        </div>

        <div className="readout">
          <div className="item">
            <span className="lbl">预测 o</span>
            <span className="val">{fmt(f.o)}</span>
          </div>
          <div className="item">
            <span className="lbl">目标 y</span>
            <span className="val">{fmt(f.y)}</span>
          </div>
          <div className="item">
            <span className="lbl">损失 L</span>
            <span className="val">{f.L < 1e-4 ? f.L.toExponential(1) : fmt(f.L)}</span>
          </div>
          <div className="item">
            <span className="lbl">已走的步数</span>
            <span className="val">{steps}</span>
          </div>
        </div>

        <h4 style={{ margin: '22px 0 8px', fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>
          验货：反向传播算的梯度 vs 中心差分数值梯度
        </h4>
        <div className="matrix-box" style={{ display: 'block', overflowX: 'auto' }}>
          <div style={{ color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>
            <span style={COL_K}>参数</span>
            <span style={COL_N}>反向传播</span>
            <span style={COL_N}>数值差分</span>
            <span style={COL_N}>差</span>
          </div>
          {PARAMS.map((k) => (
            <div key={k} style={{ whiteSpace: 'nowrap' }}>
              <span style={COL_K}>∂L/∂{PRETTY[k]}</span>
              <span style={COL_N}>{g[k].toFixed(6)}</span>
              <span style={COL_N}>{nums[k].toFixed(6)}</span>
              <span style={{ ...COL_N, color: FAINT }}>{Math.abs(nums[k] - g[k]).toExponential(1)}</span>
            </div>
          ))}
          <div style={{ marginTop: 6, color: MOSS }}>
            最大偏差 {worst.toExponential(1)}，全是差分本身的截断误差——两条路算的是同一个东西。
          </div>
        </div>

        <div className="readout">
          <div className="item">
            <span className="lbl">反向传播的代价</span>
            <span className="val">1 正 + 1 反</span>
          </div>
          <div className="item">
            <span className="lbl">数值梯度的代价（{PARAMS.length} 个参数）</span>
            <span className="val">{2 * PARAMS.length} 次正向</span>
          </div>
          <div className="item">
            <span className="lbl">换成 10 亿参数呢</span>
            <span className="val">还是 1 正 + 1 反 vs 20 亿次正向</span>
          </div>
        </div>
      </div>

      <h2>每条边只认识一个数</h2>
      <p>
        把式子拆成图之后，每个节点只做一件小事：加、乘、tanh。于是每条边上都有一个<strong>局部导数</strong>，
        它只跟这一步的输入有关，跟整张图长什么样毫无关系。乘法边 <span className="k">o = v₁a₁ + …</span> 上，
        <span className="k">∂o/∂v₁ = a₁</span>；加法边上是 1；tanh 边上是 <span className="k">1 − a²</span>。
        这些都是「求导词典」那页背过的东西，一条也没多。
      </p>
      <p>
        反向传播不发明任何新的求导规则。它做的只是<strong>安排顺序</strong>：从 L 出发，
        沿着边往回走，每过一条边就把手里的数乘上这条边的局部导数。
        走到某个节点时，手里那个数恰好就是 <span className="k">∂L/∂该节点</span>。
      </p>

      <h2>分叉的地方要相加</h2>
      <p>
        只会「连乘」是不够的。看图里的 <span className="k">x</span>：它同时喂给了两个神经元，有两条出边。
        x 动一点，两条路径都会把这个扰动传到 L 上，两份影响是<strong>叠加</strong>的，
        所以 <span className="k">∂L/∂x = ∂L/∂z₁·w₁ + ∂L/∂z₂·w₂</span>。
        规则完整地说是这样：<strong>一条路径上的局部导数连乘，多条路径之间相加</strong>。
        权重共享、残差连接、同一个张量被用两次，靠的都是这一条。
      </p>

      <h2>为什么非要反着走</h2>
      <p>
        正着走也能求导（这叫前向模式）：盯住一个输入，一路推算「每个中间量对它的导数」。
        问题是这样一趟只能拿到<strong>一个</strong>输入方向上的导数，有多少个参数就得跑多少趟。
        反着走恰好相反：盯住一个输出，一趟拿到<strong>所有</strong>输入的导数。
      </p>
      <p>
        神经网络正好是「几亿个输入、一个输出（loss）」的形状，所以反向模式便宜得离谱：
        代价大约是一次正向的两倍，与参数量无关。上面那三个读数就是这件事的缩影——
        6 个参数时数值梯度要 12 次正向，还只是勉强能忍；换成十亿参数，那条路直接不存在。
      </p>
      <p>
        <strong>顺带说清一件常被混淆的事</strong>：反向传播<em>不是</em>优化算法，它只负责把梯度算出来。
        拿到梯度之后怎么走，是下一页梯度下降的事。上面那个「按梯度走一步」的按钮就是两者的接缝：
        点一下，参数各自减去 <span className="k">lr × 自己的梯度</span>，loss 当场往下掉。
        多点几下看 L 怎么滑向 0；把学习率拖到 2 再点，看它怎么反而弹上去。
      </p>

      <h2>梯度消失从哪儿冒出来</h2>
      <p>
        盯住 tanh 那条边的局部导数 <span className="k">1 − a²</span>：a 越接近 ±1，它越接近 0。
        把 <span className="k">w₁</span> 拖大，z₁ 被推进饱和区，这条边的乘数就塌了，
        <span className="k">∂L/∂w₁</span> 跟着一起塌——不是没有梯度，是被乘没了。
      </p>
      <p>
        这里只有一层就已经看得见。真实网络几十层叠起来，每层都乘一个小于 1 的数，
        回到最前面几层时梯度早就成了零头。ReLU（导数非 0 即 1）、残差连接（给梯度开一条乘数恒为 1 的近路）、
        各种归一化层，治的都是这一个乘法链。
      </p>

      <Landing>
        PyTorch 的 <span className="k">loss.backward()</span> 跑的就是这一页：前向时框架顺手把计算图记下来，
        反向时按拓扑序倒着遍历，每个算子调用自己的局部导数，遇到分叉就累加到 <span className="k">.grad</span> 上。
        所谓自动微分不是符号求导，也不是数值差分，而是<strong>把链式法则沿着一张图机械地执行一遍</strong>。
        它比数值差分快几亿倍，还没有截断误差——上面那张验货表里，反向那一列才是更准的那个。
      </Landing>
    </AlgoShell>
  )
}

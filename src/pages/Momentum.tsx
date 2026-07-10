import { useMemo, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'
import { Player } from '../components/Player'
import { usePlayer } from '../lib/player'
import { contourSegments, levelsOf, numGrad, rangeOf, type Box, type Scalar2 } from '../lib/field'

/* ────────────────────────────────────────────────────────────
   动量法 · 给小球加惯性
   核心直觉：普通梯度下降每一步只看当下的坡，走完就忘。动量法给
   小球记了一份速度 v，把过去的梯度按 β 折价累加进来。震荡方向上
   相邻梯度正负相反，累加时互相抵消；沿谷方向上梯度符号始终一致，
   累加时越滚越快。同一个公式同时干了减震和加速两件事。
   这里两个面板同一个函数、同一个起点、同一个学习率、同一把尺，
   唯一的差别就是右边多了那个 v。把 β 拖到 0，右边会变回左边。
   ──────────────────────────────────────────────────────────── */

type Vec = [number, number]

interface FuncDef {
  key: string
  name: string
  f: Scalar2
  box: Box
  /** 全局最小值。取 f − fmin 作统一的「离底还差多少」，双谷的 f 本身是负的。 */
  fmin: number
  argmin: Vec
  /** 只有双谷有：那个浅的局部坑。 */
  localMin?: Vec
  start: Vec
  /** 该函数的默认学习率（存成 log10，滑块直接用）。 */
  t0: number
  note: string
}

// 双谷加了 0.35x 的斜项，把两个坑拧成一深一浅；数值扫描出的全局最小值。
const WELL_FMIN = -1.6894237

const FUNCS: FuncDef[] = [
  {
    key: 'valley',
    name: '狭长椭圆碗 0.05x² + 4y²',
    f: (x, y) => 0.05 * x * x + 4 * y * y,
    box: { x0: -4.6, x1: 4.6, y0: -1.5, y1: 1.5 },
    fmin: 0,
    argmin: [0, 0],
    start: [-4, 0.9],
    t0: Math.log10(0.2),
    note: '动量法的主场。横跨方向陡 80 倍，梯度下降在两壁之间来回弹，往谷底那点分量小得可怜。动量法把左右方向的正负梯度抵消掉、把沿谷方向的一致梯度累加起来，直接顺着谷冲下去。看下面那张 loss 图，两条线不在一个量级。',
  },
  {
    key: 'bowl',
    name: '圆碗 x² + y²',
    f: (x, y) => x * x + y * y,
    box: { x0: -2.6, x1: 2.6, y0: -2.6, y1: 2.6 },
    fmin: 0,
    argmin: [0, 0],
    start: [-2, 1.7],
    t0: Math.log10(0.2),
    note: '各向同性，没有病态方向可救，动量反而是负担：小球一头冲过底部，再绕回来打转。β=0.9 时它确实更早一次「掠过」谷底，但末帧的 f 比梯度下降大好几个量级。把 β 拖到 0.95 更明显。该慢的时候承认慢。',
  },
  {
    key: 'well',
    name: '双谷 0.06(x⁴ − 8x²) + 0.35x + y²',
    f: (x, y) => 0.06 * (x ** 4 - 8 * x * x) + 0.35 * x + y * y,
    box: { x0: -3.4, x1: 3.4, y0: -1.5, y1: 1.5 },
    fmin: WELL_FMIN,
    argmin: [-2.162, 0],
    localMin: [1.784, 0],
    start: [3, 0.8],
    t0: Math.log10(0.08),
    note: '右边是浅坑，左边才是真正的底。梯度下降滑进浅坑就再也出不来。动量法有机会靠惯性翻过中间那道坎，但只是有机会：这个起点上 β=0.8 冲不出去，β=0.85 和 0.9 冲得出去，β=0.95 又冲过了头，80 步内没停稳。它取决于 β、学习率和起点，不是动量法自带的本事。',
  },
]

const STEPS = 80
const TOL = 1e-3

interface Traj {
  pts: Vec[]
  /** 跑出 box 或算出 NaN：轨迹在此截断。 */
  diverged: boolean
}

/**
 * 一次性把整条轨迹摊平。动量用的是这个写法（教材里有几种等价形式，别混）：
 *   v ← β·v − lr·∇f(x)
 *   x ← x + v
 * v 初始为 0，所以 β=0 时 v 恰好等于 −lr·∇f，退化成普通梯度下降，一步不差。
 */
function trace(f: Scalar2, start: Vec, lr: number, beta: number, box: Box): Traj {
  let [x, y] = start
  let vx = 0
  let vy = 0
  const pts: Vec[] = [[x, y]]
  for (let k = 0; k < STEPS; k++) {
    const [gx, gy] = numGrad(f, x, y)
    vx = beta * vx - lr * gx
    vy = beta * vy - lr * gy
    x += vx
    y += vy
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { pts, diverged: true }
    pts.push([x, y])
    if (x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1) return { pts, diverged: true }
  }
  return { pts, diverged: false }
}

/** 第一次让 f − f* 掉到 tol 以下是第几步；没到返回 −1。 */
function hitStep(tr: Traj, f: Scalar2, fmin: number): number {
  for (let i = 0; i < tr.pts.length; i++) {
    if (f(tr.pts[i][0], tr.pts[i][1]) - fmin < TOL) return i
  }
  return -1
}

const IW = 300 // 面板内区宽度（像素）
const PAD = 16

/** box 的长宽比决定面板高度：两个面板拿同一个 box，就永远是同一把尺。 */
const innerH = (box: Box) => (IW * (box.y1 - box.y0)) / (box.x1 - box.x0)

function makeToPx(box: Box, ih: number) {
  return (x: number, y: number): Vec => [
    PAD + ((x - box.x0) / (box.x1 - box.x0)) * IW,
    PAD + ih - ((y - box.y0) / (box.y1 - box.y0)) * ih,
  ]
}

/** 箭头的三角头。太短就不画头，免得糊成一团。 */
function head(x1: number, y1: number, x2: number, y2: number, size = 7): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const L = Math.hypot(dx, dy)
  if (L < 9) return ''
  const ux = dx / L
  const uy = dy / L
  const bx = x2 - ux * size
  const by = y2 - uy * size
  const w = size * 0.42
  return `M${x2.toFixed(1)} ${y2.toFixed(1)}L${(bx - uy * w).toFixed(1)} ${(by + ux * w).toFixed(1)}L${(bx + uy * w).toFixed(1)} ${(by - ux * w).toFixed(1)}Z`
}

interface PanelProps {
  title: string
  def: FuncDef
  segs: [number, number, number, number][]
  traj: Traj
  frame: number
  color: string
  /** 这一步的推力 −lr·∇f（数学坐标）；两个面板都画朱红。 */
  push: Vec
  /** 速度 v（数学坐标）；只有动量面板传。 */
  vel?: Vec
}

// 两个面板走同一个组件：viewBox、box、坐标换算都不可能跑偏。
function Panel({ title, def, segs, traj, frame, color, push, vel }: PanelProps) {
  const ih = innerH(def.box)
  const toPx = makeToPx(def.box, ih)
  const i = Math.min(frame, traj.pts.length - 1)
  const walked = traj.pts.slice(0, i + 1)
  const line = walked
    .map((p, k) => {
      const [px, py] = toPx(p[0], p[1])
      return (k === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1)
    })
    .join('')
  const [cx, cy] = toPx(traj.pts[i][0], traj.pts[i][1])
  const [ax, ay] = toPx(traj.pts[i][0] + push[0], traj.pts[i][1] + push[1])
  const vTip = vel ? toPx(traj.pts[i][0] + vel[0], traj.pts[i][1] + vel[1]) : null
  const [gx, gy] = toPx(def.argmin[0], def.argmin[1])
  const lm = def.localMin ? toPx(def.localMin[0], def.localMin[1]) : null
  const [zxTop] = toPx(0, def.box.y1)
  const [, zyMid] = toPx(0, 0)

  return (
    <div className="lab-panel">
      <h4>{title}</h4>
      <svg viewBox={`0 0 ${IW + 2 * PAD} ${ih + 2 * PAD}`} role="img" aria-label={`${title}：等高线与迭代轨迹`}>
        <line x1={zxTop} y1={PAD} x2={zxTop} y2={PAD + ih} stroke="#d9d2c4" strokeWidth={1} />
        <line x1={PAD} y1={zyMid} x2={PAD + IW} y2={zyMid} stroke="#d9d2c4" strokeWidth={1} />
        {segs.map((s, k) => {
          const [x1, y1] = toPx(s[0], s[1])
          const [x2, y2] = toPx(s[2], s[3])
          return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c9c2b2" strokeWidth={0.8} />
        })}

        {lm && <circle cx={lm[0]} cy={lm[1]} r={3} fill="none" stroke="#9a968a" strokeWidth={1.2} strokeDasharray="2 2" />}
        <circle cx={gx} cy={gy} r={3} fill="none" stroke="#9a968a" strokeWidth={1.4} />

        <path d={line} fill="none" stroke={color} strokeWidth={1.5} opacity={0.75} />
        {walked.map((p, k) => {
          const [px, py] = toPx(p[0], p[1])
          return <circle key={k} cx={px} cy={py} r={1.7} fill={color} opacity={0.55} />
        })}

        {/* 速度 v 画在推力下面：两根不同向，就是「惯性」四个字的样子 */}
        {vTip && (
          <g stroke="#4a6b52" fill="#4a6b52" strokeWidth={1.8}>
            <line x1={cx} y1={cy} x2={vTip[0]} y2={vTip[1]} />
            <path d={head(cx, cy, vTip[0], vTip[1])} stroke="none" />
          </g>
        )}
        <g stroke="#d6452c" fill="#d6452c" strokeWidth={1.6}>
          <line x1={cx} y1={cy} x2={ax} y2={ay} />
          <path d={head(cx, cy, ax, ay)} stroke="none" />
        </g>

        <circle cx={cx} cy={cy} r={5.5} fill={color} stroke="#faf7f0" strokeWidth={2} />
      </svg>
    </div>
  )
}

const LW = 680
const LH = 168
const LPL = 40 // 左边留给刻度
const LPT = 12
const LPB = 24
const FLOOR = -8 // 掉到 1e-8 以下就压在底边，否则圆碗上 GD 能跑到 1e-40，纵轴全废

export function Momentum() {
  const [key, setKey] = useState('valley')
  const def = FUNCS.find((d) => d.key === key)!
  const [beta, setBeta] = useState(0.9)
  const [t, setT] = useState(def.t0)
  const [start, setStart] = useState<Vec>(def.start)
  const lr = 10 ** t

  const segs = useMemo(() => {
    const [lo, hi] = rangeOf(def.f, def.box)
    return levelsOf(lo, hi).flatMap((lv) => contourSegments(def.f, def.box, lv))
  }, [def])

  const gd = useMemo(() => trace(def.f, start, lr, 0, def.box), [def, start, lr])
  const mom = useMemo(() => trace(def.f, start, lr, beta, def.box), [def, start, lr, beta])

  const frames = Math.max(gd.pts.length, mom.pts.length)
  const p = usePlayer(frames, 6)

  const gdHit = useMemo(() => hitStep(gd, def.f, def.fmin), [gd, def])
  const momHit = useMemo(() => hitStep(mom, def.f, def.fmin), [mom, def])

  // 两条 loss 曲线：log10(f − f* + 1e-12)，浮点噪声可能让 f 略低于 f*，先夹到 0。
  const loss = useMemo(() => {
    const of = (tr: Traj) =>
      tr.pts.map((q) => Math.max(FLOOR, Math.log10(Math.max(0, def.f(q[0], q[1]) - def.fmin) + 1e-12)))
    return { gd: of(gd), mom: of(mom) }
  }, [gd, mom, def])

  const top = Math.ceil(Math.max(...loss.gd, ...loss.mom, FLOOR + 1))
  const lx = (i: number) => LPL + (frames > 1 ? (i / (frames - 1)) * (LW - LPL - 14) : 0)
  const ly = (v: number) => LPT + (1 - (v - FLOOR) / (top - FLOOR)) * (LH - LPT - LPB)
  const lossPath = (arr: number[]) =>
    arr.map((v, i) => (i === 0 ? 'M' : 'L') + lx(i).toFixed(1) + ' ' + ly(v).toFixed(1)).join('')

  const gi = Math.min(p.i, gd.pts.length - 1)
  const mi = Math.min(p.i, mom.pts.length - 1)
  const gdF = def.f(gd.pts[gi][0], gd.pts[gi][1]) - def.fmin
  const momF = def.f(mom.pts[mi][0], mom.pts[mi][1]) - def.fmin

  // 推力 −lr·∇f 与速度 v 都按真实尺度画：箭头有多长，小球这一步就走多远。
  const gdPush = ((): Vec => {
    const [a, b] = numGrad(def.f, gd.pts[gi][0], gd.pts[gi][1])
    return [-lr * a, -lr * b]
  })()
  const momPush = ((): Vec => {
    const [a, b] = numGrad(def.f, mom.pts[mi][0], mom.pts[mi][1])
    return [-lr * a, -lr * b]
  })()
  // v 就是上一步的位移（因为 x ← x + v）；第 0 步 v = 0。
  const momVel: Vec =
    mi === 0 ? [0, 0] : [mom.pts[mi][0] - mom.pts[mi - 1][0], mom.pts[mi][1] - mom.pts[mi - 1][1]]

  const fmtF = (v: number) => (v < 1e-3 ? Math.max(0, v).toExponential(1) : v.toFixed(3))
  const hitText = (h: number) => (h < 0 ? `—（${STEPS} 步没到）` : `第 ${h} 步`)

  const verdict = (() => {
    if (gdHit < 0 && momHit < 0) return `${STEPS} 步内两边都没到 f − f* < 1e-3`
    if (gdHit < 0) return `只有动量法到了，在第 ${momHit} 步`
    if (momHit < 0) return `只有梯度下降到了，在第 ${gdHit} 步`
    if (momHit < gdHit) return `动量法在第 ${momHit} 步先摸到底，梯度下降第 ${gdHit} 步`
    if (gdHit < momHit) return `梯度下降在第 ${gdHit} 步先摸到底，动量法第 ${momHit} 步`
    return `两边同时在第 ${gdHit} 步到底`
  })()

  // 两条轨迹都跑满 STEPS 步，帧数恒等于 81，usePlayer 的「total 变了就重置」
  // 永远不会触发。所以凡是换数据的地方都得自己把游标拨回开头。
  function pick(d: FuncDef) {
    setKey(d.key)
    setStart(d.start)
    setT(d.t0) // 每个函数的坡度量级差很远，共用一个 lr 会有一边直接发散
    p.reset()
  }

  function randomStart() {
    const cx = (def.box.x0 + def.box.x1) / 2
    const cy = (def.box.y0 + def.box.y1) / 2
    const rx = (def.box.x1 - def.box.x0) * 0.42
    const ry = (def.box.y1 - def.box.y0) * 0.42
    setStart([+(cx + (Math.random() * 2 - 1) * rx).toFixed(3), +(cy + (Math.random() * 2 - 1) * ry).toFixed(3)])
    p.reset()
  }

  return (
    <AlgoShell
      slug="momentum"
      lede={
        <>
          梯度下降每一步只看脚下的坡，走完就忘。动量法让小球带着<strong>速度</strong>往下滚：
          <span className="k">v ← βv − lr∇f</span>，<span className="k">x ← x + v</span>。
          左右两边是同一个函数、同一个起点、同一个学习率，唯一的差别就是右边那个 v。
          把 β 拖到 0，右边会一步不差地变回左边。
        </>
      }
    >
      <div className="lab">
        <div className="controls" style={{ marginTop: 0, marginBottom: 18, borderTop: 'none', paddingTop: 0 }}>
          <div className="seg" role="tablist" aria-label="选择函数">
            {FUNCS.map((d) => (
              <button key={d.key} className={d.key === key ? 'on' : ''} onClick={() => pick(d)}>
                {d.name}
              </button>
            ))}
          </div>
        </div>

        <div className="lab-panels">
          <Panel
            title="普通梯度下降"
            def={def}
            segs={segs}
            traj={gd}
            frame={p.i}
            color="#d6452c"
            push={gdPush}
          />
          <Panel
            title={`动量法 β = ${beta.toFixed(2)}`}
            def={def}
            segs={segs}
            traj={mom}
            frame={p.i}
            color="#4a6b52"
            push={momPush}
            vel={momVel}
          />
        </div>

        <div className="lab-panel" style={{ marginTop: 24 }}>
          <h4>离谷底还差多少 · log₁₀(f − f*)</h4>
          <svg viewBox={`0 0 ${LW} ${LH}`} role="img" aria-label="两种方法的 loss 随步数下降曲线，纵轴取对数">
            {Array.from({ length: top - FLOOR + 1 }, (_, k) => FLOOR + k).map((v) => (
              <g key={v}>
                <line x1={LPL} y1={ly(v)} x2={LW - 14} y2={ly(v)} stroke="#e2dcd0" strokeWidth={0.7} />
                <text x={LPL - 6} y={ly(v) + 3.5} textAnchor="end" fontSize={9} fill="#9a968a" fontFamily="monospace">
                  {v}
                </text>
              </g>
            ))}
            <line x1={LPL} y1={ly(top)} x2={LPL} y2={ly(FLOOR)} stroke="#d9d2c4" strokeWidth={1} />
            <text x={LW - 14} y={LH - 8} textAnchor="end" fontSize={9} fill="#9a968a" fontFamily="monospace">
              步数 →
            </text>

            <path d={lossPath(loss.gd)} fill="none" stroke="#d6452c" strokeWidth={1.6} />
            <path d={lossPath(loss.mom)} fill="none" stroke="#4a6b52" strokeWidth={1.6} />

            <line x1={lx(p.i)} y1={LPT} x2={lx(p.i)} y2={ly(FLOOR)} stroke="#9a968a" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={lx(gi)} cy={ly(loss.gd[gi])} r={3.5} fill="#d6452c" stroke="#faf7f0" strokeWidth={1.6} />
            <circle cx={lx(mi)} cy={ly(loss.mom[mi])} r={3.5} fill="#4a6b52" stroke="#faf7f0" strokeWidth={1.6} />
          </svg>
        </div>

        <div className="legend">
          <span><i style={{ background: '#d6452c' }} />朱红 = 普通梯度下降（轨迹、loss 曲线）</span>
          <span><i style={{ background: '#4a6b52' }} />墨绿 = 动量法（轨迹、loss 曲线、速度 v 箭头）</span>
          <span><i style={{ background: '#d6452c' }} />朱红箭头 = 这一步的推力 −lr∇f，两边都画</span>
          <span><i style={{ background: '#9a968a' }} />灰圈 = 全局最小点，虚线圈 = 浅的局部坑</span>
        </div>

        <Player p={p} extra={<button className="btn" onClick={randomStart}>随机起点</button>} />

        <div className="step-note">
          第 {p.i} 步 · 梯度下降 f − f* = {fmtF(gdF)}，动量法 f − f* = {fmtF(momF)}。 <em>{verdict}</em>
          {gd.diverged && '（梯度下降跑出了画面，轨迹在此截断）'}
          {mom.diverged && '（动量法跑出了画面，轨迹在此截断）'}
        </div>

        <div className="controls">
          <div className="control">
            <label htmlFor="beta">动量 β <b>{beta.toFixed(2)}</b></label>
            <input id="beta" type="range" min={0} max={0.95} step={0.01} value={beta}
              onChange={(e) => setBeta(+e.target.value)} />
          </div>
          <div className="control">
            <label htmlFor="lr">学习率 lr <b>{lr.toFixed(3)}</b></label>
            <input id="lr" type="range" min={-2} max={-0.3} step={0.01} value={t}
              onChange={(e) => setT(+e.target.value)} />
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '22em' }}>
            两个面板共用一个 box、一个 viewBox、一套等高线。谁跑得快，量出来的。
          </div>
        </div>

        <div className="readout">
          <div className="item">
            <span className="lbl">梯度下降 · 到 f − f* &lt; 1e-3</span>
            <span className="val">{hitText(gdHit)}</span>
          </div>
          <div className="item">
            <span className="lbl">动量法 · 到 f − f* &lt; 1e-3</span>
            <span className="val">{hitText(momHit)}</span>
          </div>
          <div className="item">
            <span className="lbl">梯度下降 · 当前 f − f*</span>
            <span className="val">{fmtF(gdF)}</span>
          </div>
          <div className="item">
            <span className="lbl">动量法 · 当前 f − f*</span>
            <span className="val">{fmtF(momF)}</span>
          </div>
          <div className="item">
            <span className="lbl">有效平均窗口 1/(1−β)</span>
            <span className="val">{(1 / (1 - beta)).toFixed(1)} 步</span>
          </div>
        </div>
      </div>

      <p style={{ color: 'var(--ink-soft)', fontSize: 15 }}>{def.note}</p>

      <h2>v 是过去所有梯度的加权平均</h2>
      <p>
        把 <span className="k">v ← βv − lr·g</span> 往回展开一层，再展开一层：
        <span className="k">v_k = −lr(g_k + βg_(k−1) + β²g_(k−2) + …)</span>。
        速度不是某一步的梯度，是历史上每一步梯度的指数加权和，越久远的权重越低。
        换个说法，v 是梯度序列的一阶低通滤波器：高频的抖动被滤掉，低频的趋势被留下。
        普通梯度下降是这个式子在 β=0 时的特例，窗口长度只有一步，也就是完全没有记性。
      </p>

      <h2>为什么这能同时减震和加速</h2>
      <p>
        看那只狭长的碗。<strong>震荡方向</strong>（上下）上，小球在两壁之间来回弹，相邻两步的梯度符号相反，
        加权求和时正负相消，v 在这个方向上始终接近 0，震荡就被抹平了。
        <strong>沿谷方向</strong>（左右）上，梯度一路指向同一边，符号始终一致，加权求和时一项项叠上去，
        v 越滚越大，小球越走越快。一个式子，两件事，靠的都是「把最近若干步的梯度加起来」这一个动作。
        上一页梯度下降那条之字形，病根就是它在震荡方向上迈得太大、在沿谷方向上迈得太小；
        动量法没有改学习率，只是让这两个方向的梯度以不同的方式互相干涉。
      </p>

      <h2>β 是记性有多长</h2>
      <p>
        β 大致等于「把最近 <span className="k">1/(1−β)</span> 步的梯度平均起来」。
        β=0.9 就是记住最近 10 步，β=0.95 是 20 步，β=0 是一步都不记，退回普通梯度下降。
        记性长了并不总是好事：惯性大到刹不住，小球会一头冲过谷底，绕着底转好几圈才停。
        把 β 拖到 0.95 看看圆碗那张图，动量法的 loss 曲线在底部反复起落，而梯度下降早就一条直线扎下去了。
        在没有病态方向的地方，动量提供的是负担而不是帮助。
      </p>

      <h2>惯性能不能翻过一道坎</h2>
      <p>
        双谷那张图里，右边是个浅坑，左边才是真正的底。梯度下降滑进浅坑，梯度归零，它就永远停在那里。
        动量法带着速度冲进浅坑，还有余力往上爬，有机会翻过中间那道坎。
        但这是运气，不是本事：同一个起点，β=0.8 冲不出去，β=0.85 和 0.9 冲得出去，β=0.95 冲过头，
        80 步内在深坑里还没停稳。换个学习率、换个起点，结论就换一遍。
        readout 里那两个步数不是我写死的，是每次参数变了当场重跑 80 步数出来的，拖着滑块自己看。
      </p>

      <Landing>
        SGD + momentum 是深度学习十年来的默认配方，ResNet、Transformer 的原始训练脚本里 β 基本都写 0.9。
        Nesterov 加速梯度是它的「先按惯性滑一步、在落脚点再看坡」版本，一个前瞻动作换来更好的收敛常数。
        Adam 里的一阶矩 <span className="k">m_t</span> 就是这里的 v（只是改成了归一化的加权平均），
        二阶矩 <span className="k">v_t</span> 另管每个坐标的自适应步长。你在这页拖的那个 β，就是 Adam 的 β₁。
      </Landing>
    </AlgoShell>
  )
}

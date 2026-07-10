import { useMemo, useRef, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'
import { Player } from '../components/Player'
import { usePlayer } from '../lib/player'
import { contourSegments, levelsOf, numGrad, rangeOf, type Box, type Scalar2 } from '../lib/field'

/* ────────────────────────────────────────────────────────────
   梯度下降 · 小球怎么滚到谷底
   核心直觉：∇f 指向最陡的上坡，那么 −∇f 就是最陡的下坡。
   梯度下降只做一件事：往脚下最陡的下坡方向挪一小步，然后重新
   看一眼脚下，再挪一步。学习率就是「这一小步有多小」。
   步子太小，走一万步还在山腰；步子太大，一步跨过谷底弹到对面
   碗壁，弹得比来时还高，于是指数级发散。
   狭长的碗里两个方向陡度悬殊，学习率必须迁就最陡的那个方向，
   于是在最平的方向上慢得让人绝望，轨迹走成之字形。
   ──────────────────────────────────────────────────────────── */

type Vec = [number, number]

type FuncDef = {
  key: string
  name: string
  f: Scalar2
  box: Box
  fMin: number       // 全局最小值（画 log 下降曲线时要先减掉它）
  minima: Vec[]      // 局部极小的位置，画成墨绿参考点
  start: Vec
  note: string
}

const FUNCS: FuncDef[] = [
  {
    key: 'bowl',
    name: '圆碗 x² + y²',
    f: (x, y) => x * x + y * y,
    box: { x0: -3, x1: 3, y0: -3, y1: 3 },
    fMin: 0,
    minima: [[0, 0]],
    start: [2.5, 2.2],
    note: '等高线是同心圆，梯度直指圆心。方向从头到尾不变，小球一步一步稳稳滚到底。',
  },
  {
    key: 'valley',
    name: '狭长椭圆碗 0.08x² + y²',
    f: (x, y) => 0.08 * x * x + y * y,
    box: { x0: -4, x1: 4, y0: -1.6, y1: 1.6 },
    fMin: 0,
    minima: [[0, 0]],
    start: [-3.6, 1.35],
    note: '两个方向的曲率差 12.5 倍。梯度几乎垂直于长轴，小球在碗壁之间来回弹，沿谷底方向蹭得极慢。把学习率拖大：先走成之字形，再大就直接弹出去。',
  },
  {
    key: 'twin',
    name: '双谷 0.06(x⁴ − 8x²) + y²',
    f: (x, y) => 0.06 * (x ** 4 - 8 * x * x) + y * y,
    box: { x0: -3.5, x1: 3.5, y0: -1.75, y1: 1.75 },
    fMin: -0.96,
    minima: [[-2, 0], [2, 0]],
    start: [-0.45, 1.5],
    note: '两个坑一样深。起点落在 x = 0 左边就滚进左坑，落在右边就滚进右坑。梯度下降只看脚下，不看远处有没有更深的谷。',
  },
]

const MAX_STEPS = 80
const GRAD_TOL = 1e-3

type Status = 'running' | 'converged' | 'diverged'
interface Frame {
  x: number
  y: number
  f: number
  gx: number
  gy: number
  gnorm: number
  diverged: boolean
}

/** 逃逸判据：跑出 box 外围半个身位就算飞了，不必等它溢出成 Infinity。 */
function escaped(box: Box, x: number, y: number): boolean {
  const mx = (box.x1 - box.x0) * 0.5
  const my = (box.y1 - box.y0) * 0.5
  return x < box.x0 - mx || x > box.x1 + mx || y < box.y0 - my || y > box.y1 + my
}

/** 一次性把整条轨迹摊平成帧数组：x ← x − lr·∇f，最多 80 步。 */
function descend(def: FuncDef, start: Vec, lr: number): { frames: Frame[]; status: Status } {
  const frames: Frame[] = []
  let status: Status = 'running'
  let [x, y] = start

  for (let k = 0; k <= MAX_STEPS; k++) {
    const f = def.f(x, y)
    const [gx, gy] = numGrad(def.f, x, y)
    const gnorm = Math.hypot(gx, gy)
    const broke = !Number.isFinite(f) || !Number.isFinite(gnorm) || escaped(def.box, x, y)

    frames.push({ x, y, f, gx, gy, gnorm, diverged: broke })
    if (broke) {
      status = 'diverged'
      break
    }
    if (gnorm < GRAD_TOL) {
      status = 'converged'
      break
    }
    if (k === MAX_STEPS) break
    x -= lr * gx
    y -= lr * gy
  }
  return { frames, status }
}

const VBW = 360
const PAD = 20
const RW = 360
const RH = 240
const RPAD = 26

const CONTOUR = '#c9c2b2'
const AXIS = '#d9d2c4'
const FAINT = '#9a968a'
const RED = '#d6452c'
const MOSS = '#4a6b52'

function num(v: number, d = 3): string {
  if (!Number.isFinite(v)) return '∞'
  const a = Math.abs(v)
  if (a !== 0 && (a < 1e-3 || a >= 1e4)) return v.toExponential(1)
  return v.toFixed(d)
}

// 箭头 = 一条线 + 一个三角头，短到画不下头就整根不画。
function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (!Number.isFinite(len) || len < 3) return null
  const ux = dx / len
  const uy = dy / len
  const head = Math.min(8, len * 0.42)
  const bx = x2 - ux * head
  const by = y2 - uy * head
  const w = head * 0.42
  return (
    <g>
      <line x1={x1} y1={y1} x2={bx} y2={by} stroke={RED} strokeWidth={1.8} />
      <polygon
        points={`${x2},${y2} ${bx - uy * w},${by + ux * w} ${bx + uy * w},${by - ux * w}`}
        fill={RED}
      />
    </g>
  )
}

export function GradientDescent() {
  const [key, setKey] = useState('valley')
  // 每个函数各自记住自己的起点，切换回来不会丢；也就不需要用 effect 去同步。
  const [starts, setStarts] = useState<Record<string, Vec>>(
    () => Object.fromEntries(FUNCS.map((d) => [d.key, d.start])),
  )
  // 学习率走对数刻度：滑块 t ∈ [−2, 0.3]，lr = 10^t，一路覆盖「蹭」到「炸」。
  const [lrExp, setLrExp] = useState(-0.8)
  const svgRef = useRef<SVGSVGElement>(null)

  const def = FUNCS.find((d) => d.key === key)!
  const box = def.box
  const start = starts[key]
  const lr = Math.pow(10, lrExp)

  // 左面板的坐标换算：x、y 用同一把尺，viewBox 高度按 box 的长宽比来，图形不变形。
  const geo = useMemo(() => {
    const iw = VBW - 2 * PAD
    const ih = (iw * (box.y1 - box.y0)) / (box.x1 - box.x0)
    const vbh = ih + 2 * PAD
    const toPx = (x: number, y: number): Vec => [
      PAD + ((x - box.x0) / (box.x1 - box.x0)) * iw,
      vbh - PAD - ((y - box.y0) / (box.y1 - box.y0)) * ih,
    ]
    return { vbh, toPx }
  }, [box])
  const { vbh, toPx } = geo

  // 等高线只跟函数有关，跟起点、学习率无关，所以单独 memo，拖动时不重算。
  const contourPaths = useMemo(() => {
    const [lo, hi] = rangeOf(def.f, box, 48)
    return levelsOf(lo, hi, 10, 2).map((level) =>
      contourSegments(def.f, box, level, 60)
        .map(([ax, ay, bx, by]) => {
          const [p1, p2] = toPx(ax, ay)
          const [p3, p4] = toPx(bx, by)
          return `M${p1.toFixed(1)} ${p2.toFixed(1)}L${p3.toFixed(1)} ${p4.toFixed(1)}`
        })
        .join(''),
    )
  }, [def, box, toPx])

  const run = useMemo(() => descend(def, start, lr), [def, start, lr])
  const { frames, status } = run

  const p = usePlayer(frames.length)
  const i = Math.min(p.i, frames.length - 1)
  const cur = frames[i]
  const atLast = i === frames.length - 1

  // 右面板的纵轴：f 可能跨几个数量级，直接画的话收敛段全糊在一条水平线上。
  // 双谷函数的 f 还有负值，所以先减掉全局最小 fMin 再取 log10（加 1e-12 防 log(0)）。
  const plot = useMemo(() => {
    const ok = frames.filter((fr) => !fr.diverged)
    const vals = ok.length ? ok.map((fr) => Math.log10(Math.max(fr.f - def.fMin, 0) + 1e-12)) : [0]
    let hi = Math.max(...vals)
    let lo = Math.min(...vals)
    if (hi - lo < 1) hi = lo + 1
    lo = Math.max(lo, hi - 13) // 收敛到机器精度时 log 会掉到 −12，截住免得轴被拉扁
    const iw = RW - 2 * RPAD
    const ih = RH - 2 * RPAD
    const span = Math.max(1, frames.length - 1)
    const px = (k: number) => RPAD + (k / span) * iw
    // 发散的那一帧 f 已经飞了，值 clamp 到画布上界，不让它把整个纵轴拉垮。
    const py = (fr: Frame) => {
      const v = fr.diverged ? hi : Math.min(hi, Math.max(lo, Math.log10(Math.max(fr.f - def.fMin, 0) + 1e-12)))
      return RH - RPAD - ((v - lo) / (hi - lo)) * ih
    }
    return { px, py }
  }, [frames, def])

  function pointerToMath(e: React.PointerEvent) {
    const svg = svgRef.current
    if (!svg) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const pt = new DOMPointReadOnly(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    const iw = VBW - 2 * PAD
    const ih = vbh - 2 * PAD
    const x = box.x0 + ((pt.x - PAD) / iw) * (box.x1 - box.x0)
    const y = box.y0 + ((vbh - PAD - pt.y) / ih) * (box.y1 - box.y0)
    const cx = Math.max(box.x0, Math.min(box.x1, x))
    const cy = Math.max(box.y0, Math.min(box.y1, y))
    setStarts((s) => ({ ...s, [key]: [+cx.toFixed(3), +cy.toFixed(3)] }))
  }

  function randomStart() {
    const rx = box.x0 + (box.x1 - box.x0) * (0.08 + 0.84 * Math.random())
    const ry = box.y0 + (box.y1 - box.y0) * (0.08 + 0.84 * Math.random())
    setStarts((s) => ({ ...s, [key]: [+rx.toFixed(3), +ry.toFixed(3)] }))
    p.reset()
  }

  // 走过的路：正常段实线，发散时最后一跳画成虚线（它已经飞出画布了）。
  const walked = frames.slice(0, i + 1)
  const solid = status === 'diverged' && atLast ? walked.slice(0, -1) : walked
  const solidD = solid
    .map((fr, k) => {
      const [a, b] = toPx(fr.x, fr.y)
      return (k === 0 ? 'M' : 'L') + a.toFixed(1) + ' ' + b.toFixed(1)
    })
    .join('')
  let flyD = ''
  if (status === 'diverged' && atLast && frames.length >= 2) {
    const [a, b] = toPx(frames[frames.length - 2].x, frames[frames.length - 2].y)
    const [c, d] = toPx(cur.x, cur.y)
    flyD = `M${a.toFixed(1)} ${b.toFixed(1)}L${c.toFixed(1)} ${d.toFixed(1)}`
  }

  const [curX, curY] = toPx(cur.x, cur.y)
  // 箭头画的就是下一步的真实位移 −lr·∇f：学习率大 = 箭头长 = 一步跨过谷底。
  const [nextX, nextY] = toPx(cur.x - lr * cur.gx, cur.y - lr * cur.gy)
  const [zeroX] = toPx(0, box.y0)
  const [, zeroY] = toPx(box.x0, 0)

  const statusText = status === 'converged' ? '已收敛' : status === 'diverged' ? '发散' : '下降中'

  let stepNote: React.ReactNode
  if (atLast && status === 'converged') {
    stepNote = <span className="done">梯度归零，停在谷底（第 {i} 步）</span>
  } else if (atLast && status === 'diverged') {
    stepNote = <>第 {i} 步：跨过谷底弹到了对面，f 反而变大。学习率太大，炸了。</>
  } else {
    stepNote = (
      <>
        第 {i} 步：f = <em>{num(cur.f)}</em>，|∇f| = {num(cur.gnorm, 2)}，这一步挪了 {num(lr * cur.gnorm)}
      </>
    )
  }

  return (
    <AlgoShell
      slug="gradient-descent"
      lede={
        <>
          站在山坡上只看脚下：哪边最陡，就往反方向挪一小步，然后重新看一眼脚下。
          梯度下降就这一句话，<span className="k">x ← x − lr·∇f(x)</span>，重复几十次。
          拖动起点选一个位置，再把学习率拖大，看小球怎么从稳稳滚下去变成在碗壁之间反复横跳。
        </>
      }
    >
      <div className="lab">
        <div className="controls" style={{ marginTop: 0, marginBottom: 18, borderTop: 'none', paddingTop: 0 }}>
          <div className="seg" role="tablist" aria-label="选择函数">
            {FUNCS.map((d) => (
              <button key={d.key} className={d.key === key ? 'on' : ''} onClick={() => { setKey(d.key); p.reset() }}>
                {d.name}
              </button>
            ))}
          </div>
        </div>

        <div className="lab-panels">
          <div className="lab-panel">
            <h4>等高线 + 轨迹 · 拖动起点</h4>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VBW} ${vbh}`}
              onPointerDown={(ev) => {
                ;(ev.target as Element).setPointerCapture?.(ev.pointerId)
                p.reset()
                pointerToMath(ev)
              }}
              onPointerMove={(ev) => {
                if (ev.buttons) pointerToMath(ev)
              }}
              role="img"
              aria-label="等高线地图与梯度下降轨迹，可拖动起点"
            >
              {box.x0 <= 0 && box.x1 >= 0 && (
                <line x1={zeroX} y1={PAD} x2={zeroX} y2={vbh - PAD} stroke={AXIS} strokeWidth={1} />
              )}
              {box.y0 <= 0 && box.y1 >= 0 && (
                <line x1={PAD} y1={zeroY} x2={VBW - PAD} y2={zeroY} stroke={AXIS} strokeWidth={1} />
              )}
              {contourPaths.map((d, k) => (
                <path key={k} d={d} fill="none" stroke={CONTOUR} strokeWidth={1} />
              ))}

              {def.minima.map(([mx, my], k) => {
                const [a, b] = toPx(mx, my)
                return <circle key={k} cx={a} cy={b} r={3.5} fill="none" stroke={MOSS} strokeWidth={1.6} />
              })}

              <path d={solidD} fill="none" stroke={RED} strokeWidth={1.6} opacity={0.75} />
              {flyD && <path d={flyD} fill="none" stroke={RED} strokeWidth={1.6} strokeDasharray="5 4" />}
              {walked.slice(0, -1).map((fr, k) => {
                const [a, b] = toPx(fr.x, fr.y)
                return <circle key={k} cx={a} cy={b} r={2} fill={RED} opacity={0.7} />
              })}

              {!cur.diverged && <Arrow x1={curX} y1={curY} x2={nextX} y2={nextY} />}
              <circle cx={curX} cy={curY} r={6} fill={RED} stroke="#faf7f0" strokeWidth={2} />
            </svg>
          </div>

          <div className="lab-panel">
            <h4>f 随步数下降 · 纵轴 log₁₀(f − f*)</h4>
            <svg viewBox={`0 0 ${RW} ${RH}`} role="img" aria-label="损失随步数下降的曲线，纵轴取对数">
              <line x1={RPAD} y1={RH - RPAD} x2={RW - RPAD} y2={RH - RPAD} stroke={AXIS} strokeWidth={1} />
              <line x1={RPAD} y1={RPAD} x2={RPAD} y2={RH - RPAD} stroke={AXIS} strokeWidth={1} />
              <text x={RW - RPAD} y={RH - RPAD + 15} textAnchor="end" fontSize={10} fill={FAINT} fontFamily="monospace">
                步数
              </text>

              <path
                d={frames
                  .map((fr, k) => (k === 0 ? 'M' : 'L') + plot.px(k).toFixed(1) + ' ' + plot.py(fr).toFixed(1))
                  .join('')}
                fill="none"
                stroke={FAINT}
                strokeWidth={1.6}
              />
              <path
                d={walked
                  .map((fr, k) => (k === 0 ? 'M' : 'L') + plot.px(k).toFixed(1) + ' ' + plot.py(fr).toFixed(1))
                  .join('')}
                fill="none"
                stroke={RED}
                strokeWidth={1.8}
              />
              <line
                x1={plot.px(i)}
                y1={RPAD}
                x2={plot.px(i)}
                y2={RH - RPAD}
                stroke={RED}
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.5}
              />
              <circle cx={plot.px(i)} cy={plot.py(cur)} r={5} fill={RED} stroke="#faf7f0" strokeWidth={2} />
            </svg>
          </div>
        </div>

        <div className="controls">
          <div className="control">
            <label htmlFor="lr">
              学习率 lr <b>{lr < 0.1 ? lr.toFixed(3) : lr.toFixed(2)}</b>
            </label>
            <input
              id="lr"
              type="range"
              min={-2}
              max={0.3}
              step={0.01}
              value={lrExp}
              onChange={(ev) => setLrExp(+ev.target.value)}
            />
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '22em' }}>
            滑块走的是对数刻度，从 0.01 到 2。箭头就是下一步的真实位移：把 lr 拖大，箭头变长，
            长到一步能跨过谷底时，小球开始来回弹。
          </div>
        </div>

        <div className="legend">
          <span>
            <i style={{ background: RED }} />
            小球与轨迹
          </span>
          <span>
            <i style={{ background: CONTOUR }} />
            等高线（同一圈上 f 相等）
          </span>
          <span>
            <i style={{ border: `1.6px solid ${MOSS}`, borderRadius: '50%' }} />
            局部极小的位置
          </span>
        </div>

        <Player p={p} extra={<button className="btn" onClick={randomStart}>随机起点</button>} />

        <div className="step-note">{stepNote}</div>

        <div className="readout">
          <div className="item">
            <span className="lbl">当前 f</span>
            <span className="val">{num(cur.f)}</span>
          </div>
          <div className="item">
            <span className="lbl">梯度大小 |∇f|</span>
            <span className="val">{num(cur.gnorm, 2)}</span>
          </div>
          <div className="item">
            <span className="lbl">走到第几步</span>
            <span className="val">{i}</span>
          </div>
          <div className="item">
            <span className="lbl">状态</span>
            <span className="val">{statusText}</span>
          </div>
        </div>
      </div>

      <p style={{ color: 'var(--ink-soft)', fontSize: 15 }}>{def.note}</p>

      <h2>为什么是「减」梯度</h2>
      <p>
        梯度场那一页说了：<span className="k">∇f</span> 指向最陡的上坡。要下山，就往它的反方向走，
        于是有了 <span className="k">x ← x − lr·∇f(x)</span>。梯度下降从头到尾只做这一件事，
        往脚下最陡的下坡方向挪一小步，然后<strong>重新看一眼脚下</strong>，再挪一步。
        它不知道谷底在哪，也不需要知道；每一步的方向都是就地现算出来的。
      </p>

      <h2>学习率就是「这一小步有多小」</h2>
      <p>
        <span className="k">lr</span> 太小，每一步都挪一丁点，走一万步还在山腰。
        <span className="k">lr</span> 太大，一步跨过谷底弹到对面碗壁，落点比来时还高，
        下一步弹得更远，f 指数级往上炸。画布上的朱红箭头画的就是下一步的真实位移，
        它多长，小球就挪多远。在<strong>狭长椭圆碗</strong>上把 lr 从 0.1 拖到 0.9，之字形一眼可见；
        再往上一点，小球直接飞出画布。
      </p>

      <h2>之字形的根源是病态，不是复杂</h2>
      <p>
        椭圆碗简单到只有两项，可它照样让梯度下降走成之字形。原因在两个方向的曲率：
        y 方向是 <span className="k">1</span>，x 方向只有 <span className="k">0.08</span>，差了 12.5 倍。
        学习率必须迁就最陡的那个方向（否则一上来就在 y 方向发散），于是在最平的 x 方向上，
        每一步只挪那么一点点。梯度几乎垂直于长轴，小球花大部分力气在两侧碗壁之间来回穿，
        真正沿谷底前进的分量少得可怜。
      </p>
      <p>
        决定收敛快慢的是这个曲率比值，也就是<strong>条件数</strong>，不是函数写出来有多长。
        条件数 12.5 已经这么难看，真实的神经网络损失面动辄成千上万。
        下一页的动量法就是来治这个的。
      </p>

      <h2>它没有全局视野</h2>
      <p>
        切到双谷函数，把起点拖到 x = 0 的左边再拖到右边：小球落进哪个坑，只取决于起点。
        梯度下降永远只看脚下这一小片地，不会知道翻过前面那道坎还有个一样深（或者更深）的谷。
        高维空间里这件事没有听起来那么可怕，但「初始化决定终点」这条，从这张两坑的图就能看明白。
      </p>

      <Landing>
        今天所有神经网络的训练都压在这张图上，只不过参数不是两个而是几亿个，那张等高线图铺在几亿维里。
        学习率是调参的第一个旋钮，调错了模型根本不收敛；而病态和之字形直接催生了后面一整条技术线：
        动量、Adam、二阶方法，以及 BatchNorm、LayerNorm 这些专门把损失面「捏圆」的归一化层。
      </Landing>
    </AlgoShell>
  )
}

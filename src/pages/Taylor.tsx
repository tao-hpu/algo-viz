import { useMemo, useRef, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'

/* ────────────────────────────────────────────────────────────
   泰勒展开 · 用多项式一层层裹住曲线
   核心直觉：多项式 Tₙ 只在一点 a 上向 f 看齐，看齐的方式是让
   0 阶到 n 阶导数全部相等。系数里的 1/k! 就是为了抵消求 k 次导
   时冒出来的 k!。n=1 时它退化成切线，也就是「局部线性化」那页。
   代价写在余项里：误差 ≈ f⁽ⁿ⁺¹⁾(ξ)/(n+1)! · (x−a)ⁿ⁺¹，所以靠近
   a 误差塌得飞快，离得远就爆炸。而多项式看不见远处的奇点，
   它手里只有 a 这一点的信息，于是逼近范围被最近的奇点卡死。
   ──────────────────────────────────────────────────────────── */

type Vec = [number, number]
type FuncDef = {
  key: string
  name: string
  f: (x: number) => number
  /** 解析的 n 阶导。高阶导用有限差分算会被舍入误差吃光，只能手推。 */
  dn: (n: number, x: number) => number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  aMin: number
  aMax: number
  a0: number
  probe0: number
  note: string
}

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320]
const MAXN = 8

const FUNCS: FuncDef[] = [
  {
    key: 'sin',
    name: 'sin x',
    f: Math.sin,
    // sin 每求一次导就相当于把相位推进 π/2
    dn: (n, x) => Math.sin(x + (n * Math.PI) / 2),
    xMin: -2 * Math.PI,
    xMax: 2 * Math.PI,
    yMin: -1.6,
    yMax: 1.6,
    aMin: -5.8,
    aMax: 5.8,
    a0: 0,
    probe0: 4.2,
    note: 'sin 在整条实轴上都没有奇点，所以贴合范围会随阶数一直往两边长。n=3 时只在展开点附近像样，加到 7、8，整个 ±π 都几乎看不出差别。',
  },
  {
    key: 'exp',
    name: 'eˣ',
    f: Math.exp,
    dn: (_n, x) => Math.exp(x),
    xMin: -2,
    xMax: 2.6,
    yMin: -1.5,
    yMax: 10,
    aMin: -1.8,
    aMax: 2.3,
    a0: 0,
    probe0: 2.2,
    note: 'eˣ 的每一阶导数都是它自己，在 a=0 处系数就是 1/k!，掉得极快。少数几项就能吃掉很宽的一段，误差曲线也随阶数整体往下沉。',
  },
  {
    key: 'geom',
    name: '1/(1−x)',
    f: (x) => 1 / (1 - x),
    // 逐次求导：n! / (1−x)^(n+1)
    dn: (n, x) => FACT[n] / Math.pow(1 - x, n + 1),
    xMin: -1.6,
    xMax: 0.94,
    yMin: -1,
    yMax: 6,
    aMin: -0.85,
    aMax: 0.85,
    a0: 0,
    probe0: 0.88,
    note: 'x=1 是奇点，函数在那里炸掉。以 a 为中心的展开只在 |x−a| < |1−a| 里收敛：把展开点 a 拖到 0.85，收敛半径就只剩 0.15，这时探针拖到左边（x < −0.65）就出了射程，阶数加到 8 反而甩得更狠。',
  },
  {
    key: 'log',
    name: 'ln(1+x)',
    f: (x) => Math.log(1 + x),
    // n=0 是函数本身；n≥1 交替变号，(−1)^(n−1)·(n−1)!/(1+x)^n
    dn: (n, x) => (n === 0 ? Math.log(1 + x) : ((n % 2 === 1 ? 1 : -1) * FACT[n - 1]) / Math.pow(1 + x, n)),
    xMin: -0.95,
    xMax: 3,
    yMin: -3.2,
    yMax: 1.6,
    aMin: -0.8,
    aMax: 2.6,
    a0: 0,
    probe0: 2.2,
    note: '奇点挪到了 x=−1，收敛半径是 |−1−a|。a=0 时半径只有 1，探针停在 x=2.2 就已经在射程之外，加阶只让曲线甩得更远；把 a 往右拖到 1.5，半径变成 2.5，同一个探针立刻被收进来。',
  },
]

const VBW = 340
const VBH = 230
const PAD = 24
const LOG_MIN = -12.5
const LOG_MAX = 2.5
const GRID_EXP = [2, 0, -2, -4, -6, -8, -10, -12]

const SUP = ['', '', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸']
const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈']
const SUPD: Record<string, string> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
}
const supNum = (v: number) => String(v).split('').map((c) => SUPD[c]).join('')

// 高阶多项式很容易冲出画布甚至变成 ±Infinity，画之前一律夹回上下界。
// Infinity / −Infinity 会被比较运算正确地夹住；NaN 走首行兜底。
function clamp(v: number, lo: number, hi: number) {
  if (Number.isNaN(v)) return hi
  return v < lo ? lo : v > hi ? hi : v
}

function makeToPx(xMin: number, xMax: number, yMin: number, yMax: number) {
  return (x: number, y: number): Vec => {
    const px = PAD + ((x - xMin) / (xMax - xMin)) * (VBW - 2 * PAD)
    const py = VBH - PAD - ((y - yMin) / (yMax - yMin)) * (VBH - 2 * PAD)
    return [px, py]
  }
}

// 冲出画布的那一段直接抬笔，不画。若改成把 y 夹回边界，曲线会贴着上下边横着走，
// 看起来像「这里的多项式是个常数」，正好把发散讲反了。
function curvePath(
  xMin: number, xMax: number, yMin: number, yMax: number,
  toPx: (x: number, y: number) => Vec,
  fn: (x: number) => number,
  n = 220,
) {
  let path = ''
  let penDown = false
  for (let i = 0; i <= n; i++) {
    const x = xMin + ((xMax - xMin) * i) / n
    const v = fn(x)
    const inside = Number.isFinite(v) && v >= yMin && v <= yMax
    if (inside) {
      const [px, py] = toPx(x, v)
      path += (penDown ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1)
      penDown = true
    } else if (penDown) {
      // 出界的第一个点仍然画到边界上，让曲线是「冲出去」而不是半路凭空消失
      const [px, py] = toPx(x, clamp(v, yMin, yMax))
      path += 'L' + px.toFixed(1) + ' ' + py.toFixed(1)
      penDown = false
    }
  }
  return path
}

// Horner 从最高阶往下收，避免逐项算 (x−a)^k 反复放大舍入。
function evalT(coefs: number[], n: number, a: number, x: number) {
  let s = 0
  for (let k = n; k >= 0; k--) s = s * (x - a) + coefs[k]
  return s
}

// 把 Tₙ 直接写成一行人能读的多项式，比只报一串系数有说服力。
function polyText(coefs: number[], n: number, a: number) {
  const zeroA = Math.abs(a) < 5e-3
  const base = zeroA ? 'x' : a > 0 ? `(x−${a.toFixed(2)})` : `(x+${(-a).toFixed(2)})`
  const shown = Math.min(n, 4)
  const parts: string[] = []
  for (let k = 0; k <= shown; k++) {
    const c = coefs[k]
    const mag = Math.abs(c).toFixed(3)
    const body = k === 0 ? mag : k === 1 ? `${mag}·${base}` : `${mag}·${base}${SUP[k]}`
    parts.push(k === 0 ? (c < 0 ? `−${mag}` : mag) : `${c < 0 ? '−' : '+'} ${body}`)
  }
  if (n > shown) parts.push('+ …')
  return `T${SUB[n]}(x) = ${parts.join(' ')}`
}

const fmt = (v: number) => {
  if (!Number.isFinite(v)) return '∞'
  if (Math.abs(v) >= 1e4) return v.toExponential(2)
  if (Math.abs(v) < 5e-4) return '0.000'
  return v.toFixed(3)
}

export function Taylor() {
  const [key, setKey] = useState('sin')
  const d = FUNCS.find((f) => f.key === key)!
  const [n, setN] = useState(3)
  const [a, setA] = useState(() => d.a0)
  const [probe, setProbe] = useState(() => d.probe0)
  const svgRef = useRef<SVGSVGElement>(null)

  // 切函数时 a / probe 可能落在新定义域外，渲染时就地夹紧。
  const ca = clamp(a, d.aMin, d.aMax)
  const cp = clamp(probe, d.xMin, d.xMax)

  // 系数只跟函数和展开点有关，跟阶数无关：一次算满 0..8，滑阶数时不用重算。
  const coefs = useMemo(() => {
    const arr: number[] = []
    for (let k = 0; k <= MAXN; k++) arr.push(d.dn(k, ca) / FACT[k])
    return arr
  }, [d, ca])

  const toPx = makeToPx(d.xMin, d.xMax, d.yMin, d.yMax)
  const toPxE = makeToPx(d.xMin, d.xMax, LOG_MIN, LOG_MAX)

  const tn = (x: number) => evalT(coefs, n, ca, x)
  const logErr = (x: number) => Math.log10(Math.max(Math.abs(d.f(x) - tn(x)), 1e-16))

  // toPx / logErr 都是 d、coefs、n、ca 的纯函数，依赖列出这四个就够。
  const curveD = useMemo(() => curvePath(d.xMin, d.xMax, d.yMin, d.yMax, toPx, d.f), [d])
  const taylorD = useMemo(
    () => curvePath(d.xMin, d.xMax, d.yMin, d.yMax, toPx, (x) => evalT(coefs, n, ca, x)),
    [d, coefs, n, ca],
  )
  // 0..n−1 阶的残影，看得见「一层层裹上去」的过程。
  const ghostsD = useMemo(() => {
    const out: string[] = []
    for (let k = 0; k < n; k++) {
      out.push(curvePath(d.xMin, d.xMax, d.yMin, d.yMax, toPx, (x) => evalT(coefs, k, ca, x), 120))
    }
    return out
  }, [d, coefs, n, ca])
  const errD = useMemo(() => curvePath(d.xMin, d.xMax, LOG_MIN, LOG_MAX, toPxE, logErr), [d, coefs, n, ca])

  function pointerToA(e: React.PointerEvent) {
    const svg = svgRef.current
    if (!svg) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const inv = ctm.inverse()
    const pt = new DOMPointReadOnly(e.clientX, e.clientY).matrixTransform(inv)
    const x = d.xMin + ((pt.x - PAD) / (VBW - 2 * PAD)) * (d.xMax - d.xMin)
    setA(clamp(x, d.aMin, d.aMax))
  }

  function pick(f: FuncDef) {
    setKey(f.key)
    setA(f.a0)
    setProbe(f.probe0)
  }

  const trueV = d.f(cp)
  const approxV = tn(cp)
  const err = Math.abs(trueV - approxV)

  const [ax, ay] = toPx(ca, d.f(ca))
  const [ex] = toPxE(ca, 0)
  const [ptx, pty] = toPx(cp, clamp(trueV, d.yMin, d.yMax))
  const [pax, pay] = toPx(cp, clamp(approxV, d.yMin, d.yMax))
  const [epx, epy] = toPxE(cp, clamp(logErr(cp), LOG_MIN, LOG_MAX))
  const showZeroY = d.yMin <= 0 && d.yMax >= 0
  const [, zy] = toPx(0, 0)

  return (
    <AlgoShell
      slug="taylor"
      lede={
        <>
          泰勒展开把 f 在一点 a 附近换成多项式：<span className="k">Tₙ(x) = Σₖ f⁽ᵏ⁾(a)/k! · (x−a)ᵏ</span>。
          阶数滑到 0 是一条水平线，滑到 1 正好回到「局部线性化」那页的切线，滑到 2 是抛物线。
          拖动展开点，看多项式一层层裹住曲线，也看它在哪里裹不住。
        </>
      }
    >
      <div className="lab">
        <div className="controls" style={{ marginTop: 0, marginBottom: 18, borderTop: 'none', paddingTop: 0 }}>
          <div className="seg" role="tablist" aria-label="选择函数">
            {FUNCS.map((f) => (
              <button key={f.key} className={f.key === key ? 'on' : ''} onClick={() => pick(f)}>
                {f.name}
              </button>
            ))}
          </div>
        </div>

        <div className="lab-panels">
          <div className="lab-panel">
            <h4>f 和它的 {n} 阶泰勒多项式 · 拖动展开点</h4>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VBW} ${VBH}`}
              onPointerDown={(ev) => { (ev.target as Element).setPointerCapture?.(ev.pointerId); pointerToA(ev) }}
              onPointerMove={(ev) => { if (ev.buttons) pointerToA(ev) }}
              role="img"
              aria-label="函数曲线与它的泰勒多项式，可拖动展开点"
            >
              {showZeroY && <line x1={PAD} y1={zy} x2={VBW - PAD} y2={zy} stroke="#d9d2c4" strokeWidth={1} />}
              {ghostsD.map((g, i) => (
                <path key={i} d={g} fill="none" stroke="#d6452c" strokeWidth={1.2} opacity={0.18} />
              ))}
              <path d={curveD} fill="none" stroke="#8a8470" strokeWidth={1.8} />
              <path d={taylorD} fill="none" stroke="#d6452c" strokeWidth={2.2} />
              <line x1={ptx} y1={pty} x2={pax} y2={pay} stroke="#b5391f" strokeWidth={1.2} strokeDasharray="2 2" />
              <circle cx={ptx} cy={pty} r={4.5} fill="#4a6b52" stroke="#faf7f0" strokeWidth={1.8} />
              <circle cx={pax} cy={pay} r={4.5} fill="#d6452c" stroke="#faf7f0" strokeWidth={1.8} />
              <circle cx={ax} cy={ay} r={6} fill="#d6452c" stroke="#faf7f0" strokeWidth={2} />
            </svg>
          </div>

          <div className="lab-panel">
            <h4>误差 |f − T{SUB[n]}| · 纵轴取对数</h4>
            <svg viewBox={`0 0 ${VBW} ${VBH}`} role="img" aria-label="绝对误差随位置变化，纵轴为对数刻度">
              {GRID_EXP.map((e) => {
                const [, gy] = toPxE(d.xMin, e)
                return (
                  <g key={e}>
                    <line x1={PAD} y1={gy} x2={VBW - PAD} y2={gy} stroke="#d9d2c4" strokeWidth={1} />
                    <text x={PAD + 2} y={gy - 3} fontSize={8} fill="#9a968a">10{supNum(e)}</text>
                  </g>
                )
              })}
              <line x1={ex} y1={PAD} x2={ex} y2={VBH - PAD} stroke="#d6452c" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
              <path d={errD} fill="none" stroke="#8a8470" strokeWidth={1.8} />
              <line x1={epx} y1={PAD} x2={epx} y2={VBH - PAD} stroke="#4a6b52" strokeWidth={1} strokeDasharray="2 3" opacity={0.5} />
              <circle cx={epx} cy={epy} r={5} fill="#4a6b52" stroke="#faf7f0" strokeWidth={2} />
            </svg>
          </div>
        </div>

        <div className="controls">
          <div className="control">
            <label htmlFor="taylor-n">阶数 n <b>{n}</b></label>
            <input id="taylor-n" type="range" min={0} max={MAXN} step={1} value={n}
              onChange={(ev) => setN(+ev.target.value)} />
          </div>
          <div className="control">
            <label htmlFor="taylor-probe">探针 x <b>{cp.toFixed(2)}</b></label>
            <input id="taylor-probe" type="range" min={d.xMin} max={d.xMax} step={(d.xMax - d.xMin) / 200} value={cp}
              onChange={(ev) => setProbe(+ev.target.value)} />
          </div>
        </div>

        <div className="legend">
          <span><i style={{ background: '#8a8470' }} />真函数 f</span>
          <span><i style={{ background: '#d6452c' }} />n 阶多项式 Tₙ 与展开点 a</span>
          <span><i style={{ background: '#d6452c', opacity: 0.18 }} />低阶残影 T₀…Tₙ₋₁</span>
          <span><i style={{ background: '#4a6b52' }} />探针处的真值</span>
        </div>

        <div className="matrix-box" style={{ marginTop: 16 }}>{polyText(coefs, n, ca)}</div>

        <div className="readout">
          <div className="item">
            <span className="lbl">展开点 a</span>
            <span className="val">{ca.toFixed(3)}</span>
          </div>
          <div className="item">
            <span className="lbl">真值 f(x)</span>
            <span className="val">{fmt(trueV)}</span>
          </div>
          <div className="item">
            <span className="lbl">近似 T{SUB[n]}(x)</span>
            <span className="val">{fmt(approxV)}</span>
          </div>
          <div className="item">
            <span className="lbl">绝对误差</span>
            <span className="val">{fmt(err)}</span>
          </div>
        </div>
      </div>

      <p style={{ color: 'var(--ink-soft)', fontSize: 15 }}>{d.note}</p>

      <h2>多项式凭什么像 f</h2>
      <p>
        <span className="k">c_k = f⁽ᵏ⁾(a)/k!</span> 看着像个魔法配方，其实它是从一句要求里解出来的：
        <strong>在 a 这一点，让 Tₙ 的 0 阶到 n 阶导数和 f 一模一样</strong>，别的地方一概不管。
        把 <span className="k">(x−a)ᵏ</span> 求 k 次导，常数项会掉出一个 <span className="k">k!</span>，
        那个 <span className="k">1/k!</span> 就是专门用来抵消它的。所以泰勒多项式不是「整体最像 f 的多项式」，
        它是「在 a 这一点跟 f 贴得最紧的多项式」。
      </p>
      <p>
        n=1 时这句要求只管到一阶导，解出来是 <span className="k">f(a) + f′(a)(x−a)</span>，正是「局部线性化」那页的全部内容。
        泰勒做的事情只有一件：把同一句要求继续往上加阶。
      </p>

      <h2>余项：靠近 a 塌得飞快，离开 a 爆炸</h2>
      <p>
        丢掉的那部分（余项）大致长这样：<span className="k">f⁽ⁿ⁺¹⁾(ξ)/(n+1)! · (x−a)ⁿ⁺¹</span>，
        其中 ξ 落在 a 和 x 之间。两个因子各管一件事。<span className="k">(x−a)ⁿ⁺¹</span> 解释了右图那个尖底的谷：
        在 a 处误差直接掉到机器精度，稍微走远一点就按 n+1 次方往上冲。<span className="k">(n+1)!</span> 解释了为什么加阶通常有用：
        阶乘长得比什么都快，n 每加一，整条误差曲线就整体下沉一截。
      </p>
      <p>
        这也是「局部线性化」那页说的「误差是二阶小量」的推广：那里 n=1，余项里的 <span className="k">(x−a)²</span> 就是 δ²。
      </p>

      <h2>加阶不是万灵药：收敛半径</h2>
      <p>
        切到 <span className="k">1/(1−x)</span>，把展开点 a 拖到 0.85，再把探针拖到左边，然后把阶数拉满。
        曲线不但没贴上去，反而甩得更远。原因在于 x=1 是 f 的奇点，任何以 a 为中心的展开都只在
        <span className="k">|x−a| &lt; |1−a|</span> 内收敛。a 越靠近奇点，这个圈子越小：a=0.85 时半径只有 0.15，
        探针稍微往左走一点就出了射程。
      </p>
      <p>
        为什么多项式会被一个跟它无关的点卡死？因为多项式本身处处光滑，它没有任何手段「凭空知道」远处有个洞。
        它掌握的全部信息，就是 a 这一点上所有阶的导数。这些导数只描述了 f 在 a 附近的行为，
        而 f 在 a 附近的行为已经暗含了「最近的奇点有多远」，收敛半径正好等于这个距离。
        <span className="k">ln(1+x)</span> 是同一个故事，只是奇点搬到了 x=−1。
      </p>

      <Landing>
        你调用的 <span className="k">Math.sin</span> 底下往往就是「把角度折进一个小区间，再套几项低阶多项式」，
        真正跑的是泰勒或它的近亲切比雪夫逼近。物理里那个到处都在用的小角近似 sinθ≈θ，就是一阶泰勒截断。
        优化里的牛顿法更直接：在当前点做二阶泰勒展开，然后一步跳到那条抛物线的顶点，
        比只看一阶信息的梯度下降收敛快得多，代价是要算二阶导。
      </Landing>
    </AlgoShell>
  )
}

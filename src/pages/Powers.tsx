import { useRef, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'

/* ────────────────────────────────────────────────────────────
   次方一家人 · 底数/指数/幂
   核心直觉：xⁿ（幂函数，底数变）每次只是「乘固定次数」，n 一定
   增长的层数就封顶了；bˣ（指数函数，指数变）是指数本身在长，
   x 每挪一步整体都要再乘一遍 b——前期看着慢，早晚会把任何
   固定次数的 xⁿ 甩在后面。这条「乘法复利迟早赢」就是这页要建的直觉。
   ──────────────────────────────────────────────────────────── */

type Vec = [number, number]
type BaseDef = { key: string; b: number; nMax: number; name: string }

const BASES: BaseDef[] = [
  { key: 'b15', b: 1.5, nMax: 12, name: '底数 1.5' },
  { key: 'b2', b: 2, nMax: 10, name: '底数 2' },
  { key: 'b3', b: 3, nMax: 7, name: '底数 3' },
]

const VBW = 360
const VBH = 230
const PAD = 24

function makeToPx(xMin: number, xMax: number, yMin: number, yMax: number) {
  return (x: number, y: number): Vec => {
    const px = PAD + ((x - xMin) / (xMax - xMin)) * (VBW - 2 * PAD)
    const py = VBH - PAD - ((y - yMin) / (yMax - yMin)) * (VBH - 2 * PAD)
    return [px, py]
  }
}

function curvePath(xMin: number, xMax: number, toPx: (x: number, y: number) => Vec, fn: (x: number) => number, n = 140) {
  let path = ''
  for (let i = 0; i <= n; i++) {
    const x = xMin + ((xMax - xMin) * i) / n
    const [px, py] = toPx(x, fn(x))
    path += (i === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1)
  }
  return path
}

// 在 [xMin,xMax] 里粗扫 f-g 的变号点，找交叉——谁涨得快不用查表，跑一遍就知道。
function findCrossings(f: (x: number) => number, g: (x: number) => number, xMin: number, xMax: number, steps = 400) {
  const xs: number[] = []
  let prevSign = Math.sign(f(xMin) - g(xMin))
  for (let i = 1; i <= steps; i++) {
    const x = xMin + ((xMax - xMin) * i) / steps
    const s = Math.sign(f(x) - g(x))
    if (s !== 0 && prevSign !== 0 && s !== prevSign) xs.push(x)
    if (s !== 0) prevSign = s
  }
  return xs
}

// 右侧「谁涨得快」赛道与 baseKey / n 无关，一次算好即可，别在每次拖动时重算。
const raceXMax = 5
const raceYMax = Math.exp(raceXMax) * 1.08
const toPxR = makeToPx(0, raceXMax, 0, raceYMax)
const sqPath = curvePath(0, raceXMax, toPxR, (x) => x * x)
const cubePath = curvePath(0, raceXMax, toPxR, (x) => x * x * x)
const expPath = curvePath(0, raceXMax, toPxR, (x) => Math.exp(x))
const sqCross = findCrossings((x) => x * x, (x) => Math.exp(x), 0, raceXMax)
const cubeCross = findCrossings((x) => x * x * x, (x) => Math.exp(x), 0, raceXMax)

export function Powers() {
  const [baseKey, setBaseKey] = useState('b2')
  const base = BASES.find((b) => b.key === baseKey)!
  const [n, setN] = useState(() => base.nMax * 0.55)
  const svgRef = useRef<SVGSVGElement>(null)

  const cn = Math.max(0, Math.min(base.nMax, n))
  const yMax = Math.pow(base.b, base.nMax) * 1.08
  const toPx = makeToPx(0, base.nMax, 0, yMax)
  const val = Math.pow(base.b, cn)
  const curveD = curvePath(0, base.nMax, toPx, (x) => Math.pow(base.b, x))
  const [px, py] = toPx(cn, val)

  function pointerToN(e: React.PointerEvent) {
    const svg = svgRef.current
    if (!svg) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const inv = ctm.inverse()
    const pt = new DOMPointReadOnly(e.clientX, e.clientY).matrixTransform(inv)
    const x = ((pt.x - PAD) / (VBW - 2 * PAD)) * base.nMax
    setN(Math.max(0, Math.min(base.nMax, x)))
  }

  const marks = [2, 3].filter((m) => m <= base.nMax)
  const markLabel = (m: number) => (m === 2 ? '平方' : '立方')

  const fmt = (v: number) => (v >= 1000 ? Math.round(v).toLocaleString() : Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2))

  return (
    <AlgoShell
      slug="powers"
      lede={
        <>
          <span className="k">底数</span>是被反复相乘的那个数，<span className="k">指数</span>是乘几次：
          <span className="k">2²</span>是平方，<span className="k">2³</span>是立方，往后就没专名了，通通叫「n 次方」。
          拖动指数 n，看 bⁿ 怎么从「几乎不动」猛地拐上去——这就是「指数爆炸」。
        </>
      }
    >
      <div className="lab">
        <div className="controls" style={{ marginTop: 0, marginBottom: 18, borderTop: 'none', paddingTop: 0 }}>
          <div className="seg" role="tablist" aria-label="选择底数">
            {BASES.map((b) => (
              <button
                key={b.key}
                className={b.key === baseKey ? 'on' : ''}
                onClick={() => { setBaseKey(b.key); setN(b.nMax * 0.55) }}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>

        <div className="lab-panels">
          <div className="lab-panel">
            <h4>bⁿ · 拖动看指数怎么炸</h4>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VBW} ${VBH}`}
              onPointerDown={(ev) => { (ev.target as Element).setPointerCapture?.(ev.pointerId); pointerToN(ev) }}
              onPointerMove={(ev) => { if (ev.buttons) pointerToN(ev) }}
              role="img"
              aria-label="指数曲线，可拖动红点"
            >
              {marks.map((m) => {
                const [mx] = toPx(m, 0)
                return (
                  <g key={m}>
                    <line x1={mx} y1={PAD} x2={mx} y2={VBH - PAD} stroke="#d9d2c4" strokeWidth={1} strokeDasharray="3 3" />
                    <text x={mx} y={VBH - 6} fontSize={10} textAnchor="middle" fill="#9a968a" fontFamily="var(--font-mono)">
                      {markLabel(m)}
                    </text>
                  </g>
                )
              })}
              <path d={curveD} fill="none" stroke="#8a8470" strokeWidth={1.8} />
              <circle cx={px} cy={py} r={6} fill="#d6452c" stroke="#faf7f0" strokeWidth={2} />
            </svg>
          </div>

          <div className="lab-panel">
            <h4>谁涨得快：x² / x³ / eˣ</h4>
            <svg viewBox={`0 0 ${VBW} ${VBH}`} role="img" aria-label="幂函数和指数函数增长比较">
              <path d={sqPath} fill="none" stroke="#9a968a" strokeWidth={1.6} />
              <path d={cubePath} fill="none" stroke="#4a6b52" strokeWidth={1.6} strokeDasharray="5 3" />
              <path d={expPath} fill="none" stroke="#d6452c" strokeWidth={1.8} />
              {cubeCross.map((x) => {
                const [cx, cy] = toPxR(x, Math.exp(x))
                return <circle key={`c${x}`} cx={cx} cy={cy} r={4} fill="#d6452c" stroke="#faf7f0" strokeWidth={1.5} />
              })}
              {sqCross.map((x) => {
                const [cx, cy] = toPxR(x, Math.exp(x))
                return <circle key={`s${x}`} cx={cx} cy={cy} r={4} fill="#d6452c" stroke="#faf7f0" strokeWidth={1.5} />
              })}
            </svg>
          </div>
        </div>

        <div className="readout">
          <div className="item">
            <span className="lbl">指数 n</span>
            <span className="val">{cn.toFixed(1)}</span>
          </div>
          <div className="item">
            <span className="lbl">{base.b}ⁿ</span>
            <span className="val">{fmt(val)}</span>
          </div>
        </div>
      </div>

      <p style={{ color: 'var(--ink-soft)', fontSize: 15 }}>
        <span style={{ color: '#8a8470', fontWeight: 600 }}>灰</span>=x² ·{' '}
        <span style={{ color: '#4a6b52', fontWeight: 600 }}>绿虚线</span>=x³ ·{' '}
        <span style={{ color: '#b5391f', fontWeight: 600 }}>红</span>=eˣ。x∈[0,5] 这一小段里，
        x³ 一度反超过 eˣ{cubeCross.length ? `（约 x≈${cubeCross[0].toFixed(2)}）` : ''}，
        但到 x≈{cubeCross.length ? cubeCross[cubeCross.length - 1].toFixed(2) : '?'} 附近 eˣ 又追了回来，从此再没被超过；
        x² 则从头到尾都没追上过。
      </p>

      <h2>为什么指数迟早赢</h2>
      <p>
        <span className="k">xⁿ</span> 每次只是「乘一个固定次数」，n 定了增长的「层数」就封顶了；
        <span className="k">bˣ</span>（这里是 <span className="k">eˣ</span>）是「指数本身在长」——x 每往前挪一步，
        整个值都要再乘一遍 <span className="k">b</span>。前期 xⁿ 可能看着更猛，但只要给够 x，
        乘法的复利效应总会把加法式的增长甩在后面。这也是为什么「指数级」在算法复杂度里是最坏的那种消息。
      </p>

      <Landing>
        神经网络参数量按层数是「指数」还是「多项式」增长，直接决定训练要烧多少算力；
        复利、传染病早期扩散、暴力搜索的分支数爆炸，全是同一条 bˣ 曲线套的壳。
      </Landing>
    </AlgoShell>
  )
}

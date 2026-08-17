import { useMemo, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'

/* ────────────────────────────────────────────────────────────
   黄金角与向日葵 · 一条局部规则，不是一个被存起来的常数

   全页要说清的一件事：向日葵里没有 φ。有的只是一条局部规则
   「新种子挤进当前最大的空隙」，137.5° 是这条规则的不动点，
   不是它的目标。区别在于：目标会被噪声带偏，不动点会把噪声纠回来。

   顺带纠三个流传很广的说法：
   · 鹦鹉螺不是黄金螺线（实测每圈放大约 1.33，不是 1.618）；
   · 蜻蜓翅膀跟黄金分割无关（那是 Voronoi 剖分）；
   · 向日葵也不是每一株都数得出斐波那契（约四分之一不是）。

   页面里的数字全部当场算，没有抄来的常数：
   · 螺线条数 = 从真实点集里数「距离新低」数出来的（parastichy）；
   · 密排质量曲线 = 每个角度实算最小邻距；
   · 连分数 = 对 θ/360 现场展开；
   · 两条对数螺线按同一外径归一后再画，偏差是看出来的不是标出来的。
   ──────────────────────────────────────────────────────────── */

const PHI = (1 + Math.sqrt(5)) / 2
const GOLDEN = 360 / (PHI * PHI)        // 137.50776…°
const LUCAS = 360 / (PHI * PHI + 1)     // 99.50188…°，第二个「贵金属角」

const RAD = Math.PI / 180
const fmt = (v: number, d = 3) => v.toFixed(d)

const FIB = (() => {
  const s: number[] = []
  let a = 1
  let b = 2
  while (a < 5000) {
    s.push(a)
    ;[a, b] = [b, a + b]
  }
  return s
})()

/** 两族螺线的条数是不是**相邻**的两个斐波那契数。
 *  只查「是不是斐波那契数」不够：8 和 21 都是，中间却漏了 13。 */
function adjacentFib(pair: number[]): boolean {
  if (pair.length !== 2) return false
  const i = FIB.indexOf(pair[0])
  return i >= 0 && FIB[i + 1] === pair[1]
}

/** 第 i 颗种子的位置（单位尺度：r = √i，此时每颗种子恰好摊到面积 π）。 */
function seed(i: number, angleDeg: number): [number, number] {
  const t = i * angleDeg * RAD
  const r = Math.sqrt(i)
  return [r * Math.cos(t), r * Math.sin(t)]
}

/**
 * 数螺线条数（parastichy numbers）。
 *
 * 站在最外圈那颗种子上，往回看「隔 k 号」的那颗离自己多远。
 * 距离每创一次新低，就说明多出一族肉眼能连起来的螺线。
 * k 再大时点已经掉到内圈去了，径向距离本身就压不下来，新低自然停止。
 * 最后两次新低 = 顺逆两族螺线的条数，也就是人肉去数会数出来的那两个。
 */
function parastichy(angleDeg: number, N: number): number[] {
  const n0 = N - 1
  const [x0, y0] = seed(n0, angleDeg)
  let best = Infinity
  const records: number[] = []
  for (let k = 1; k <= n0; k++) {
    const [x, y] = seed(n0 - k, angleDeg)
    const d = Math.hypot(x - x0, y - y0)
    if (d < best - 1e-9) {
      best = d
      records.push(k)
    }
  }
  return records
}

/**
 * 密排质量 = 整盘里最挤的那一对种子隔多远。
 * 这个值越大，说明没有任何两颗种子挤到一起，盘面铺得越匀。
 * 黄金角让它取到最大：这就是「为什么偏偏是 137.5°」的全部内容。
 */
function packing(angleDeg: number, N = 120, KMAX = 34, i0 = 8): number {
  let m = Infinity
  for (let i = i0; i < N; i++) {
    const [x, y] = seed(i, angleDeg)
    for (let k = 1; k <= KMAX && k <= i; k++) {
      const [u, v] = seed(i - k, angleDeg)
      const d = Math.hypot(x - u, y - v)
      if (d < m) m = d
    }
  }
  return m
}

/** θ/360 的连分数展开。全是 1 = 最难被有理数逼近 = 最不容易排成直臂。 */
function contFrac(x: number, n = 8): number[] {
  const out: number[] = []
  let v = x
  for (let i = 0; i < n; i++) {
    const a = Math.floor(v)
    out.push(a)
    const f = v - a
    if (f < 1e-7) break
    v = 1 / f
    if (!isFinite(v) || v > 1e7) break
  }
  return out
}

/* ═══════════ 面板一 · 比值爬向 φ ═══════════ */

function RatioPanel() {
  const rows = useMemo(() => {
    const out: { n: number; f: number; prev: number; ratio: number }[] = []
    let a = 1
    let b = 1
    for (let n = 2; n <= 14; n++) {
      const next = a + b
      out.push({ n, f: next, prev: b, ratio: next / b })
      a = b
      b = next
    }
    return out
  }, [])

  const W = 620
  const H = 210
  const padL = 46
  const padB = 34
  const lo = 1.4
  const hi = 2.1
  const xAt = (i: number) => padL + (i / (rows.length - 1)) * (W - padL - 88)
  const yAt = (v: number) => H - padB - ((v - lo) / (hi - lo)) * (H - padB - 22)

  const path = rows.map((r, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)} ${yAt(r.ratio).toFixed(1)}`).join('')

  return (
    <div className="lab">
      <div className="lab-panel" style={{ flex: '1 1 100%' }}>
        <h4>相邻两项一除，来回蹦着收敛到 φ</h4>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="斐波那契相邻项比值收敛到黄金比的折线图">
          <line x1={padL} y1={yAt(PHI)} x2={W - 88} y2={yAt(PHI)} stroke="#4a6b52" strokeWidth={1.2} strokeDasharray="5 4" />
          <text x={W - 82} y={yAt(PHI) + 4} fontSize={11.5} fill="#4a6b52" fontFamily="var(--font-mono)">
            φ = {fmt(PHI, 3)}
          </text>
          {[1.5, 1.618, 1.8, 2.0].map((v) => (
            <text key={v} x={padL - 8} y={yAt(v) + 4} fontSize={10.5} fill="#9a968a" textAnchor="end" fontFamily="var(--font-mono)">
              {v.toFixed(2)}
            </text>
          ))}
          <path d={path} fill="none" stroke="#d6452c" strokeWidth={1.8} strokeLinejoin="round" />
          {rows.map((r, i) => (
            <g key={r.n}>
              <circle cx={xAt(i)} cy={yAt(r.ratio)} r={3.2} fill="#d6452c" />
              {i % 2 === 0 && (
                <text x={xAt(i)} y={H - padB + 15} fontSize={10} fill="#9a968a" textAnchor="middle" fontFamily="var(--font-mono)">
                  {r.f}/{r.prev}
                </text>
              )}
            </g>
          ))}
          <text x={padL} y={H - 6} fontSize={10.5} fill="#9a968a">
            越往后越贴着虚线：比值本身没有终点，只有极限
          </text>
        </svg>
      </div>
      <div className="readout">
        <div className="item">
          <span className="lbl">第 14 项比值</span>
          <span className="val">{fmt(rows[rows.length - 1].ratio, 6)}</span>
        </div>
        <div className="item">
          <span className="lbl">φ</span>
          <span className="val">{fmt(PHI, 6)}</span>
        </div>
        <div className="item">
          <span className="lbl">还差</span>
          <span className="val">{(rows[rows.length - 1].ratio - PHI).toExponential(1)}</span>
        </div>
      </div>
    </div>
  )
}

/* ═══════════ 花盘：可复用的小圆盘 ═══════════ */

function SeedDisc({
  angle, n, size, showSpirals, label,
}: {
  angle: number
  n: number
  size: number
  showSpirals: boolean
  label?: string
}) {
  const C = size / 2
  const R = size / 2 - 8

  const pts = useMemo(() => {
    const out: [number, number][] = []
    const k = R / Math.sqrt(n)
    for (let i = 0; i < n; i++) {
      const t = i * angle * RAD
      const r = k * Math.sqrt(i + 0.5)
      out.push([C + r * Math.cos(t), C - r * Math.sin(t)])
    }
    return out
  }, [angle, n, C, R])

  const dot = Math.max(1.1, (R / Math.sqrt(n)) * 0.72)
  const fam = useMemo(() => parastichy(angle, n).slice(-2), [angle, n])

  // 一族螺线 = 从 0..k-1 各起一条链，每次跳 k 号。k 有多大就有多少条臂。
  // 最里面几颗种子挤在原点附近，「隔 k 号」的邻居关系在那里还没成形，
  // 硬连会横穿中心。所以一旦某段明显长过正常间距就断开，让链自然从中心之外起笔。
  const spacing = (Math.sqrt(Math.PI) * R) / Math.sqrt(n)
  const chains = (k: number) => {
    const out: string[] = []
    for (let s = 0; s < k; s++) {
      let d = ''
      let prev: [number, number] | null = null
      for (let i = s; i < n; i += k) {
        const p = pts[i]
        const jump = prev ? Math.hypot(p[0] - prev[0], p[1] - prev[1]) > spacing * 2 : true
        d += (jump ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)
        prev = p
      }
      if (d) out.push(d)
    }
    return out
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`发散角 ${angle.toFixed(2)} 度、${n} 颗种子的排布`}>
      <circle cx={C} cy={C} r={R + 5} fill="#f3efe4" stroke="#e4ded1" strokeWidth={1} />
      {/* 种子在下、螺线在上：连线穿过种子中心，压在上面才看得见 */}
      <g fill="#4a4740">
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={showSpirals ? dot * 0.62 : dot} opacity={showSpirals ? 0.5 : 0.86} />
        ))}
      </g>
      {showSpirals && fam.length === 2 && (
        <>
          <g stroke="#4a6b52" strokeWidth={1.5} fill="none" opacity={0.9} strokeLinecap="round">
            {chains(fam[0]).map((d, i) => <path key={i} d={d} />)}
          </g>
          <g stroke="#d6452c" strokeWidth={1.5} fill="none" opacity={0.85} strokeLinecap="round">
            {chains(fam[1]).map((d, i) => <path key={i} d={d} />)}
          </g>
        </>
      )}
      {label && (
        <text x={8} y={size - 8} fontSize={11} fill="#9a968a" fontFamily="var(--font-mono)">
          {label}
        </text>
      )}
    </svg>
  )
}

/* ═══════════ 面板二 · 向日葵盘（主面板） ═══════════ */

const PRESETS = [
  { name: '黄金角', deg: GOLDEN },
  { name: '差 0.2°', deg: 137.3 },
  { name: '差 0.5°', deg: 137.0 },
  { name: '360×3/8', deg: 135 },
  { name: '360×2/5', deg: 144 },
]

function SunflowerPanel() {
  const [angle, setAngle] = useState(GOLDEN)
  const [n, setN] = useState(420)
  const [spirals, setSpirals] = useState(true)

  const fam = useMemo(() => parastichy(angle, n).slice(-2), [angle, n])
  const quality = useMemo(() => packing(angle), [angle])
  const cf = useMemo(() => contFrac(angle / 360), [angle])
  const adjFib = adjacentFib(fam)
  const someFib = fam.length === 2 && fam.every((k) => FIB.includes(k))

  // 密排质量随角度的扫描曲线。只跟角度有关，挂载时算一次。
  const curve = useMemo(() => {
    const out: [number, number][] = []
    for (let a = 130; a <= 145.0001; a += 0.05) out.push([a, packing(a)])
    return out
  }, [])

  const CW = 330
  const CH = 300
  const cPadL = 34
  const cPadB = 30
  const qMax = 1.75
  const cx = (a: number) => cPadL + ((a - 130) / 15) * (CW - cPadL - 12)
  const cy = (q: number) => CH - cPadB - (q / qMax) * (CH - cPadB - 26)
  const curvePath = curve.map(([a, q], i) => `${i ? 'L' : 'M'}${cx(a).toFixed(1)} ${cy(q).toFixed(1)}`).join('')

  return (
    <div className="lab">
      <div className="controls" style={{ marginTop: 0, marginBottom: 16, borderTop: 'none', paddingTop: 0 }}>
        <div className="seg" role="group" aria-label="常用角度">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              className={Math.abs(p.deg - angle) < 0.004 ? 'on' : ''}
              onClick={() => setAngle(p.deg)}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="是否画出螺线">
          <button className={spirals ? '' : 'on'} onClick={() => setSpirals(false)}>只看种子</button>
          <button className={spirals ? 'on' : ''} onClick={() => setSpirals(true)}>画出螺线</button>
        </div>
      </div>

      <div className="lab-panels">
        <div className="lab-panel" style={{ flex: '1 1 320px' }}>
          <h4>{n} 颗种子，发散角 {angle.toFixed(3)}°</h4>
          <SeedDisc angle={angle} n={n} size={330} showSpirals={spirals} />
        </div>

        <div className="lab-panel" style={{ flex: '1 1 300px' }}>
          <h4>整盘最挤的一对种子隔多远</h4>
          <svg viewBox={`0 0 ${CW} ${CH}`} role="img" aria-label="密排质量随发散角变化的曲线，峰值在黄金角">
            <line x1={cPadL} y1={CH - cPadB} x2={CW - 12} y2={CH - cPadB} stroke="#ddd5c6" />
            {[130, 134, 138, 142, 145].map((a) => (
              <text key={a} x={cx(a)} y={CH - cPadB + 15} fontSize={10} fill="#9a968a" textAnchor="middle" fontFamily="var(--font-mono)">
                {a}°
              </text>
            ))}
            {[0.5, 1.0, 1.5].map((q) => (
              <g key={q}>
                <line x1={cPadL} y1={cy(q)} x2={CW - 12} y2={cy(q)} stroke="#ece6d9" />
                <text x={cPadL - 6} y={cy(q) + 4} fontSize={10} fill="#9a968a" textAnchor="end" fontFamily="var(--font-mono)">
                  {q.toFixed(1)}
                </text>
              </g>
            ))}
            <path d={curvePath} fill="none" stroke="#4a6b52" strokeWidth={1.6} />
            <line x1={cx(GOLDEN)} y1={18} x2={cx(GOLDEN)} y2={CH - cPadB} stroke="#4a6b52" strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
            <g>
              <line x1={cx(angle)} y1={18} x2={cx(angle)} y2={CH - cPadB} stroke="#d6452c" strokeWidth={1.4} />
              <circle cx={cx(angle)} cy={cy(quality)} r={4.2} fill="#d6452c" />
            </g>
            <text x={cPadL} y={14} fontSize={10.5} fill="#9a968a">
              越高铺得越匀 · 虚线 = 137.508°
            </text>
          </svg>
        </div>
      </div>

      <div className="controls">
        <div className="control" style={{ flex: '1 1 260px' }}>
          <label htmlFor="ga-angle">
            发散角 θ <b>{angle.toFixed(3)}°</b>
          </label>
          <input
            id="ga-angle" type="range" min={130} max={145} step={0.002}
            value={angle} onChange={(e) => setAngle(+e.target.value)}
          />
        </div>
        <div className="control" style={{ flex: '1 1 200px' }}>
          <label htmlFor="ga-n">
            种子数 <b>{n}</b>
          </label>
          <input
            id="ga-n" type="range" min={60} max={800} step={10}
            value={n} onChange={(e) => setN(+e.target.value)}
          />
        </div>
      </div>

      <div className="readout">
        <div className="item">
          <span className="lbl">顺 / 逆两族螺线</span>
          <span className="val">{fam.length === 2 ? `${fam[0]} / ${fam[1]}` : '数不出'}</span>
        </div>
        <div className="item">
          <span className="lbl">相邻斐波那契？</span>
          <span className="val" style={{ color: adjFib ? '#4a6b52' : '#9a968a' }}>
            {adjFib ? '是' : someFib ? '是斐波那契，但不相邻' : '否'}
          </span>
        </div>
        <div className="item">
          <span className="lbl">密排质量</span>
          <span className="val">{fmt(quality, 3)}</span>
        </div>
        <div className="item">
          <span className="lbl">θ/360 的连分数</span>
          <span className="val" style={{ fontSize: 14 }}>
            [{cf[0]}; {cf.slice(1).join(',')}…]
          </span>
        </div>
      </div>

      <div className="step-note">
        {adjFib ? (
          <>
            这一档下螺线条数是 <em>{fam[0]}</em> 和 <em>{fam[1]}</em>，相邻的两个斐波那契数，
            相加正好是下一个：{fam[0]} + {fam[1]} = {fam[0] + fam[1]}。
          </>
        ) : someFib ? (
          <>
            条数 <em>{fam[0]}</em> 和 <em>{fam[1]}</em> 还都是斐波那契数，但中间<em>跳了号</em>
            （{FIB.slice(FIB.indexOf(fam[0]) + 1, FIB.indexOf(fam[1])).join('、')} 被跳过了）。
            密排质量掉到 {fmt(quality, 2)}：有一族螺线已经被挤没，盘面开始出现肉眼可见的空隙。
          </>
        ) : (
          <>
            螺线条数是 {fam.join(' 和 ')}，跟斐波那契没关系了。
            密排质量掉到 {fmt(quality, 2)}，种子明显地扎堆、留白。
          </>
        )}
      </div>
    </div>
  )
}

/* ═══════════ 面板三 · 鹦鹉螺不是黄金螺线 ═══════════ */

function NautilusPanel() {
  const [k, setK] = useState(1.33)
  const TURNS = 3.25
  const size = 340
  const C = size / 2
  const R = size / 2 - 14

  /** 对数螺线 r = R·k^((θ-θmax)/2π)：每转一圈半径乘 k。按外径归一，两条从同一点收尾。 */
  const spiral = (ratio: number) => {
    let d = ''
    const steps = 420
    for (let s = 0; s <= steps; s++) {
      const turn = TURNS * (s / steps - 1) // -TURNS … 0
      const r = R * Math.pow(ratio, turn)
      const t = turn * 2 * Math.PI
      const x = C + r * Math.cos(t)
      const y = C - r * Math.sin(t)
      d += (s ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)
    }
    return d
  }

  // 隔板：每 1/4 圈画一条从中心出发的射线段，越靠外越疏，这是等角生长的直接后果。
  const septa = (ratio: number) => {
    const out: [number, number, number, number][] = []
    for (let s = 0; s <= TURNS * 4; s++) {
      const turn = -s / 4
      const r = R * Math.pow(ratio, turn)
      const t = turn * 2 * Math.PI
      out.push([C + r * 0.13 * Math.cos(t), C - r * 0.13 * Math.sin(t), C + r * Math.cos(t), C - r * Math.sin(t)])
    }
    return out
  }

  const gap = Math.abs(k - PHI)

  return (
    <div className="lab">
      <div className="controls" style={{ marginTop: 0, marginBottom: 16, borderTop: 'none', paddingTop: 0 }}>
        <div className="seg" role="group" aria-label="常见增长率">
          <button className={Math.abs(k - 1.33) < 0.005 ? 'on' : ''} onClick={() => setK(1.33)}>鹦鹉螺实测 1.33</button>
          <button className={Math.abs(k - PHI) < 0.005 ? 'on' : ''} onClick={() => setK(PHI)}>黄金螺线 1.618</button>
        </div>
      </div>

      <div className="lab-panels">
        <div className="lab-panel" style={{ flex: '1 1 330px' }}>
          <h4>同一个外径，两条螺线叠在一起</h4>
          <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="鹦鹉螺增长率与黄金螺线的对数螺线对比">
            <path d={spiral(PHI)} fill="none" stroke="#4a6b52" strokeWidth={1.5} strokeDasharray="5 4" />
            <g stroke="#d6452c" strokeWidth={0.7} opacity={0.3}>
              {septa(k).map(([x1, y1, x2, y2], i) => (
                <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
              ))}
            </g>
            <path d={spiral(k)} fill="none" stroke="#d6452c" strokeWidth={2.2} />
            <circle cx={C} cy={C} r={2.6} fill="#9a968a" />
            <text x={10} y={size - 24} fontSize={11} fill="#b5391f" fontFamily="var(--font-mono)">
              ─── 每圈 ×{k.toFixed(3)}
            </text>
            <text x={10} y={size - 9} fontSize={11} fill="#4a6b52" fontFamily="var(--font-mono)">
              ‑ ‑ ‑ 黄金螺线 ×{fmt(PHI, 3)}
            </text>
          </svg>
        </div>

        <div className="lab-panel" style={{ flex: '1 1 240px' }}>
          <h4>转三圈之后，内径差多少</h4>
          <svg viewBox="0 0 300 300" role="img" aria-label="不同增长率下内圈半径的衰减对比">
            {[0, 1, 2, 3].map((t) => (
              <g key={t}>
                <text x={8} y={40 + t * 66} fontSize={11} fill="#9a968a" fontFamily="var(--font-mono)">
                  往回第 {t} 圈
                </text>
                <rect x={8} y={48 + t * 66} width={Math.pow(k, -t) * 250} height={13} rx={2} fill="#d6452c" opacity={0.85} />
                <rect x={8} y={63 + t * 66} width={Math.pow(PHI, -t) * 250} height={13} rx={2} fill="#4a6b52" opacity={0.55} />
                <text x={264} y={59 + t * 66} fontSize={10.5} fill="#b5391f" fontFamily="var(--font-mono)">
                  {fmt(Math.pow(k, -t), 2)}
                </text>
                <text x={264} y={74 + t * 66} fontSize={10.5} fill="#4a6b52" fontFamily="var(--font-mono)">
                  {fmt(Math.pow(PHI, -t), 2)}
                </text>
              </g>
            ))}
            <text x={8} y={20} fontSize={10.5} fill="#9a968a">半径按外圈归一为 1</text>
          </svg>
        </div>
      </div>

      <div className="controls">
        <div className="control" style={{ flex: '1 1 260px' }}>
          <label htmlFor="na-k">
            每转一圈半径放大 <b>×{k.toFixed(3)}</b>
          </label>
          <input id="na-k" type="range" min={1.08} max={2.2} step={0.005} value={k} onChange={(e) => setK(+e.target.value)} />
        </div>
        <div className="readout" style={{ marginTop: 0 }}>
          <div className="item">
            <span className="lbl">与 φ 的差</span>
            <span className="val">{gap < 0.005 ? '0' : fmt(gap, 3)}</span>
          </div>
          <div className="item">
            <span className="lbl">三圈后内径比</span>
            <span className="val">{fmt(Math.pow(k / PHI, -3), 2)}×</span>
          </div>
        </div>
      </div>

      <div className="step-note">
        {gap < 0.02 ? (
          <>两条线现在完全重合。<em>任何</em>增长率都给出对数螺线，φ 只是其中一个，没有特殊地位。</>
        ) : (
          <>
            拖到 <em>1.33</em> 就是鹦鹉螺的实测值：两条线只在最外圈重合，往里转一圈就分开，
            转三圈后内径差了 <em>{fmt(Math.pow(k / PHI, -3), 1)}</em> 倍。肉眼可辨，不是测量误差。
          </>
        )}
      </div>
    </div>
  )
}

/* ═══════════ 面板四 · 两个吸引盆 ═══════════ */

function BasinPanel() {
  const golden = useMemo(() => parastichy(GOLDEN, 400).slice(-2), [])
  const lucas = useMemo(() => parastichy(LUCAS, 400).slice(-2), [])
  const qG = useMemo(() => packing(GOLDEN), [])
  const qL = useMemo(() => packing(LUCAS), [])

  // 拉远看：同一条密排质量曲线，扫过 90–150°，峰不止一个。
  const wide = useMemo(() => {
    const out: [number, number][] = []
    for (let a = 90; a <= 150.0001; a += 0.05) out.push([a, packing(a)])
    return out
  }, [])

  const W = 620
  const H = 176
  const padL = 34
  const padB = 26
  const qMax = 1.8
  const x = (a: number) => padL + ((a - 90) / 60) * (W - padL - 14)
  const y = (q: number) => H - padB - (q / qMax) * (H - padB - 24)
  const path = wide.map(([a, q], i) => `${i ? 'L' : 'M'}${x(a).toFixed(1)} ${y(q).toFixed(1)}`).join('')

  return (
    <div className="lab">
      <div className="lab-panels">
        <div className="lab-panel" style={{ flex: '1 1 250px' }}>
          <h4>137.508° · 斐波那契盆</h4>
          <SeedDisc angle={GOLDEN} n={400} size={280} showSpirals label={`${golden.join(' / ')} 条`} />
        </div>
        <div className="lab-panel" style={{ flex: '1 1 250px' }}>
          <h4>99.502° · 卢卡斯盆</h4>
          <SeedDisc angle={LUCAS} n={400} size={280} showSpirals label={`${lucas.join(' / ')} 条`} />
        </div>
      </div>

      <div className="lab-panel" style={{ flex: '1 1 100%', marginTop: 18 }}>
        <h4>把密排质量曲线拉远看：峰不止一个</h4>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="90 到 150 度范围内密排质量曲线，多个峰对应不同的贵金属角">
          <line x1={padL} y1={H - padB} x2={W - 14} y2={H - padB} stroke="#ddd5c6" />
          {[90, 100, 110, 120, 130, 140, 150].map((a) => (
            <text key={a} x={x(a)} y={H - padB + 14} fontSize={10} fill="#9a968a" textAnchor="middle" fontFamily="var(--font-mono)">
              {a}°
            </text>
          ))}
          <path d={path} fill="none" stroke="#4a6b52" strokeWidth={1.3} />
          {[
            { a: LUCAS, q: qL, name: '99.5° 卢卡斯', col: '#4a6b52' },
            { a: GOLDEN, q: qG, name: '137.5° 黄金', col: '#d6452c' },
          ].map((m) => (
            <g key={m.name}>
              <circle cx={x(m.a)} cy={y(m.q)} r={4} fill={m.col} />
              <text x={x(m.a)} y={y(m.q) - 9} fontSize={10.5} fill={m.col} textAnchor="middle" fontFamily="var(--font-mono)">
                {m.name} · {fmt(m.q, 3)}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="step-note">
        右边这盘铺得一样匀，密排质量 <em>{fmt(qL, 3)}</em>，甚至比黄金角的 {fmt(qG, 3)} 还高出一丝。
        但数出来的是 <em>{lucas.join(' 和 ')}</em>，卢卡斯数列（1, 3, 4, 7, 11, 18, 29, 47…），不是斐波那契。
        它不是「误差更大的向日葵」，是落进了另一个盆。
      </div>
    </div>
  )
}

/* ═══════════ 页面 ═══════════ */

export function GoldenAngle() {
  return (
    <AlgoShell
      slug="golden-angle"
      lede={
        <>
          先说结论：向日葵里没有存着 φ。它只执行一条局部规则，
          「新种子挤进当前最大的空隙」，137.5° 是这条规则自己滚出来的不动点。
          这个区别很要紧：<strong>目标会被噪声带偏，不动点会把噪声纠回来</strong>。
        </>
      }
    >
      <p>
        很多人对这件事的第一印象来自 Cristóbal Vila 2010 年那支三分半的短片《Nature by Numbers》。
        片子拍得极好，但三个镜头的成色其实不一样：<strong>向日葵是真的，鹦鹉螺是错的，蜻蜓翅膀跟黄金分割没关系</strong>。
        这一页把三样都过一遍，顺序就按可信度从高到低排。
      </p>

      <h2>第一幕 · 一个不是常数的常数</h2>
      <p>
        斐波那契数列的规则简单到不需要解释：前两项相加得下一项。
        <span className="k">Fₙ = Fₙ₋₁ + Fₙ₋₂</span>，1, 1, 2, 3, 5, 8, 13…
        真正有意思的是相邻两项一除会发生什么。
      </p>

      <RatioPanel />

      <p>
        比值在 φ 上下来回蹦，蹦一次幅度小一半，永远够不着但一直在靠近。
        极限是 <span className="k">φ = (1+√5)/2</span>。
        更漂亮的是它有闭式解，一串整数居然可以由无理数写出来：
      </p>
      <p style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 15 }}>
        Fₙ = ( φⁿ − (1−φ)ⁿ ) / √5
      </p>
      <p>
        这个式子叫 Binet 公式。右边全是无理数，左边永远是整数，因为
        (1−φ) 的绝对值小于 1，n 一大它就衰减成零头，只够把结果推到最近的整数上。
        很多人说的「数学之美」大概就指这一类：两个看起来毫不搭界的世界，算完了严丝合缝。
      </p>

      <h2>第二幕 · 向日葵：唯一经得起较真的那个</h2>
      <p>
        向日葵盘上的种子按两族螺线交错排列，一族顺时针一族逆时针。
        数一数条数，通常是相邻的两个斐波那契数：34 和 55，或者 55 和 89。
        下面这盘种子是按同一条规则摆的：第 i 颗放在半径 <span className="k">√i</span>、
        角度 <span className="k">i × θ</span> 的地方，θ 就是滑杆上那个发散角。
      </p>

      <SunflowerPanel />

      <p>
        右边那条曲线是全页的答案。纵轴是「整盘里最挤的那一对种子隔多远」，
        越高说明盘面铺得越匀、没有任何两颗挤到一块去。曲线在 137.5° 附近立起一根尖峰，
        <strong>拖过去的那一瞬间螺线会咬合，拖开 0.2° 就散</strong>。
      </p>
      <p>
        为什么峰在这里？看读数里的连分数。任何角度都可以写成
        <span className="k">[a₀; a₁, a₂, …]</span> 的形式，这串数字里出现大数，
        就意味着这个角度能被某个简单分数 p/q 逼得很近，于是种子每隔 q 颗就转回差不多的方向，
        排成 q 条直臂，臂与臂之间留下大片空地。你可以把滑杆拖到 144°（= 360 × 2/5）试试，
        五条臂，中间全是浪费掉的空隙。
      </p>
      <p>
        而 <span className="k">θ/360 = 1/φ² = 0.381966…</span> 的连分数是
        <span className="k">[0; 2, 1, 1, 1, 1, …]</span>，从第二位起全是 1，再也不会出现大数。
        1 是最小的可能值，所以它落在<strong>最难被有理数逼近的那一类数</strong>里
        （Hurwitz 定理给的界正好卡在 √5 上，这一类叫「贵金属数」，连分数迟早全是 1）。
        种子永远排不成直臂，只能一层层错开去填空。所谓「最优」，说白了就是最不整齐。
      </p>
      <p>
        注意是「一类」不是「一个」。这件事后面还要用到：<strong>黄金角并不是唯一的最优解</strong>，
        它只是这一类里连分数最早开始全是 1 的那个。
      </p>

      <h3>它不是被算出来的，是被滚出来的</h3>
      <p>
        这里有个容易滑过去的坑：植物不会解优化问题。1992 年 Douady 和 Couder 做过一个很干净的实验，
        把带磁性的液滴按固定间隔滴进圆盘中心，液滴之间互相排斥、被缓慢往外推。
        没有任何一处代码写着 137.5°，但发散角会自己收敛到那里。
      </p>
      <p>
        规则只有一条，而且是纯局部的：<strong>新来的那颗，挤进当前斥力最小的那个缺口</strong>。
        真实植物里这条规则由生长素（auxin）浓度实现，新叶原基长在生长素积累的位置，
        而已有的原基会把周围的生长素抽走。是同一件事的化学版本。
      </p>

      <h2>第三幕 · 鹦鹉螺：形状对，数字错</h2>
      <p>
        这是流传最广的一条错误。鹦鹉螺壳确实是一条对数螺线，
        <span className="k">r = a·e^(bθ)</span>，这点没问题。问题在于常数。
        黄金螺线每转一圈半径放大 φ ≈ 1.618 倍，而鹦鹉螺实测大约是 <strong>1.33</strong>。
      </p>

      <NautilusPanel />

      <p>
        两条线在最外圈按同一个半径对齐，往里转一圈就分开，转三圈已经差出一倍多。
        这不是测量精度的问题，是两条不同的曲线。
      </p>
      <p>
        对数螺线本身有个非常朴素的理由，跟 φ 一点关系都没有：<strong>等角生长</strong>。
        壳只能在开口处往外添新料，添的时候如果各个方向按同一比例放大，
        那么长大之后的形状和小时候完全相似，只是尺寸变了。
        满足这个条件的曲线就是对数螺线，而放大率 <em>k</em> 取多少，取决于这个物种各方向的生长速度比。
        任何 k 都行，鹦鹉螺选了 1.33，你把上面的滑杆拖到任何一处，画出来的都是一条合法的对数螺线。
      </p>
      <p>
        所以准确的说法是：鹦鹉螺演示的是<strong>自相似生长</strong>，不是黄金分割。
        前者才是它跟向日葵真正共享的东西，两边都是「一条局部规则反复用，宏观图样自己浮出来」。
      </p>

      <h2>第四幕 · 误差怎么理解</h2>
      <p>
        真实的向日葵当然不会精确到 137.50776°。那把偏差理解成噪声、理解成「有误差但还能用」，
        对不对？方向对，但真实情况比这个更强一档，而且强的地方正是最有意思的地方。
      </p>
      <p>
        噪声模型假设系统心里有个目标值，实际输出 = 目标 + 抖动，抖动会累积。
        但叶序不是这么工作的。那条局部规则每放一颗种子就重新问一次「现在哪儿最空」，
        <strong>上一颗放偏了，下一颗会自动往回补</strong>。137.5° 不是被存起来的参数，
        是这个动力系统的<strong>吸引子</strong>。偏差不是被容忍，是被主动纠回来的。
      </p>
      <p>
        真正会让图样变样的不是抖动大小，是落进了哪个吸引盆。
      </p>

      <BasinPanel />

      <p>
        拉远看的那条曲线说明了为什么会有第二个盆：峰不止一个，
        99.5° 那根甚至比 137.5° 还高出一丝。这两个角都是贵金属数，
        属于同一个「最难逼近」的等价类，密排质量本来就该打平。
        所以卢卡斯型向日葵不是次品，它是另一个同样合法的解。
      </p>
      <p>
        Douady–Couder 实验里，落进哪个盆由一个参数决定：新原基出现的间隔与盘面扩张速度之比。
        这个比值在起步阶段就定下来了，之后一路锁死。所以那约四分之一「不是斐波那契」的向日葵，
        绝大多数不是长坏了，是从一开始就在另一条轨道上。
        2016 年英国 MSI 做过一次公众科学统计，657 株里大约四分之三数得出斐波那契，
        其余是卢卡斯数列、双斐波那契，以及少量确实排乱了的。
      </p>
      <p>
        这个区分放到别处也成立。系统输出跟理想值有偏差时，先别急着归给噪声，
        先问一句：这个理想值是被存在某个地方的常数，还是某条规则的不动点？
        如果是前者，偏差会累积；如果是后者，规则本身就在做纠偏，而<strong>真正的风险不是抖动变大，是整个系统滑进了另一个不动点</strong>。
        那时候输出依然自洽、依然「看起来对」，只是对的是另一件事。
      </p>

      <h2>尾声 · 蜻蜓不在这条线上</h2>
      <p>
        短片最后那个蜻蜓翅膀的镜头，数学上跟前面两个没有亲缘关系。
        翅脉围出来的那些多边形接近 <strong>Voronoi 剖分</strong>：先散布一批点，
        每个点占住「离它最近」的那片区域，边界就是翅脉。
        2018 年 Hoffmann 等人在 PNAS 上量过蜻蜓目 232 个物种的翅室，
        几何统计与均匀撒点的 Voronoi 高度相似（细节和它不够的地方，下一页展开）。
      </p>
      <p>
        这跟 φ 无关，但跟向日葵共享一件更深的东西：<strong>都是局部规则生成的全局图样</strong>。
        向日葵是「挤进最大的空隙」，蜻蜓翅是「归给最近的中心」。
        自然里这类例子远比黄金分割多，也远比黄金分割重要：
        Kleiber 定律那样的异速标度、Turing 反应扩散给出的斑纹、
        输运网络的分形分支、六边形密堆。
        黄金分割出名主要是因为它好看好讲，被通俗写作反复加戏，
        <strong>它是一条局部规则的副产品，不是自然界的头号定律</strong>。
      </p>
      <p>
        顺带一提 Vila 本人：他不是数学教授，也不是建筑师。
        1990 年毕业于巴塞罗那大学美术学院的平面与工业设计专业，
        之后在广告公司做了二十年平面设计和插画，九十年代末转 3D，
        在萨拉戈萨做自雇。这支片子是他自己掏时间做的。
      </p>

      <Landing>
        真正值得从这一页带走的不是 137.5077 这个数，而是它<strong>怎么来的</strong>：
        一条只看局部的贪心规则，反复执行几百次，宏观上浮出一个精确的常数，
        而这个常数从头到尾没有被任何地方存储过。
        自然界大量的「精确」都是这么来的，不是算出来的，是滚出来的。
        遇到一个漂亮的常数时，值得先问一句：它是参数，还是不动点？
      </Landing>
    </AlgoShell>
  )
}

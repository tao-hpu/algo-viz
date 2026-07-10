import { type ReactNode, useMemo, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'
import { Player } from '../components/Player'
import { usePlayer } from '../lib/player'

/* ────────────────────────────────────────────────────────────
   快速排序 · 挑一个基准，分而治之
   核心直觉：分区一次，扫一遍区间，把比基准小的全甩到左边、
   大的留在右边，基准自己落进它最终的位置，此后永远不用再动。
   剩下的左右两半互不相干，各自重复这件事。
   基准切得均匀，log₂n 层就到底，总共 n log n 次比较；
   基准每次都挑到最小的那个，一层只切掉一个元素，就退化成 n²。
   「已排好 + 取末尾」正好把后一种情况完整地演给你看。
   ──────────────────────────────────────────────────────────── */

const N = 24

type Kind = 'range' | 'compare' | 'swap' | 'place' | 'done'

interface Frame {
  arr: number[]
  lo: number
  hi: number
  pivot: number   // 基准所在下标，没有基准时为 -1
  i: number       // 小于区右边界（下一个小元素该落的位置）
  j: number       // 扫描指针
  kind: Kind
  sorted: boolean[]
  marks: number[] // 这一帧要描朱红边的柱子
  note: ReactNode
  depth: number
  comps: number
  swaps: number
}

type DataMode = 'rand' | 'sorted' | 'rev' | 'dup'
type PivotMode = 'last' | 'rand' | 'med3'

const DATA_MODES: { key: DataMode; name: string }[] = [
  { key: 'rand', name: '随机' },
  { key: 'sorted', name: '已排好' },
  { key: 'rev', name: '逆序' },
  { key: 'dup', name: '大量重复' },
]

const PIVOT_MODES: { key: PivotMode; name: string }[] = [
  { key: 'last', name: '取末尾' },
  { key: 'rand', name: '随机' },
  { key: 'med3', name: '三数取中' },
]

// 自带随机源：同样的 seed 必须生成同样的数据和同样的基准选择，
// 否则每次重渲染帧数组都变，播放器会当场跳帧。
function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const DUP_VALUES = [18, 42, 66, 90]

function makeData(mode: DataMode, seed: number): number[] {
  const rnd = mulberry32(seed * 2654435761 + 17)
  if (mode === 'dup') {
    return Array.from({ length: N }, () => DUP_VALUES[Math.floor(rnd() * DUP_VALUES.length)])
  }
  const base = Array.from({ length: N }, () => 6 + Math.floor(rnd() * 92))
  if (mode === 'sorted') return base.sort((a, b) => a - b)
  if (mode === 'rev') return base.sort((a, b) => b - a)
  return base
}

function choosePivot(a: number[], lo: number, hi: number, mode: PivotMode, rnd: () => number): number {
  if (mode === 'last') return hi
  if (mode === 'rand') return lo + Math.floor(rnd() * (hi - lo + 1))
  const mid = (lo + hi) >> 1
  const x = a[lo], y = a[mid], z = a[hi]
  if ((x <= y && y <= z) || (z <= y && y <= x)) return mid
  if ((y <= x && x <= z) || (z <= x && x <= y)) return lo
  return hi
}

// 一次性把整个排序过程摊成帧数组。用显式栈代替递归，
// 这样每一帧都拿得到「当前区间」和「递归深度」这两个量。
function buildFrames(data: number[], pivotMode: PivotMode, seed: number): Frame[] {
  const a = data.slice()
  const sorted = new Array<boolean>(N).fill(false)
  const rnd = mulberry32(seed * 40503 + 9)
  const frames: Frame[] = []
  let comps = 0
  let swaps = 0

  // arr / sorted 每帧都拷一份：播放器可以任意后退，
  // 快照绝不能被后面的步骤改到。
  const emit = (
    kind: Kind,
    lo: number, hi: number, pivot: number, i: number, j: number,
    depth: number, marks: number[], note: ReactNode,
  ) => {
    frames.push({ arr: a.slice(), sorted: sorted.slice(), kind, lo, hi, pivot, i, j, depth, marks, note, comps, swaps })
  }

  const swap = (p: number, q: number) => {
    const t = a[p]; a[p] = a[q]; a[q] = t
    swaps++
  }

  const stack: { lo: number; hi: number; depth: number }[] = [{ lo: 0, hi: N - 1, depth: 0 }]

  while (stack.length) {
    const { lo, hi, depth } = stack.pop()!
    if (lo > hi) continue

    if (lo === hi) {
      sorted[lo] = true
      emit('place', lo, hi, -1, -1, -1, depth, [lo], <>区间只剩 a[{lo}] = {a[lo]} 一个数，天然有序，直接归位</>)
      continue
    }

    emit('range', lo, hi, -1, -1, -1, depth, [], <>区间 [{lo}, {hi}]：还剩 {hi - lo + 1} 个数要排</>)

    const pi = choosePivot(a, lo, hi, pivotMode, rnd)
    if (pi !== hi) {
      const pv = a[pi]
      swap(pi, hi)
      emit('swap', lo, hi, hi, -1, -1, depth, [pi, hi], <>选中基准 {pv}，先把它换到区间末尾，再开扫</>)
    }

    const pv = a[hi]
    let i = lo
    for (let j = lo; j < hi; j++) {
      comps++
      const v = a[j]
      const smaller = v < pv
      const verdict = smaller
        ? (i === j ? '更小，本来就在左边，边界右移' : '更小，甩到左边')
        : '不小于，留在右边不动'
      emit('compare', lo, hi, hi, i, j, depth, [j], <>比较 a[{j}] = {v} 与 pivot = {pv} → {verdict}</>)
      if (smaller) {
        if (i !== j) {
          swap(i, j)
          emit('swap', lo, hi, hi, i, j, depth, [i, j], <>a[{i}] ↔ a[{j}] 交换，小的进左半区</>)
        }
        i++
      }
    }

    if (i !== hi) swap(i, hi)
    sorted[i] = true
    emit('place', lo, hi, -1, -1, -1, depth, [i], <><em>pivot {pv} 落到位置 {i}</em>，左边全比它小，右边全不比它小，这个位置再也不用动</>)

    // 先压右半区，左半区后压先弹：视觉上从左往右推进。
    stack.push({ lo: i + 1, hi, depth: depth + 1 })
    stack.push({ lo, hi: i - 1, depth: depth + 1 })
  }

  emit('done', 0, N - 1, -1, -1, -1, 0, [], (
    <span className="done">{N} 个数全部归位，共比较 {comps} 次、交换 {swaps} 次</span>
  ))
  return frames
}

const VW = 720
const VH = 300
const PAD = 16
const TOP = 44
const BASE = 226
const RULER_Y = 244
const TRI_Y = 258
const LETTER_Y = 282

const SLOT = (VW - 2 * PAD) / N
const BW = SLOT * 0.72
const xOf = (k: number) => PAD + SLOT * k + (SLOT - BW) / 2
const cxOf = (k: number) => PAD + SLOT * k + SLOT / 2

const AVG = Math.round(N * Math.log2(N))
const WORST = (N * N) / 2

export function QuickSort() {
  const [dataMode, setDataMode] = useState<DataMode>('rand')
  const [pivotMode, setPivotMode] = useState<PivotMode>('last')
  const [seed, setSeed] = useState(1)

  const data = useMemo(() => makeData(dataMode, seed), [dataMode, seed])
  const frames = useMemo(() => buildFrames(data, pivotMode, seed), [data, pivotMode, seed])
  const p = usePlayer(frames.length, 8)
  const f = frames[p.i]

  const maxV = Math.max(...data)
  const deadly = dataMode === 'sorted' && pivotMode === 'last'
  const showIJ = f.i >= 0 && f.j >= 0
  const dupI = showIJ && f.i === f.j

  const barFill = (k: number) => {
    if (f.sorted[k]) return '#4a6b52'
    if (k === f.pivot) return '#d6452c'
    return '#c9c2b2'
  }

  return (
    <AlgoShell
      slug="quicksort"
      lede={
        <>
          挑一个数当<strong>基准</strong>，扫一遍，把比它小的甩到左边、大的留在右边。
          基准就此落进它最终的位置，永远不用再动；剩下的左右两半互不相干，各自重复这件事。
          切得准就是 <span className="k">n log n</span>，切得偏就是 <span className="k">n²</span>。
          换换下面两个开关，看这两个数字怎么互相甩开。
        </>
      }
    >
      <div className="lab">
        <div className="controls" style={{ marginTop: 0, marginBottom: 18, borderTop: 'none', paddingTop: 0 }}>
          <div className="seg" role="tablist" aria-label="初始数据">
            {DATA_MODES.map((m) => (
              <button key={m.key} className={m.key === dataMode ? 'on' : ''} onClick={() => { setDataMode(m.key); p.reset() }}>
                {m.name}
              </button>
            ))}
          </div>
          <div className="seg" role="tablist" aria-label="基准选择">
            {PIVOT_MODES.map((m) => (
              <button key={m.key} className={m.key === pivotMode ? 'on' : ''} onClick={() => { setPivotMode(m.key); p.reset() }}>
                {m.name}
              </button>
            ))}
          </div>
          {deadly && (
            <div style={{ fontSize: 13.5, color: '#b5391f', maxWidth: '24em', lineHeight: 1.5 }}>
              这就是朴素快排的死穴：每次分区只切掉一个元素，比较次数逼近 n²/2，递归深度打到 n。
            </div>
          )}
        </div>

        <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`快速排序过程，${N} 根柱子，高亮当前区间、基准和扫描指针`}>
          <text x={VW - PAD} y={22} textAnchor="end" fontFamily="var(--font-mono)" fontSize={12} fill="#9a968a">
            递归深度 {f.depth}
          </text>

          {f.arr.map((v, k) => {
            const h = Math.max(3, (v / maxV) * (BASE - TOP))
            const inRange = k >= f.lo && k <= f.hi
            const marked = f.marks.includes(k)
            return (
              <rect
                key={k}
                x={xOf(k)}
                y={BASE - h}
                width={BW}
                height={h}
                fill={barFill(k)}
                stroke={marked ? '#b5391f' : 'none'}
                strokeWidth={marked ? 1.8 : 0}
                opacity={inRange || f.sorted[k] ? 1 : 0.28}
              />
            )
          })}

          {/* 基准值标在它自己的柱头上 */}
          {f.pivot >= 0 && (
            <text
              x={cxOf(f.pivot)}
              y={BASE - Math.max(3, (f.arr[f.pivot] / maxV) * (BASE - TOP)) - 6}
              textAnchor="middle" fontFamily="var(--font-mono)" fontSize={11} fill="#b5391f"
            >
              {f.arr[f.pivot]}
            </text>
          )}

          {/* 当前区间 [lo, hi] 的标尺 */}
          {f.kind !== 'done' && (
            <g stroke="#d6452c" strokeWidth={1.2}>
              <line x1={xOf(f.lo)} y1={RULER_Y} x2={xOf(f.hi) + BW} y2={RULER_Y} />
              <line x1={xOf(f.lo)} y1={RULER_Y - 5} x2={xOf(f.lo)} y2={RULER_Y + 5} />
              <line x1={xOf(f.hi) + BW} y1={RULER_Y - 5} x2={xOf(f.hi) + BW} y2={RULER_Y + 5} />
            </g>
          )}

          {/* i = 小于区边界，j = 扫描指针；两者重合时左右各让 5px */}
          {showIJ && (
            <g>
              <g transform={`translate(${cxOf(f.i) - (dupI ? 5 : 0)},0)`}>
                <path d={`M-5 ${TRI_Y + 9} L5 ${TRI_Y + 9} L0 ${TRI_Y} Z`} fill="#9a968a" />
                <text x={0} y={LETTER_Y} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={11} fill="#9a968a">i</text>
              </g>
              <g transform={`translate(${cxOf(f.j) + (dupI ? 5 : 0)},0)`}>
                <path d={`M-5 ${TRI_Y + 9} L5 ${TRI_Y + 9} L0 ${TRI_Y} Z`} fill="#d6452c" />
                <text x={0} y={LETTER_Y} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={11} fill="#b5391f">j</text>
              </g>
            </g>
          )}
        </svg>

        <div className="legend">
          <span><i style={{ background: '#d6452c' }} />基准 pivot</span>
          <span><i style={{ background: '#c9c2b2', boxShadow: 'inset 0 0 0 1.5px #b5391f' }} />当前比较的 j</span>
          <span><i style={{ background: '#4a6b52' }} />已永久归位</span>
          <span><i style={{ background: '#c9c2b2' }} />区间内待排</span>
          <span><i style={{ background: '#c9c2b2', opacity: 0.28 }} />区间外</span>
        </div>

        <div className="step-note">{f.note}</div>

        <Player p={p} extra={<button className="btn" onClick={() => { setSeed((s) => s + 1); p.reset() }}>洗牌</button>} />

        <div className="readout">
          <div className="item">
            <span className="lbl">已比较</span>
            <span className="val">{f.comps}</span>
          </div>
          <div className="item">
            <span className="lbl">n·log₂n（切得准的样子）</span>
            <span className="val">{AVG}</span>
          </div>
          <div className="item">
            <span className="lbl">n²/2（切得最偏的样子）</span>
            <span className="val">{WORST}</span>
          </div>
          <div className="item">
            <span className="lbl">已交换</span>
            <span className="val">{f.swaps}</span>
          </div>
          <div className="item">
            <span className="lbl">当前递归深度</span>
            <span className="val">{f.depth}</span>
          </div>
          <div className="item">
            <span className="lbl">数组规模 n</span>
            <span className="val">{N}</span>
          </div>
        </div>
      </div>

      <h2>分区一次，到底做完了什么</h2>
      <p>
        选一个基准 <span className="k">pivot</span>，从区间头扫到尾：比它小的往左边攒，剩下的留在右边。
        扫完把基准换到两堆的接缝处。此刻基准站的这个格子，<strong>就是它在最终有序数组里的位置</strong>，
        因为左边没有一个数比它大，右边没有一个数比它小。这个格子再也不用动了。
        剩下的左右两段谁也管不着谁，各自当成一个新问题重来一遍。快排的全部内容就是这两句话。
      </p>

      <h2>为什么平均是 n log n</h2>
      <p>
        一次分区要把区间里的每个元素都看一眼，所以某一层上所有区间加起来正好是 <span className="k">n</span> 次比较。
        只要基准每次大致切在中间，区间长度就一路对折：n、n/2、n/4… 折 <span className="k">log₂n</span> 次就到底。
        层数乘每层的代价，就是 n log n。上面 readout 里的 {AVG} 就是这么来的。
      </p>

      <h2>为什么最坏是 n²</h2>
      <p>
        如果基准每次都恰好是区间里最小（或最大）的那个数，分区就切不动：一边空着，另一边只少了一个元素。
        长度从 n 掉到 n−1 再到 n−2，要走 n 层才到底，比较次数堆到 <span className="k">n²/2 = {WORST}</span>。
        把上面切成「已排好 + 取末尾」按下播放，你会亲眼看着递归深度爬到 23、比较次数逼近 {WORST}。
        <strong>排好序的数组是朴素快排的死穴</strong>，而这不是理论上的可能性：数据库导出的结果、上一轮排过的列表、
        按时间写入的日志，天天都是有序的。「大量重复」加「取末尾」也是同一个坑，等值元素全被推到右边，一样切不动。
      </p>

      <h2>随机化和三数取中怎么救</h2>
      <p>
        它们没有消灭 n²，只是把「最坏输入」换成了「最坏运气」。基准随机挑，任何一个固定输入都不再稳定触发退化；
        攻击者也构造不出你的随机数。三数取中拿首、中、尾三个数的中位数当基准，代价是两次比较，
        换来的是有序输入直接被切在正中间。这两招把 n² 的概率压到可以忽略，工程上就够了。
      </p>

      <h2>原地，但不稳定</h2>
      <p>
        快排不额外开数组，只借 <span className="k">O(log n)</span> 的栈记住还没处理的区间，所以内存开销几乎为零。
        代价是它<strong>不稳定</strong>：分区里的交换会把两个相等的元素前后调个个儿，原本的相对顺序保不住。
        要是你在「先按名字排、再按分数排」这种场景里指望前一轮的顺序留着，快排会让你失望。归并排序不会。
      </p>

      <Landing>
        C 的 <span className="k">qsort</span>、C++ 的 <span className="k">std::sort</span> 都以快排为骨架，但没人裸用它。
        <span className="k">std::sort</span> 实际跑的是 introsort：快排开路，递归一深就切成堆排序兜底，
        小片段留给插入排序收尾。三种排序缝在一起，只为把 n² 那条尾巴彻底剪掉。
        快排踩过的坑，最后都写进了标准库。
      </Landing>
    </AlgoShell>
  )
}

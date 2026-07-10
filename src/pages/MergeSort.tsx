import { useEffect, useMemo, useState } from 'react'
import { AlgoShell, Landing } from '../components/AlgoShell'
import { Player } from '../components/Player'
import { usePlayer } from '../lib/player'

/* ────────────────────────────────────────────────────────────
   归并排序 · 自底向上
   核心直觉：长度 1 的段天然有序；两个已经有序的段，各出一个指针
   指向段头，谁小谁出列，一遍线性扫描就能并成一个更长的有序段。
   于是宽度 1 并成 2、2 并成 4……每层都只扫 n 个数，总共 log₂n 层。
   层数只跟 n 有关，跟数据长什么样毫无关系，所以归并没有「最坏情况」。
   这一页把递归树摊平成一层层的合并，看输出缓冲被红绿交替填满。
   ──────────────────────────────────────────────────────────── */

type Side = 'L' | 'R' | null
type Kind = 'level' | 'compare' | 'take-left' | 'take-right' | 'writeback' | 'done'

interface Frame {
  arr: number[]
  lo: number          // 本次归并的区间；< 0 表示这一帧没有正在进行的归并
  mid: number
  hi: number
  i: number           // 左段游标
  j: number           // 右段游标
  out: (number | null)[]
  from: Side[]        // out[k] 是从左段还是右段取的
  kind: Kind
  level: number
  runW: number        // 当前已有序段的宽度（也就是本层要两两合并的段宽）
  em: string
  note: string
  done: boolean
  comps: number
  writes: number
}

const N = 16
const LEVELS = Math.ceil(Math.log2(N))   // 4
const NLOGN = N * Math.log2(N)           // 64

const RED = '#d6452c'
const RED_INK = '#b5391f'
const MOSS = '#4a6b52'
const MUTE = '#c9c2b2'
const RULE = '#d9d2c4'
const FAINT = '#9a968a'

type Mode = 'random' | 'sorted' | 'reversed'

// xorshift：同一个 seed 永远给同一份数据，帧数组才敢放心 useMemo。
function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

function makeInput(mode: Mode, seed: number): number[] {
  const asc = Array.from({ length: N }, (_, k) => k + 1)
  if (mode === 'sorted') return asc
  if (mode === 'reversed') return asc.slice().reverse()
  const rand = rng(seed + 7)
  for (let k = N - 1; k > 0; k--) {
    const r = Math.floor(rand() * (k + 1))
    const t = asc[k]; asc[k] = asc[r]; asc[r] = t
  }
  return asc
}

// 只数比较次数，不产帧：用来把三种输入的代价摆在一起对照。
function countComps(input: number[]): number {
  const arr = input.slice()
  const buf = new Array<number>(N)
  let c = 0
  for (let w = 1; w < N; w *= 2) {
    for (let lo = 0; lo + w < N; lo += 2 * w) {
      const mid = lo + w
      const hi = Math.min(lo + 2 * w, N)
      let i = lo, j = mid, k = lo
      while (i < mid && j < hi) { c++; buf[k++] = arr[i] <= arr[j] ? arr[i++] : arr[j++] }
      while (i < mid) buf[k++] = arr[i++]
      while (j < hi) buf[k++] = arr[j++]
      for (let t = lo; t < hi; t++) arr[t] = buf[t]
    }
  }
  return c
}

type Snap = {
  kind: Kind
  level: number
  runW: number
  note: string
  em?: string
  done?: boolean
  range?: { lo: number; mid: number; hi: number; i: number; j: number }
  out?: (number | null)[]
  from?: Side[]
}

function buildFrames(input: number[]): Frame[] {
  const arr = input.slice()
  const frames: Frame[] = []
  let comps = 0
  let writes = 0

  // 每帧存一份完整的不可变快照。arr / out / from 都是活的可变数组，
  // 直接塞进帧里的话，后面的步骤会把它们改掉，往回拖进度条就看到未来的状态。
  const snap = (s: Snap) => {
    const r = s.range
    frames.push({
      arr: arr.slice(),
      lo: r ? r.lo : -1,
      mid: r ? r.mid : -1,
      hi: r ? r.hi : -1,
      i: r ? r.i : -1,
      j: r ? r.j : -1,
      out: s.out ? s.out.slice() : [],
      from: s.from ? s.from.slice() : [],
      kind: s.kind,
      level: s.level,
      runW: s.runW,
      em: s.em ?? '',
      note: s.note,
      done: s.done ?? false,
      comps,
      writes,
    })
  }

  snap({
    kind: 'level', level: 1, runW: 1,
    em: '第 1 层',
    note: `：${N} 个长度为 1 的段。一个数自己就是有序的，不用做任何事，这是递归的底。`,
  })

  for (let lvl = 1; lvl <= LEVELS; lvl++) {
    const w = 1 << (lvl - 1)
    for (let lo = 0; lo + w < N; lo += 2 * w) {
      const mid = lo + w
      const hi = Math.min(lo + 2 * w, N)
      const out: (number | null)[] = new Array(hi - lo).fill(null)
      const from: Side[] = new Array(hi - lo).fill(null)
      let i = lo, j = mid, k = 0

      while (i < mid && j < hi) {
        const L = arr[i]
        const R = arr[j]
        comps++
        const takeLeft = L <= R
        snap({
          kind: 'compare', level: lvl, runW: w, range: { lo, mid, hi, i, j }, out, from,
          note: L === R
            ? `左段 ${L} 和右段 ${R} 相等 → 取左边，相等的数不换位置`
            : `比较 左段 ${L} 和 右段 ${R} → ${takeLeft ? L : R} 更小，取${takeLeft ? '左' : '右'}边`,
        })
        if (takeLeft) { out[k] = L; from[k] = 'L'; i++ } else { out[k] = R; from[k] = 'R'; j++ }
        snap({
          kind: takeLeft ? 'take-left' : 'take-right', level: lvl, runW: w,
          range: { lo, mid, hi, i, j }, out, from,
          note: `${takeLeft ? L : R} 落进输出缓冲第 ${k + 1} 格`,
        })
        k++
      }
      // 一边先空了，另一边剩下的整体比它大（或小），照抄即可，一次比较也不用。
      while (i < mid) {
        const v = arr[i]; out[k] = v; from[k] = 'L'; i++
        snap({
          kind: 'take-left', level: lvl, runW: w, range: { lo, mid, hi, i, j }, out, from,
          note: `右段空了，左段剩下的 ${v} 直接搬过去，不用比较`,
        })
        k++
      }
      while (j < hi) {
        const v = arr[j]; out[k] = v; from[k] = 'R'; j++
        snap({
          kind: 'take-right', level: lvl, runW: w, range: { lo, mid, hi, i, j }, out, from,
          note: `左段空了，右段剩下的 ${v} 直接搬过去，不用比较`,
        })
        k++
      }

      for (let t = 0; t < out.length; t++) {
        const v = out[t]
        if (v !== null) arr[lo + t] = v
      }
      writes += out.length
      snap({
        kind: 'writeback', level: lvl, runW: w, range: { lo, mid, hi, i, j }, out, from,
        note: `缓冲写回原数组：位置 ${lo}–${hi - 1} 这 ${hi - lo} 个数已经有序`,
      })
    }

    if (lvl < LEVELS) {
      snap({
        kind: 'level', level: lvl + 1, runW: 2 * w,
        em: `第 ${lvl} 层完成`,
        note: `：${N / (2 * w)} 段各自有序，每段 ${2 * w} 个。下一层把它们两两并成 ${4 * w}`,
      })
    }
  }

  snap({
    kind: 'done', level: LEVELS, runW: N, done: true,
    note: `${N} 个数全部有序，共比较 ${comps} 次、写回 ${writes} 次`,
  })
  return frames
}

const VBW = 600
const VBH = 246
const PADX = 24
const SLOT = (VBW - 2 * PADX) / N
const BARW = 24
const BASE = 158        // 柱子基线
const BARMAX = 100
const SLOT_Y = 202      // 输出缓冲槽位顶边
const SLOT_H = 30

const xOf = (idx: number) => PADX + idx * SLOT + SLOT / 2
const barH = (v: number) => 8 + (v / N) * BARMAX

// 柱子的颜色只由「在不在本次归并区间里」和「是左段还是右段」决定。
function barStyle(f: Frame, idx: number): { fill: string; opacity: number } {
  if (f.lo < 0) return { fill: MUTE, opacity: 1 }
  if (idx < f.lo || idx >= f.hi) return { fill: MUTE, opacity: 0.28 }
  if (f.kind === 'writeback') return { fill: MUTE, opacity: 1 }
  const inLeft = idx < f.mid
  const consumed = inLeft ? idx < f.i : idx < f.j
  return { fill: inLeft ? RED : MOSS, opacity: consumed ? 0.4 : 1 }
}

type Bracket = { key: string; x1: number; x2: number; color: string; label: string }

function bracketsOf(f: Frame): Bracket[] {
  const span = (a: number, b: number) => [xOf(a) - BARW / 2 - 3, xOf(b - 1) + BARW / 2 + 3] as const
  if (f.kind === 'done') {
    const [x1, x2] = span(0, N)
    return [{ key: 'all', x1, x2, color: FAINT, label: '全部有序' }]
  }
  if (f.lo < 0) {
    // 层与层之间：把当前所有等宽的有序段都框出来，一眼看见段数在减半。
    const out: Bracket[] = []
    for (let a = 0; a < N; a += f.runW) {
      const [x1, x2] = span(a, a + f.runW)
      out.push({ key: 'r' + a, x1, x2, color: FAINT, label: '' })
    }
    return out
  }
  if (f.kind === 'writeback') {
    const [x1, x2] = span(f.lo, f.hi)
    return [{ key: 'wb', x1, x2, color: FAINT, label: `并好的段 · ${f.hi - f.lo} 个` }]
  }
  const [lx1, lx2] = span(f.lo, f.mid)
  const [rx1, rx2] = span(f.mid, f.hi)
  return [
    { key: 'L', x1: lx1, x2: lx2, color: RED, label: '左段' },
    { key: 'R', x1: rx1, x2: rx2, color: MOSS, label: '右段' },
  ]
}

export function MergeSort() {
  const [mode, setMode] = useState<Mode>('random')
  const [seed, setSeed] = useState(3)

  const input = useMemo(() => makeInput(mode, seed), [mode, seed])
  const frames = useMemo(() => buildFrames(input), [input])
  const p = usePlayer(frames.length, 6)
  const f = frames[p.i]

  // 换数据时帧数不一定变（比较次数可能碰巧相同），播放器不会自己退回开头，手动来一下。
  const { reset } = p
  useEffect(() => { reset() }, [input, reset])

  // 三种输入各要比多少次：这一页真正想让人看见的数字。
  const totals = useMemo(() => ({
    random: countComps(makeInput('random', seed)),
    sorted: countComps(makeInput('sorted', seed)),
    reversed: countComps(makeInput('reversed', seed)),
  }), [seed])

  const totalComps = frames[frames.length - 1].comps
  const filled = f.out.reduce<number>((c, v) => (v === null ? c : c + 1), 0)
  const newest = f.kind === 'take-left' || f.kind === 'take-right' ? filled - 1 : -1
  const brackets = bracketsOf(f)
  const caption = f.kind === 'done'
    ? `全部完成 · 共 ${LEVELS} 层`
    : `第 ${f.level} 层 / 共 ${LEVELS} 层 · 段宽 ${f.runW} → ${f.runW * 2}`

  return (
    <AlgoShell
      slug="merge-sort"
      lede={
        <>
          上一页的快排靠一个基准把数组劈成两半，劈得好不好全看运气，运气差就退化到 <span className="k">n²</span>。
          归并不赌运气：先把数组拆到不能再拆，再一层一层两两合并回去。
          每层都只扫一遍 <span className="k">n</span> 个数，而层数永远是 <span className="k">⌈log₂n⌉</span>，
          跟数据长什么样没有半点关系。
        </>
      }
    >
      <div className="lab">
        <div className="controls" style={{ marginTop: 0, marginBottom: 18, borderTop: 'none', paddingTop: 0 }}>
          <div className="seg" role="tablist" aria-label="选择初始数据">
            <button className={mode === 'random' ? 'on' : ''} onClick={() => setMode('random')}>随机</button>
            <button className={mode === 'sorted' ? 'on' : ''} onClick={() => setMode('sorted')}>已排好</button>
            <button className={mode === 'reversed' ? 'on' : ''} onClick={() => setMode('reversed')}>逆序</button>
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '26em' }}>
            三种输入排完各要比多少次：随机 <b style={{ color: RED_INK }}>{totals.random}</b> ·
            {' '}已排好 <b style={{ color: RED_INK }}>{totals.sorted}</b> ·
            {' '}逆序 <b style={{ color: RED_INK }}>{totals.reversed}</b>。
            切过去看一眼，数字几乎不动。
          </div>
        </div>

        <svg viewBox={`0 0 ${VBW} ${VBH}`} role="img"
          aria-label="归并排序过程：上层是数组柱状图，左段红、右段绿；下层是输出缓冲槽位，被红绿交替填满">
          <text x={PADX} y={16} fontSize={11} fill={FAINT} fontFamily="var(--font-mono)">{caption}</text>

          {/* 两个游标：三角形指向各自段头 */}
          {f.lo >= 0 && f.kind !== 'writeback' && f.i < f.mid && (
            <g fill={RED}>
              <text x={xOf(f.i)} y={31} fontSize={11} textAnchor="middle" fontFamily="var(--font-mono)">i</text>
              <path d={`M${xOf(f.i) - 6} 36 L${xOf(f.i) + 6} 36 L${xOf(f.i)} 47 Z`} />
            </g>
          )}
          {f.lo >= 0 && f.kind !== 'writeback' && f.j < f.hi && (
            <g fill={MOSS}>
              <text x={xOf(f.j)} y={31} fontSize={11} textAnchor="middle" fontFamily="var(--font-mono)">j</text>
              <path d={`M${xOf(f.j) - 6} 36 L${xOf(f.j) + 6} 36 L${xOf(f.j)} 47 Z`} />
            </g>
          )}

          {/* 数组柱状图 */}
          {f.arr.map((v, idx) => {
            const st = barStyle(f, idx)
            const h = barH(v)
            const head = f.kind === 'compare' && (idx === f.i || idx === f.j)
            return (
              <g key={idx} opacity={st.opacity}>
                <rect
                  x={xOf(idx) - BARW / 2} y={BASE - h} width={BARW} height={h} rx={2}
                  fill={st.fill} stroke={head ? '#2a2a28' : 'none'} strokeWidth={head ? 1.4 : 0}
                />
                <text x={xOf(idx)} y={BASE - h - 4} fontSize={9.5} textAnchor="middle"
                  fill={FAINT} fontFamily="var(--font-mono)">{v}</text>
              </g>
            )
          })}
          <line x1={PADX - 4} y1={BASE} x2={VBW - PADX + 4} y2={BASE} stroke={RULE} strokeWidth={1} />

          {/* 段的括号标尺 */}
          {brackets.map((b) => (
            <g key={b.key}>
              <path d={`M${b.x1} 168 v6 H${b.x2} v-6`} fill="none" stroke={b.color} strokeWidth={1.2} />
              {b.label && (
                <text x={(b.x1 + b.x2) / 2} y={186} fontSize={10.5} textAnchor="middle"
                  fill={b.color} fontFamily="var(--font-mono)">{b.label}</text>
              )}
            </g>
          ))}
          {f.lo < 0 && f.kind !== 'done' && (
            <text x={VBW / 2} y={186} fontSize={10.5} textAnchor="middle" fill={FAINT} fontFamily="var(--font-mono)">
              {N / f.runW} 段 × 每段 {f.runW} 个，段内已有序
            </text>
          )}

          {/* 输出缓冲 */}
          <text x={PADX} y={196} fontSize={10.5} fill={FAINT} fontFamily="var(--font-mono)">输出缓冲</text>
          {f.lo >= 0 ? f.out.map((v, k) => {
            const x = xOf(f.lo + k) - BARW / 2
            if (v === null) {
              return (
                <rect key={k} x={x} y={SLOT_Y} width={BARW} height={SLOT_H} rx={3}
                  fill="none" stroke={MUTE} strokeWidth={1} strokeDasharray="3 3" />
              )
            }
            const isL = f.from[k] === 'L'
            const c = isL ? RED : MOSS
            return (
              <g key={k}>
                <rect x={x} y={SLOT_Y} width={BARW} height={SLOT_H} rx={3}
                  fill={isL ? 'rgba(214,69,44,0.14)' : 'rgba(74,107,82,0.14)'}
                  stroke={c} strokeWidth={k === newest ? 2 : 1} />
                <text x={xOf(f.lo + k)} y={SLOT_Y + 20} fontSize={12} textAnchor="middle"
                  fill={isL ? RED_INK : MOSS} fontFamily="var(--font-mono)">{v}</text>
              </g>
            )
          }) : (
            <text x={VBW / 2} y={SLOT_Y + 20} fontSize={11.5} textAnchor="middle" fill={FAINT}
              fontFamily="var(--font-mono)">
              {f.kind === 'done' ? '排序结束，缓冲用不上了' : '下一层开始合并时，缓冲会在这里被红绿交替填满'}
            </text>
          )}
        </svg>

        <div className="step-note">
          {f.done
            ? <span className="done">{f.note}</span>
            : <>{f.em ? <em>{f.em}</em> : null}{f.note}</>}
        </div>

        <div className="legend">
          <span><i style={{ background: RED }} />左段 [lo, mid)，以及从左段取出的数</span>
          <span><i style={{ background: MOSS }} />右段 [mid, hi)，以及从右段取出的数</span>
          <span><i style={{ background: MUTE }} />本次归并区间外的数，这一步不参与</span>
        </div>

        <Player
          p={p}
          extra={
            <button className="btn" onClick={() => { setMode('random'); setSeed((s) => s + 1) }}>洗牌</button>
          }
        />

        <div className="readout">
          <div className="item">
            <span className="lbl">比较次数（到这一步）</span>
            <span className="val">{f.comps}</span>
          </div>
          <div className="item">
            <span className="lbl">写回次数</span>
            <span className="val">{f.writes}</span>
          </div>
          <div className="item">
            <span className="lbl">当前层 / ⌈log₂{N}⌉</span>
            <span className="val">{f.level} / {LEVELS}</span>
          </div>
          <div className="item">
            <span className="lbl">全程比较次数 vs n·log₂n</span>
            <span className="val">{totalComps} / {NLOGN}</span>
          </div>
        </div>
      </div>

      <h2>一个数天然有序</h2>
      <p>
        长度为 1 的数组不用做任何事就是有序的。这句废话是整个算法的地基：
        它意味着我们从来不需要「排序」，只需要「合并」。把 16 个数看成 16 个长度 1 的有序段，
        剩下的全部工作就是把它们并起来。
      </p>

      <h2>两个有序段并起来，只要线性一遍</h2>
      <p>
        给两个已经排好的段，各放一个游标 <span className="k">i</span>、<span className="k">j</span> 指向段头，
        比较两个段头，谁小谁出列，出列的那一边游标往后挪一格。
        <strong>因为两段各自有序，段头就是各自的最小值，所以整体的最小值必定在这两个里面</strong>，
        不用去看后面的任何一个数。每比较一次至少有一个数出列，总共 <span className="k">n</span> 个数，
        所以合并的代价是线性的。画面下层那条输出缓冲被红绿交替填满的过程，就是归并的全部内容。
      </p>
      <p>
        一边先空掉的时候更省：另一边剩下的数整体都比已出列的大，直接照抄进缓冲，一次比较都不用。
        「已排好」的输入之所以只比 32 次，就是因为每次合并都在右段还没开始动的时候把左段抄完了。
      </p>

      <h2>层数决定了 n log n，输入决定不了</h2>
      <p>
        宽度 1 的段两两并成 2，2 并成 4，4 并成 8，8 并成 16。每一层加起来正好扫过 n 个元素，
        而段宽每层翻倍，所以只需要 <span className="k">⌈log₂n⌉</span> 层。
        <span className="k">n log n</span> 就是「每层 n，共 log n 层」这么乘出来的。
      </p>
      <p>
        <strong>归并没有「最坏情况」这回事。</strong>把上面的初始数据在随机、已排好、逆序之间切换，
        层数一格不动，比较次数在 32 到 49 之间小幅晃动，永远压在 <span className="k">n·log₂n = 64</span> 以下。
        快排在已排好的输入上会把每次划分都切成 0 和 n−1，一路退化到 <span className="k">n²</span>；
        归并压根不看数据，它只是机械地往上并。
      </p>

      <h2>稳定，代价是一块缓冲</h2>
      <p>
        两个数相等时取左边那个（代码里是 <span className="k">arr[i] &lt;= arr[j]</span>，注意那个等号）。
        左段的元素本来就排在右段前面，取左边就保证了相等元素的相对顺序原封不动，这叫<strong>稳定</strong>。
        先按价格排一遍，再按店铺排一遍，同一家店内部仍然按价格有序。快排靠远距离交换搬运元素，做不到这件事。
      </p>
      <p>
        代价是那条输出缓冲：归并需要 <span className="k">O(n)</span> 的额外空间，不像快排能原地做。
        换来的是稳定，以及一个跟输入完全无关的性能承诺。这笔交易在真实工程里通常很划算。
      </p>

      <Landing>
        Python 的 <span className="k">sorted</span> 和 Java 的 <span className="k">Arrays.sort(Object[])</span> 用的
        Timsort 是归并的改良版：先扫一遍找出输入里本来就有序的连续段（run），再按归并的规矩把这些 run 并起来，
        几乎有序的数据能压到 <span className="k">O(n)</span>。链表排序也偏爱归并，因为合并只需要改指针，不需要随机访问下标。
        几十 GB 的日志排不进内存时，先切成能装下的块各自排好写回磁盘，再多路归并成一个文件，这就是外部排序。
      </Landing>
    </AlgoShell>
  )
}

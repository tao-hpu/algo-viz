/* ────────────────────────────────────────────────────────────
   二维标量场的公用零件 · 梯度场 / 梯度下降 / 动量法共用
   等高线用 marching squares 现算：给一个 f(x,y) 和一条高度线，
   逐格判断四个角在线的上面还是下面，就能拼出这条等高线。
   ──────────────────────────────────────────────────────────── */

export type Scalar2 = (x: number, y: number) => number
export interface Box {
  x0: number
  x1: number
  y0: number
  y1: number
}
/** 数学坐标下的一段线：[x1, y1, x2, y2] */
export type Seg = [number, number, number, number]

/** 数值梯度（中心差分）。任意 f 都成立，不用手推公式。 */
export function numGrad(f: Scalar2, x: number, y: number, h = 1e-4): [number, number] {
  return [(f(x + h, y) - f(x - h, y)) / (2 * h), (f(x, y + h) - f(x, y - h)) / (2 * h)]
}

/**
 * 一条等高线 f(x,y) = level，返回若干互不相连的线段（数学坐标）。
 * n 是每边的格子数：越大越平滑，求值次数是 (n+1)²。
 */
export function contourSegments(f: Scalar2, box: Box, level: number, n = 64): Seg[] {
  const segs: Seg[] = []
  const dx = (box.x1 - box.x0) / n
  const dy = (box.y1 - box.y0) / n

  // 先把 (n+1)² 个格点采完，四个角共享采样值，f 只求一次。
  const g: number[][] = []
  for (let j = 0; j <= n; j++) {
    const row: number[] = []
    for (let i = 0; i <= n; i++) row.push(f(box.x0 + i * dx, box.y0 + j * dy))
    g.push(row)
  }

  const t = (a: number, b: number) => (level - a) / (b - a)

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = box.x0 + i * dx
      const y = box.y0 + j * dy
      const v0 = g[j][i] // 左下
      const v1 = g[j][i + 1] // 右下
      const v2 = g[j + 1][i + 1] // 右上
      const v3 = g[j + 1][i] // 左上

      let c = 0
      if (v0 > level) c |= 1
      if (v1 > level) c |= 2
      if (v2 > level) c |= 4
      if (v3 > level) c |= 8
      if (c === 0 || c === 15) continue // 四角同侧：这一格没有等高线穿过

      // 四条边上的穿越点（只有真的被穿越的那条边才会被用到）
      const B: [number, number] = [x + t(v0, v1) * dx, y]
      const R: [number, number] = [x + dx, y + t(v1, v2) * dy]
      const T: [number, number] = [x + t(v3, v2) * dx, y + dy]
      const L: [number, number] = [x, y + t(v0, v3) * dy]
      const put = (a: [number, number], b: [number, number]) => segs.push([a[0], a[1], b[0], b[1]])

      // 规则只有一条：线段把「在线上方的角」和「在线下方的角」隔开。
      switch (c) {
        case 1: case 14: put(L, B); break
        case 2: case 13: put(B, R); break
        case 3: case 12: put(L, R); break
        case 4: case 11: put(R, T); break
        case 6: case 9: put(B, T); break
        case 7: case 8: put(L, T); break
        case 5: put(L, B); put(R, T); break // 鞍点：对角同侧，切掉两个角
        case 10: put(B, R); put(L, T); break
      }
    }
  }
  return segs
}

/** 在 [lo, hi] 里挑 k 条等高线；用平方间距，让谷底附近的圈不至于挤成一坨。 */
export function levelsOf(lo: number, hi: number, k = 9, power = 2): number[] {
  const out: number[] = []
  for (let i = 1; i <= k; i++) {
    const u = i / (k + 1)
    out.push(lo + (hi - lo) * Math.pow(u, power))
  }
  return out
}

/** 采样 f 在 box 上的值域，给 levelsOf 用。 */
export function rangeOf(f: Scalar2, box: Box, n = 40): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const v = f(box.x0 + ((box.x1 - box.x0) * i) / n, box.y0 + ((box.y1 - box.y0) * j) / n)
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  return [lo, hi]
}

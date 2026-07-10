import { useCallback, useEffect, useState } from 'react'

/* ────────────────────────────────────────────────────────────
   步进播放器 · 排序 / 图遍历 / 迭代优化共用
   约定：算法先一次性把整个过程摊平成一个「帧数组」，每帧是一份
   完整快照（数组内容、指针位置、当前解释文字…）。播放器只在这个
   数组上前进后退，不碰算法本身。好处是随便拖进度条都不会串状态，
   算法代码也永远是一段普通的、能单独读懂的循环。
   ──────────────────────────────────────────────────────────── */

export interface Player {
  i: number                  // 当前帧下标（永远合法，已夹在 [0, total-1]）
  total: number
  playing: boolean
  speed: number              // 帧/秒
  atStart: boolean
  atEnd: boolean
  setSpeed: (v: number) => void
  toggle: () => void
  step: (delta: number) => void
  seek: (i: number) => void
  reset: () => void
}

export function usePlayer(total: number, initialSpeed = 4): Player {
  const [raw, setRaw] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(initialSpeed)

  // 数据换了（重新洗牌、改参数）→ 帧数组是新的，游标退回开头并停下。
  // 必须在渲染期就地改，不能放 useEffect：effect 在浏览器绘制之后才跑，
  // 新帧数组更短时会先闪一帧「新数据的末态」再弹回开头。
  const [seenTotal, setSeenTotal] = useState(total)
  if (seenTotal !== total) {
    setSeenTotal(total)
    setRaw(0)
    setPlaying(false)
  }

  const i = Math.max(0, Math.min(total - 1, raw))
  const atStart = i <= 0
  const atEnd = i >= total - 1

  // 播放靠一串 setTimeout 接力：改 speed 立刻生效，到最后一帧自动停。
  useEffect(() => {
    if (!playing) return
    if (atEnd) {
      setPlaying(false)
      return
    }
    const t = setTimeout(() => setRaw((v) => v + 1), 1000 / speed)
    return () => clearTimeout(t)
  }, [playing, i, speed, atEnd])

  const toggle = useCallback(() => {
    if (playing) {
      setPlaying(false)
      return
    }
    if (atEnd) setRaw(0) // 停在末尾时按播放 = 从头再放一遍
    setPlaying(true)
  }, [playing, atEnd])

  const step = useCallback(
    (delta: number) => {
      setPlaying(false)
      setRaw((v) => Math.max(0, Math.min(total - 1, v + delta)))
    },
    [total],
  )

  const seek = useCallback(
    (n: number) => {
      setPlaying(false)
      setRaw(Math.max(0, Math.min(total - 1, n)))
    },
    [total],
  )

  const reset = useCallback(() => {
    setPlaying(false)
    setRaw(0)
  }, [])

  return { i, total, playing, speed, atStart, atEnd, setSpeed, toggle, step, seek, reset }
}

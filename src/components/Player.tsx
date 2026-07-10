import type { ReactNode } from 'react'
import type { Player as PlayerState } from '../lib/player'

// 步进播放条：重置 / 上一步 / 播放暂停 / 下一步 / 速度 / 帧计数。
// extra 放页面自己的按钮（洗牌、换数据…），排在最右边。
export function Player({ p, extra }: { p: PlayerState; extra?: ReactNode }) {
  return (
    <div className="player">
      <button className="btn" onClick={p.reset} disabled={p.atStart} aria-label="回到开头">↺</button>
      <button className="btn" onClick={() => p.step(-1)} disabled={p.atStart} aria-label="上一步">‹</button>
      <button className="btn primary" onClick={p.toggle}>
        {p.playing ? '暂停' : p.atEnd ? '重放' : '播放'}
      </button>
      <button className="btn" onClick={() => p.step(1)} disabled={p.atEnd} aria-label="下一步">›</button>

      <div className="control" style={{ minWidth: 118 }}>
        <label>速度 <b>{p.speed}×</b></label>
        <input
          type="range" min={1} max={30} step={1} value={p.speed}
          onChange={(e) => p.setSpeed(+e.target.value)}
          aria-label="播放速度"
        />
      </div>

      <input
        className="scrub" type="range" min={0} max={Math.max(0, p.total - 1)} step={1} value={p.i}
        onChange={(e) => p.seek(+e.target.value)}
        aria-label="拖动进度"
      />
      <span className="frame-count">{p.i + 1} / {p.total}</span>
      {extra}
    </div>
  )
}

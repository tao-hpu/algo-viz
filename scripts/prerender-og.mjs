// 构建后处理：为每个 live 算法页生成一份带专属 <title>/描述/OG 的静态 HTML。
//
// 为什么需要它：本站是纯客户端 SPA，社交平台的抓取器（微信、X、Slack…）
// 不会执行 JS，只读初始 HTML 的 <head>。所以每页的分享卡片必须在构建期
// 把 meta 焊进各自的 dist/a/<slug>/index.html，运行时的 JS 改 meta 它们看不到。
//
// 数据单一来源：直接读 src/catalog.ts（Node 22 原生剥类型），不复制清单。

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { liveAlgos } from '../src/catalog.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const ORIGIN = 'https://algo.fim.ai'
const SITE = '算法可视化实验室'

const escAttr = (s) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// 用识别属性定位 meta，只换它的 content="…"，与 Vite 是否压缩无关。
function setMetaContent(html, attr, value, val) {
  const re = new RegExp(`(<meta ${attr}="${value}" content=")[^"]*(")`)
  if (!re.test(html)) throw new Error(`prerender: 找不到 meta ${attr}="${value}"，index.html 结构变了？`)
  return html.replace(re, `$1${escAttr(val)}$2`)
}

const base = await readFile(join(DIST, 'index.html'), 'utf8')

for (const algo of liveAlgos) {
  const title = `${algo.title} · ${SITE}`
  const desc = algo.hook
  const url = `${ORIGIN}/a/${algo.slug}`

  let html = base
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escText(title)}</title>`)
  html = setMetaContent(html, 'name', 'description', desc)
  html = setMetaContent(html, 'property', 'og:title', title)
  html = setMetaContent(html, 'property', 'og:description', desc)
  html = setMetaContent(html, 'property', 'og:url', url)
  html = setMetaContent(html, 'property', 'og:image:alt', `${algo.title} · ${SITE}`)
  html = setMetaContent(html, 'name', 'twitter:title', title)
  html = setMetaContent(html, 'name', 'twitter:description', desc)

  const outDir = join(DIST, 'a', algo.slug)
  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, 'index.html'), html, 'utf8')
}

console.log(`prerender-og: 已为 ${liveAlgos.length} 个 live 页写入带专属 OG 的静态 HTML`)

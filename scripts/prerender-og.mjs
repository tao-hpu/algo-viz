// 构建后处理：为每个 live 算法页生成一份带专属 <title>/描述/OG/canonical 的静态 HTML，
// 顺便写出 sitemap.xml 和 robots.txt。
//
// 为什么需要它：本站是纯客户端 SPA，社交平台的抓取器（微信、X、Slack…）
// 不会执行 JS，只读初始 HTML 的 <head>。所以每页的分享卡片必须在构建期
// 把 meta 焊进各自的 dist/a/<slug>/index.html，运行时的 JS 改 meta 它们看不到。
// 搜索引擎同理：站点地图必须是构建期算好的静态文件。
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

function setCanonical(html, url) {
  const re = /(<link rel="canonical" href=")[^"]*(")/
  if (!re.test(html)) throw new Error('prerender: 找不到 <link rel="canonical">，index.html 结构变了？')
  return html.replace(re, `$1${escAttr(url)}$2`)
}

const base = await readFile(join(DIST, 'index.html'), 'utf8')

for (const algo of liveAlgos) {
  const title = `${algo.title} · ${SITE}`
  const desc = algo.hook
  const url = `${ORIGIN}/a/${algo.slug}`

  let html = base
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escText(title)}</title>`)
  html = setCanonical(html, url)
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

// 站点地图：首页 + 每个 live 页。抓取器不跑 JS，靠侧栏那些 <a> 是发现不全的。
const urls = [`${ORIGIN}/`, ...liveAlgos.map((a) => `${ORIGIN}/a/${a.slug}`)]
const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => `  <url><loc>${escText(u)}</loc></url>\n`).join('') +
  '</urlset>\n'
await writeFile(join(DIST, 'sitemap.xml'), sitemap, 'utf8')

await writeFile(
  join(DIST, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`,
  'utf8',
)

console.log(
  `prerender-og: 已为 ${liveAlgos.length} 个 live 页写入带专属 OG 的静态 HTML，` +
  `sitemap.xml 收录 ${urls.length} 条`,
)

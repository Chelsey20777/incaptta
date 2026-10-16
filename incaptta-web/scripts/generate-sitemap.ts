import * as fs from 'fs'
import * as path from 'path'

interface SitemapUrl {
  loc: string
  lastmod: string
  changefreq: string
  priority: string
}

const baseUrl = 'https://app.incaptta.co.zw'

const routes: SitemapUrl[] = [
  { loc: `${baseUrl}/#/`, lastmod: new Date().toISOString().split('T')[0], changefreq: 'daily', priority: '1.0' },
  { loc: `${baseUrl}/#/services`, lastmod: new Date().toISOString().split('T')[0], changefreq: 'weekly', priority: '0.9' },
  { loc: `${baseUrl}/#/projects`, lastmod: new Date().toISOString().split('T')[0], changefreq: 'weekly', priority: '0.8' },
  { loc: `${baseUrl}/#/calculator`, lastmod: new Date().toISOString().split('T')[0], changefreq: 'weekly', priority: '0.9' },
  { loc: `${baseUrl}/#/contact`, lastmod: new Date().toISOString().split('T')[0], changefreq: 'monthly', priority: '0.7' }
]

function generateSitemap(): string {
  const urlEntries = routes.map(route => `  <url>
    <loc>${route.loc}</loc>
    <lastmod>${route.lastmod}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`
}

function main(): void {
  const sitemapContent = generateSitemap()
  const publicDir = path.join(process.cwd(), 'public')
  const outputPath = path.join(publicDir, 'sitemap.xml')

  // Ensure public directory exists
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true })
  }

  fs.writeFileSync(outputPath, sitemapContent, 'utf-8')
  console.log(`Sitemap generated at ${outputPath}`)
}

main()

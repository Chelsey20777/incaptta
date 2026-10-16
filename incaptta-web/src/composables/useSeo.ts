import { useHead } from '@vueuse/head'

export function useSeo(options: {
  title: string
  description: string
  keywords?: string[]
  ogImage?: string
  ogType?: 'website' | 'article'
  canonicalPath?: string
}) {
  const baseUrl = 'https://app.incaptta.co.zw'
  const defaultOgImage = `${baseUrl}/og-default.jpg`

  useHead({
    title: options.title,
    meta: [
      { name: 'description', content: options.description },
      { name: 'keywords', content: (options.keywords ?? []).join(', ') },
      { name: 'robots', content: 'index, follow' },
      { name: 'author', content: 'Incaptta Private Limited' },

      { property: 'og:title', content: options.title },
      { property: 'og:description', content: options.description },
      { property: 'og:image', content: options.ogImage ?? defaultOgImage },
      { property: 'og:type', content: options.ogType ?? 'website' },
      { property: 'og:url', content: `${baseUrl}/#${options.canonicalPath ?? '/'}` },
      { property: 'og:site_name', content: 'Incaptta Agri-Structures' },
      { property: 'og:locale', content: 'en_ZW' },

      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: options.title },
      { name: 'twitter:description', content: options.description },
      { name: 'twitter:image', content: options.ogImage ?? defaultOgImage },

      { name: 'theme-color', content: '#1B5E20' },
    ],
    link: [
      { rel: 'canonical', href: `${baseUrl}/#${options.canonicalPath ?? '/'}` }
    ]
  })
}

import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

import type { RouteLocationNormalized } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { title: 'Incaptta Agri-Structures | Poultry Farming Solutions Zimbabwe' }
    },
    {
      path: '/services',
      name: 'services',
      component: () => import('@/views/ServicesView.vue'),
      meta: { title: 'Our Services — Incaptta Agri-Structures' }
    },
    {
      path: '/projects',
      name: 'projects',
      component: () => import('@/views/ProjectsView.vue'),
      meta: { title: 'Our Projects — Incaptta Agri-Structures' }
    },
    {
      path: '/calculator',
      name: 'calculator',
      component: () => import('@/views/CalculatorView.vue'),
      meta: { title: 'Fowlrun Calculator — Incaptta Agri-Structures' }
    },
    {
      path: '/contact',
      name: 'contact',
      component: () => import('@/views/ContactView.vue'),
      meta: { title: 'Contact Us — Incaptta Agri-Structures' }
    }
  ],
  scrollBehavior(to: RouteLocationNormalized) {
    if (to.hash) {
      return {
        el: to.hash,
        behavior: 'smooth'
      }
    }
    return { top: 0, behavior: 'smooth' }
  }
})

router.afterEach((to) => {
  document.title = to.meta.title as string || 'Incaptta Agri-Structures'
})

export default router

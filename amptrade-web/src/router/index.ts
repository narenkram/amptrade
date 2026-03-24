import { createRouter, createWebHistory } from 'vue-router'
import PrivateLayout from '@/layouts/PrivateLayout.vue'
import PublicLayout from '@/layouts/PublicLayout.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: PublicLayout,
      children: [
        {
          path: '',
          name: 'public-home',
          component: () => import('@/modules/public/views/HomeView.vue'),
        },
        {
          path: 'about',
          redirect: '/',
        },
        {
          path: 'pricing',
          redirect: '/',
        },
        // removed duplicate about route
        {
          path: ':pathMatch(.*)*',
          name: 'not-found',
          component: () => import('@/modules/public/views/NotFound.vue'),
          meta: {
            title: '404 Not Found',
            statusCode: 404,
          },
        },
      ],
    },
    {
      path: '/app',
      component: PrivateLayout,
      children: [
        {
          path: '',
          redirect: '/app/terminal',
        },

        {
          path: 'terminal',
          name: 'terminal',
          component: () => import('@/modules/private/multibrokertrade/TerminalView.vue'),
        },
        {
          path: 'dashboard',
          redirect: '/app/terminal',
        },
        {
          path: 'manage-brokers',
          name: 'brokers',
          component: () => import('@/modules/private/managebrokers/ManageBrokers.vue'),
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/modules/private/settings/SettingsView.vue'),
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/modules/private/settings/SettingsView.vue'),
        },
      ],
    },
    {
      // Auth routes removed
      path: '/auth',
      component: PublicLayout,
      children: [],
    },
    {
      path: '/broker-redirect',
      component: PrivateLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: 'flattrade',
          name: 'FlattradeRedirect',
          component: () => import('@/modules/private/managebrokers/BrokerRedirect.vue'),
        },
        {
          path: 'shoonya',
          name: 'ShoonyaRedirect',
          component: () => import('@/modules/private/managebrokers/BrokerRedirect.vue'),
        },
        {
          path: 'zebu',
          name: 'ZebuRedirect',
          component: () => import('@/modules/private/managebrokers/BrokerRedirect.vue'),
        },
        {
          path: 'tradesmart',
          name: 'TradesmartRedirect',
          component: () => import('@/modules/private/managebrokers/BrokerRedirect.vue'),
        },
        {
          path: 'zerodha',
          name: 'ZerodhaRedirect',
          component: () => import('@/modules/private/managebrokers/BrokerRedirect.vue'),
        },
        {
          path: 'infinn',
          name: 'InfinnRedirect',
          component: () => import('@/modules/private/managebrokers/BrokerRedirect.vue'),
        },
        {
          path: 'upstox',
          name: 'UpstoxRedirect',
          component: () => import('@/modules/private/managebrokers/BrokerRedirect.vue'),
        },
      ],
    },
  ],
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    } else {
      return {
        top: 0,
        behavior: 'smooth',
      }
    }
  },
})

// No authentication guards – AmpTrade is free and open

export default router

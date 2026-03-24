import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import Sitemap from 'vite-plugin-sitemap'
import viteCompression from 'vite-plugin-compression'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd())

  // Define your site URL based on environment
  const siteUrl = mode === 'production' ? 'https://www.amptrade.in' : 'http://localhost:5178'

  // Get dynamic routes from your router configuration
  const dynamicRoutes = [
    '/',
    '/about',
    '/pricing',
  ]

  // Create an array of plugins that are used in all environments
  const plugins = [
    vue(),
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
    }),
    Sitemap({
      hostname: siteUrl,
      dynamicRoutes: dynamicRoutes,
      exclude: [
        '/app/terminal',
        '/app/manage-brokers',
        '/app/settings',
        '/app/account',
        '/broker-redirect/flattrade',
        '/broker-redirect/shoonya',
        '/broker-redirect/zebu',
        '/broker-redirect/tradesmart',
        '/broker-redirect/zerodha',
        '/broker-redirect/upstox',
        '/broker-redirect/infinn',
      ],
      readable: true, // Makes the sitemap human-readable
      changefreq: {
        '/': 'daily',
        '/about': 'daily',
        '/pricing': 'daily',
        '*': 'daily',
      },
      priority: {
        '/': 1.0, // Homepage has highest priority
        '/pricing': 1.0,
        '/about': 1.0,
        '/auth/signin': 1.0,
        '/auth/signup': 1.0,
        '*': 0.5, // Default priority for other pages
      },
      lastmod: new Date(),
      generateRobotsTxt: true, // Generate robots.txt file
      robots: [
        {
          userAgent: '*',
          allow: '/',
          disallow: [
            '/app/*', // Disallow all authenticated routes
            '/broker-redirect/*', // Disallow all broker redirect routes
          ],
        },
        {
          userAgent: 'Mediapartners-Google',
          allow: '/',
        },
      ],
    }),
  ]

  // Only add visualizer plugin in development mode
  if (mode !== 'production') {
    plugins.push(
      visualizer({
        open: true,
        filename: 'dist/stats.html',
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
      })
    )
  }

  return {
    base: '/',
    plugins,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5178,
      proxy: {
        '/instruments': {
          target: env.VITE_API_URL,
          changeOrigin: true,
        },
        '/flattradeApi': {
          target: 'https://authapi.flattrade.in',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/flattradeApi/, ''),
        },
        '/shoonyaApi': {
          target: 'https://api.shoonya.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/shoonyaApi/, ''),
        },
        '/infinnApi': {
          target: 'https://api.infinn.in',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/infinnApi/, ''),
        },
        '/zebuApi': {
          target: 'https://go.mynt.in/',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/zebuApi/, ''),
        },
        '/tradesmartApi': {
          target: 'https://v2api.tradesmartonline.in',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/tradesmartApi/, ''),
        },
        '/zerodhaApi': {
          target: 'https://api.kite.trade',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/zerodhaApi/, ''),
        },
        '/growwApi': {
          target: 'https://api.groww.in',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/growwApi/, ''),
        },
      },
    },
    define: {
      'process.env.BASE_URL': JSON.stringify(env.VITE_API_URL),
      'process.env.FLATTRADE_WS_URL': JSON.stringify(env.VITE_FLATTRADE_WS_URL),
      'process.env.SHOONYA_WS_URL': JSON.stringify(env.VITE_SHOONYA_WS_URL),
      'process.env.INFINN_WS_URL': JSON.stringify(env.VITE_INFINN_WS_URL),
      'process.env.ZEBU_WS_URL': JSON.stringify(env.VITE_ZEBU_WS_URL),
      'process.env.TRADESMART_WS_URL': JSON.stringify(env.VITE_TRADESMART_WS_URL),
      'process.env.ZERODHA_WS_URL': JSON.stringify(env.VITE_ZERODHA_WS_URL),
      'process.env.UPSTOX_WS_URL': JSON.stringify(env.VITE_UPSTOX_WS_URL),
    },
    build: {
      minify: 'esbuild',
      esbuildOptions: {
        drop: mode === 'production' ? ['console', 'debugger'] : [],
      },
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              // Core Vue ecosystem - loaded on every page
              if (id.includes('vue') || id.includes('pinia') || id.includes('vue-router') || id.includes('@vueuse')) {
                return 'vendor-vue';
              }
              // Firebase - large bundle, lazy load when possible
              if (id.includes('firebase')) {
                return 'vendor-firebase';
              }
              // Bootstrap CSS/JS
              if (id.includes('bootstrap') || id.includes('@popperjs')) {
                return 'vendor-bootstrap';
              }
              // FontAwesome icons
              if (id.includes('@fortawesome')) {
                return 'vendor-icons';
              }
              // HTTP client
              if (id.includes('axios')) {
                return 'vendor-axios';
              }
              // Polyfills - only needed for older browsers
              if (id.includes('core-js') || id.includes('regenerator-runtime')) {
                return 'vendor-polyfills';
              }
              // Head management
              if (id.includes('@unhead') || id.includes('unhead')) {
                return 'vendor-head';
              }
              // Remaining node_modules go to a general vendor chunk
              return 'vendor-misc';
            }
          }
        }
      },
      cssCodeSplit: true,
      sourcemap: mode !== 'production',
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern',
          silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'if-function'],
        },
      },
    },
  }
})

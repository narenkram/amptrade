import './assets/main.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import 'core-js/stable'
import 'regenerator-runtime/runtime'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { FontAwesomeIcon } from '@/modules/common/icons/fontawesome'
import { createHead } from '@unhead/vue'

import App from './App.vue'
import router from './router'

const app = createApp(App)

const head = createHead()

app.component('FontAwesomeIcon', FontAwesomeIcon)
app.use(createPinia())
app.use(router)
app.use(head)

app.mount('#app')
// trigger build

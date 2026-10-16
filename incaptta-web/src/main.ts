import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { MotionPlugin } from '@vueuse/motion'
import { createHead } from '@vueuse/head'
import App from './App.vue'
import router from './router'
import './assets/main.css'

const app = createApp(App)
const head = createHead()

app.use(createPinia())
app.use(router)
app.use(MotionPlugin)
app.use(head)

app.mount('#app')

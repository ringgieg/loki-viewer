import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import zhCn from 'element-plus/dist/locale/zh-cn'

import App from './App.vue'
import router from './router'
import './styles/main.css'

import { startThemeScheduler } from './utils/theme'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'

const pinia = createPinia()
const queryClient = new QueryClient()

const app = createApp(App)

// Register all Element Plus icons
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })
app.use(VueQueryPlugin, { queryClient })

// Start scheduler after Pinia is installed (auto-refresh needs access to stores).
startThemeScheduler()
app.mount('#app')

import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/batch-sync'
  },
  {
    path: '/batch-sync',
    name: 'batch-sync'
  },
  {
    path: '/batch-sync/:taskName',
    name: 'batch-sync-task'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router

import { createRouter, createWebHistory } from 'vue-router'
import { getCurrentServiceId, getServiceType } from '../utils/config'
import VmlogMultitaskMode from '../views/vmlog/VmlogMultitaskMode.vue'
import VmalertMultitaskMode from '../views/vmalert/VmalertMultitaskMode.vue'

const logsBasePath = '/logs'
const vmalertBasePath = '/vmalert'

const routes = [
  {
    path: '/',
    redirect: () => {
      const serviceId = getCurrentServiceId()
      const serviceType = getServiceType(serviceId)

      if (serviceType === 'vmalert-multitask') {
        return `${vmalertBasePath}/${serviceId}`
      } else {
        return `${logsBasePath}/${serviceId}`
      }
    }
  },
  // vmlog routes
  {
    path: `${logsBasePath}/:serviceId`,
    name: 'service-logs',
    component: VmlogMultitaskMode,
    props: true
  },
  {
    path: `${logsBasePath}/:serviceId/:taskName`,
    name: 'service-task-logs',
    component: VmlogMultitaskMode,
    props: true
  },
  // vmalert routes
  {
    path: `${vmalertBasePath}/:serviceId`,
    name: 'service-vmalert',
    component: VmalertMultitaskMode,
    props: true
  },
  {
    path: `${vmalertBasePath}/:serviceId/:taskName`,
    name: 'service-task-vmalert',
    component: VmalertMultitaskMode,
    props: true
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router

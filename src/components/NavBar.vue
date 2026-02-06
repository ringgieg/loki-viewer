<template>
  <div class="navbar">
    <div class="navbar-left">
      <!-- Service Selector -->
      <el-dropdown
        @command="handleServiceSwitch"
        trigger="click"
        class="service-selector"
      >
        <span class="service-button">
          <el-icon><Folder /></el-icon>
          <span>{{ serviceStore.currentServiceDisplayName }}</span>
          <el-icon class="arrow-icon"><ArrowDown /></el-icon>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="service in serviceStore.services"
              :key="service.id"
              :command="service.id"
              :disabled="service.id === serviceStore.getCurrentServiceId()"
            >
              <span class="service-item">
                <span>{{ service.displayName }}</span>
                <el-icon v-if="service.type === 'external-link'" class="external-link-icon">
                  <TopRight />
                </el-icon>
              </span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <span class="app-title">{{ serviceStore.currentServiceDisplayName }}</span>

    <div class="navbar-actions">
      <!-- Right side slot for custom actions -->
      <slot name="actions"></slot>
    </div>
  </div>
</template>

<script setup>
import { useServiceStore } from '../stores/serviceStore'
import { Folder, ArrowDown, TopRight } from '@element-plus/icons-vue'
import { isExternalLinkService, getExternalUrl, getServiceType } from '../utils/config'

const serviceStore = useServiceStore()

function handleServiceSwitch(serviceId) {
  if (serviceId === serviceStore.getCurrentServiceId()) {
    return
  }

  // Check if this is an external link service
  if (isExternalLinkService(serviceId)) {
    const externalUrl = getExternalUrl(serviceId)
    if (externalUrl) {
      console.log(`[NavBar] Opening external link: ${externalUrl}`)
      window.open(externalUrl, '_blank')
    }
    return
  }

  console.log(`[NavBar] Switching to service: ${serviceId}`)

  const newServiceType = getServiceType(serviceId)

  // Navigate to new service with full page reload
  // This ensures all state is cleared and components are freshly mounted
  if (newServiceType === 'vmalert-multitask') {
    window.location.href = `/vmalert/${serviceId}`
    return
  }

  // Default to logs view for other service types.
  window.location.href = `/logs/${serviceId}`
}
</script>

<style scoped>
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  height: 64px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
}

.navbar-left {
  display: flex;
  align-items: center;
  min-width: 200px;
}

.app-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  flex: 1;
  text-align: center;
  letter-spacing: -0.025em;
}

.navbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 200px;
  justify-content: flex-end;
}

.service-selector {
  margin-right: 16px;
}

.service-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s ease;
  user-select: none;
  border: 1px solid var(--el-border-color-light);
}

.service-button:hover {
  background: var(--el-fill-color);
  border-color: var(--el-border-color);
  color: var(--el-text-color-primary);
}

.arrow-icon {
  font-size: 12px;
  margin-left: 4px;
}

.service-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.external-link-icon {
  font-size: 14px;
  color: var(--el-color-primary);
  opacity: 0.7;
}
</style>

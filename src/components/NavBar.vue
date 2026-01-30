<template>
  <div class="navbar">
    <span class="service-name">Batch-Sync</span>

    <div class="navbar-actions">
      <el-dropdown @command="handleMuteCommand" trigger="click">
        <span class="mute-button">
          <el-icon><Bell /></el-icon>
          <span v-if="alertStore.isMuted" class="mute-status">
            静默中 ({{ alertStore.getRemainingMuteMinutes() }}分钟)
          </span>
          <span v-else>静默设置</span>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="0" :disabled="!alertStore.isMuted">
              取消静默
            </el-dropdown-item>
            <el-dropdown-item divided command="15">
              静默 15 分钟
            </el-dropdown-item>
            <el-dropdown-item command="30">
              静默 30 分钟
            </el-dropdown-item>
            <el-dropdown-item command="60">
              静默 1 小时
            </el-dropdown-item>
            <el-dropdown-item command="120">
              静默 2 小时
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup>
import { useAlertStore } from '../stores/alertStore'
import { Bell } from '@element-plus/icons-vue'

const alertStore = useAlertStore()

function handleMuteCommand(minutes) {
  const min = parseInt(minutes, 10)
  alertStore.setMute(min)
}
</script>

<style scoped>
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  height: 64px;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
}

.service-name {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
  flex: 1;
  text-align: center;
  letter-spacing: -0.025em;
}

.navbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mute-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 14px;
  color: #6b7280;
  background: #ffffff;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s ease;
  user-select: none;
  border: 1px solid #e5e7eb;
}

.mute-button:hover {
  background: #f9fafb;
  border-color: #d1d5db;
  color: #111827;
}

.mute-status {
  color: #f59e0b;
  font-weight: 600;
}
</style>

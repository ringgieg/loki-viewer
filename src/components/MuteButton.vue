<template>
  <el-dropdown @command="handleMuteCommand" trigger="click" placement="bottom-end">
    <el-button :type="alertStore.isMuted ? 'warning' : 'default'" :size="size">
      <el-icon><Bell /></el-icon>
      <span>静默设置</span>
      <el-badge
        v-if="alertStore.isMuted"
        :value="alertStore.getRemainingMuteMinutes() + 'm'"
        class="mute-badge"
      />
    </el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="0" :disabled="!alertStore.isMuted">
          <el-icon><CircleClose /></el-icon>
          <span>取消静默</span>
        </el-dropdown-item>
        <el-dropdown-item divided command="15">
          <el-icon><Clock /></el-icon>
          <span>静默 15 分钟</span>
        </el-dropdown-item>
        <el-dropdown-item command="30">
          <el-icon><Clock /></el-icon>
          <span>静默 30 分钟</span>
        </el-dropdown-item>
        <el-dropdown-item command="60">
          <el-icon><Clock /></el-icon>
          <span>静默 1 小时</span>
        </el-dropdown-item>
        <el-dropdown-item command="120">
          <el-icon><Clock /></el-icon>
          <span>静默 2 小时</span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup>
import { useAlertStore } from '../stores/alertStore'
import { Bell, Clock, CircleClose } from '@element-plus/icons-vue'

// Props
const props = defineProps({
  size: {
    type: String,
    default: 'default'
  }
})

const alertStore = useAlertStore()

function handleMuteCommand(minutes) {
  const min = parseInt(minutes, 10)
  alertStore.setMute(min)
}
</script>

<style scoped>
.mute-badge {
  position: absolute;
  top: -8px;
  right: -8px;
}
</style>

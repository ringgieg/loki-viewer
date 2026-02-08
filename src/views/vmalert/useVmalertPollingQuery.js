import { computed, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useVmalertStore } from '../../stores/vmalertStore'
import { useServiceStore } from '../../stores/serviceStore'
import { getPrometheusPollingInterval } from '../../utils/config'

/**
 * Drives VMAlert polling via TanStack Vue Query.
 *
 * - Fetch work is delegated to vmalertStore.fetchAlerts()
 * - Scheduling is handled by vue-query refetchInterval
 * - vmalertStore.polling (start/stop) controls enabled state
 */
export function useVmalertPollingQuery() {
  const vmalertStore = useVmalertStore()
  const serviceStore = useServiceStore()

  const intervalMs = computed(() => getPrometheusPollingInterval())
  const serviceId = computed(() => serviceStore.getCurrentServiceId())

  const query = useQuery({
    queryKey: computed(() => ['vmalert', 'polling', serviceId.value]),
    enabled: computed(() => vmalertStore.polling && !!serviceId.value),
    refetchInterval: intervalMs,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      await vmalertStore.fetchAlerts()
      vmalertStore.markPolled()
      return true
    }
  })

  // Keep countdown aligned with successful/attempted refetches.
  watch(
    () => query.dataUpdatedAt.value,
    (ts) => {
      if (typeof ts === 'number' && ts > 0) {
        vmalertStore.markPolled(ts)
      }
    }
  )

  return query
}

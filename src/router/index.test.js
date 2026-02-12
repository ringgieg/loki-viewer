import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock config helpers used by router
vi.mock('../utils/config', () => ({
  getCurrentServiceId: vi.fn(),
  getServiceType: vi.fn(() => 'vmlog-multitask')
}))

describe('router redirect', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('redirects to /logs when no serviceId is available (avoids /logs/null)', async () => {
    const { getCurrentServiceId } = await import('../utils/config')
    getCurrentServiceId.mockReturnValue(null)

    const router = (await import('./index.js')).default
    const root = router.options.routes.find(r => r.path === '/')

    expect(root.redirect()).toBe('/logs')
  })
})

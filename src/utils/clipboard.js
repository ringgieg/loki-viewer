import ClipboardJS from 'clipboard'

export function copyWithClipboardJs(text) {
  if (typeof document === 'undefined') {
    return Promise.resolve(false)
  }

  return new Promise((resolve) => {
    const trigger = document.createElement('button')
    trigger.type = 'button'
    trigger.style.position = 'fixed'
    trigger.style.left = '-9999px'
    trigger.style.top = '-9999px'
    document.body.appendChild(trigger)

    const clipboard = new ClipboardJS(trigger, {
      text: () => String(text ?? '')
    })

    let settled = false
    const cleanup = (ok) => {
      if (settled) return
      settled = true
      clipboard.destroy()
      if (trigger.parentNode) {
        trigger.parentNode.removeChild(trigger)
      }
      resolve(ok)
    }

    clipboard.on('success', () => cleanup(true))
    clipboard.on('error', () => cleanup(false))

    trigger.click()
    setTimeout(() => cleanup(false), 300)
  })
}

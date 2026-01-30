/**
 * 播放简单的提示音
 * @param {string} type - 音效类型: 'error' | 'warning' | 'info' | 'success'
 */
export function playAlertSound(type = 'error') {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    // 根据类型设置不同的音调
    const frequencies = {
      error: [800, 600],      // 高→低（警告）
      warning: [600, 700],    // 低→高（注意）
      info: [523.25],         // 单音（C5音符）
      success: [523.25, 659.25] // 双音（C5→E5，愉快）
    }

    const freq = frequencies[type] || frequencies.error

    // 设置音量（0-1之间）
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

    // 播放音效
    if (freq.length === 1) {
      // 单音
      oscillator.frequency.setValueAtTime(freq[0], audioContext.currentTime)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.2)
    } else {
      // 双音
      oscillator.frequency.setValueAtTime(freq[0], audioContext.currentTime)
      oscillator.frequency.setValueAtTime(freq[1], audioContext.currentTime + 0.15)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.3)
    }
  } catch (error) {
    console.warn('Audio playback not supported:', error)
  }
}

/**
 * Loki Viewer Runtime Configuration
 *
 * This file can be modified after build without recompiling.
 * It will be served as a static file from the public directory.
 */
window.APP_CONFIG = {
  // Default service to monitor
  defaultService: 'Batch-Sync',

  // Available services (can be extended)
  services: ['Batch-Sync', 'Data-Service'],

  // Default log level filter (empty string = show all)
  defaultLogLevel: '',

  // Logs per page
  logsPerPage: 500,

  // Virtual scroll settings
  virtualScroll: {
    estimatedItemHeight: 60,
    bufferSize: 10,
    loadMoreThreshold: 0.2  // Load more when scrolled to 20% from bottom
  },

  // WebSocket settings
  websocket: {
    maxReconnectAttempts: 5,
    reconnectDelay: 3000
  },

  // Alert settings
  alert: {
    newLogHighlightDuration: 3000  // milliseconds
  }
}

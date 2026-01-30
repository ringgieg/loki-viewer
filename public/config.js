/**
 * Loki Viewer 运行时配置
 *
 * 此文件可在构建后修改，无需重新编译。
 * 它将作为静态文件从 public 目录提供。
 */
window.APP_CONFIG = {
  // 页面标题（浏览器标签页，可选，留空则使用默认值 "Loki Log Viewer"）
  pageTitle: '',

  // 活动服务 ID（启动时监控哪个服务）
  activeService: 'batch-sync',

  // 服务配置
  // 每个服务都有自己的完整配置
  services: [
    {
      id: 'batch-sync',
      displayName: 'Batch-Sync Service',
      loki: {
        // API 基础路径（默认值：'/loki/api/v1'）
        apiBasePath: '/loki/api/v1',
        // WebSocket 设置（可选，留空则自动检测）
        wsProtocol: '',  // 'ws' 或 'wss'，留空则自动检测
        wsHost: '',      // hostname:port，留空则使用 window.location.host
        // WebSocket 尾部日志参数
        tailLimit: 100,      // 尾部日志数量（默认值：100）
        tailDelayFor: '0',   // 尾部日志延迟（默认值：'0'）
        // API 重试设置
        maxRetries: 3,       // API 调用最大重试次数（默认值：3）
        retryBaseDelay: 1000, // 指数退避基础延迟，单位毫秒（默认值：1000）
        // 服务特定标签
        fixedLabels: {
          job: 'tasks',
          service: 'Batch-Sync'
        },
        taskLabel: 'task_name'
      },
      defaultLogLevel: '',
      logsPerPage: 500,
      // WebSocket 设置
      websocket: {
        maxReconnectAttempts: 5,
        reconnectDelay: 3000,
        initializationDelay: 2000  // 监控开始前的延迟（毫秒）
      },
      // 告警设置
      alert: {
        newLogHighlightDuration: 3000  // 新日志高亮持续时间（毫秒）
      },
      // 查询设置
      query: {
        defaultTimeRangeDays: 30  // 默认值：查询最近 7 天的日志
      }
    },
    {
      id: 'data-service',
      displayName: 'Data Service',
      loki: {
        // API 基础路径（默认值：'/loki/api/v1'）
        apiBasePath: '/loki/api/v1',
        // WebSocket 设置（可选，留空则自动检测）
        wsProtocol: '',  // 'ws' 或 'wss'，留空则自动检测
        wsHost: '',      // hostname:port，留空则使用 window.location.host
        // WebSocket 尾部日志参数
        tailLimit: 100,      // 尾部日志数量（默认值：100）
        tailDelayFor: '0',   // 尾部日志延迟（默认值：'0'）
        // API 重试设置
        maxRetries: 3,       // API 调用最大重试次数（默认值：3）
        retryBaseDelay: 1000, // 指数退避基础延迟，单位毫秒（默认值：1000）
        // 服务特定标签
        fixedLabels: {
          job: 'api',
          service: 'Data-Service'
        },
        taskLabel: 'endpoint'
      },
      defaultLogLevel: 'WARN',
      logsPerPage: 1000,
      // WebSocket 设置
      websocket: {
        maxReconnectAttempts: 5,
        reconnectDelay: 3000,
        initializationDelay: 2000  // 监控开始前的延迟（毫秒）
      },
      // 告警设置
      alert: {
        newLogHighlightDuration: 3000  // 新日志高亮持续时间（毫秒）
      },
      // 查询设置
      query: {
        defaultTimeRangeDays: 30  // 默认值：查询最近 7 天的日志
      }
    }
  ],

  // ============================================================
  // 全局配置（所有服务共享）
  // ============================================================

  // 虚拟滚动设置
  virtualScroll: {
    estimatedItemHeight: 60,
    bufferSize: 10,
    loadMoreThreshold: 0.2  // 滚动到距离底部 20% 时加载更多
  }
}

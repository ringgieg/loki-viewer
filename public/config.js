/**
 * Dashboard 运行时配置
 *
 * 此文件可在构建后修改，无需重新编译
 * 它将作为静态文件从 public 目录提供
 */
window.APP_CONFIG = {
  // ============================================================
  // 全局配置
  // ============================================================

  // 页面标题（浏览器标签页，可选）
  pageTitle: 'Grafana Stack Dashboard',

  // 活动服务 ID（启动时监控哪个服务，可选，默认：第一个服务的 ID）
  activeService: 'vmalert-dashboard',

  // 主题切换（可选）
  // 按北京时间自动切换：08:25 -> 白天模式，16:25 -> 黑夜模式
  themeSchedule: {
    mode: 'auto',
    timeZone: 'Asia/Shanghai',
    dayStart: '08:25',
    nightStart: '16:25'
  },

  // 服务配置（必需，至少配置一个服务）
  // 每个服务都有自己的完整配?
  services: [
    {
      // ========== 服务基本信息 ==========
      id: 'batch-sync',                           // 必需：服务唯一标识?
      displayName: 'Batch-Sync Service',          // 必需：服务显示名?
      type: 'vmlog-multitask',

      // ========== VMLog 连接配置 ==========
      vmlog: {
        // API 配置
        apiBasePath: '/select/logsql',
        // WebSocket host/protocol follows apiBasePath
        websocket: {
          reconnectDelay: 3000, // optional: reconnect delay (ms)
          initializationDelay: 2000 // optional: delay before alerts (ms)
        },
        api: {
          tailLimit: 100,
          tailDelayFor: '0',
          maxRetries: 3,
          retryBaseDelay: 1000
        },

        // 查询标签（必需?
        fixedLabels: {                            // 必需：固定查询标?
          job: 'tasks',
          service: 'Batch-Sync'
        },
        taskLabel: 'task_name',                    // 可选，默认值：'task_name'（任务标签字段名?
        
      },

      // ========== 日志显示配置 ==========
      defaultLogLevel: 'WARN',                    // 可选，默认值：''（默认显示的日志级别?
      logsPerPage: 500,                           // 可选，默认值：500（每页显示日志条数）


      // ========== 告警配置 ==========
      alert: {
        level: 'ERROR',                           // 可选，默认值：'ERROR'（告警级别：ERROR/WARN/INFO/DEBUG?
        alertMuteMinutes: 10,
        newLogHighlightDuration: 3000             // 可选，默认值：3000（新日志高亮持续时间，毫秒）
      },

      // ========== 查询配置 ==========
      query: {
        defaultTimeRangeDays: 30                  // 可选，默认值：7（查询时间范围，天数?
      },

      // ========== 日志级别配置 ==========
      logLevels: ['ERROR', 'WARN', 'INFO', 'DEBUG'] // 可选，有完整默认配?
    },
    {
      // ========== VMAlert 告警监控服务 ==========
      id: 'vmalert-dashboard',                    // 必需：服务唯一标识?
      displayName: 'VMAlert Dashboard',           // 必需：服务显示名?
      type: 'vmalert-multitask',               // 必需：服务类?

      // ========== 告警配置 ==========
      alert: {
        level: 'warning',                          // 可选，默认值：'ERROR'（告警级别：ERROR/WARN/INFO/DEBUG?
        alertMuteMinutes: 1
      },

      // ========== Alertmanager 配置 ==========
      alertmanager: {
        basePath: 'http://127.0.0.1:9093/api/v2', // Alertmanager API base path (optional)
        receiver: 'critical-receiver',                        // Alertmanager receiver name for global alerts
        alertMuteMinutes: 10                                // Mute duration after user dismiss (minutes)
      },

      // 轮询配置
      polling: {
        interval: 5000                          // 可选，默认值：5000（轮询间隔，毫秒?
      },

      // ========== VMAlert 连接配置 ==========
      vmalert: {
        // API 配置（使用统一告警端点）
        apiBasePath: 'http://127.0.0.1:8880/api/v1',       // 统一告警 API 地址

        // 任务标签（左侧任务列表）
        taskLabel: 'job',

        severityLevels: ['critical', 'warning'],
        severityLabel: 'severity',
        // alert: {
        //   level: 'critical'
        // },

        // 固定过滤标签（可选）
        // 例如：只显示特定环境的告警
        fixedLabels: {                            // 可选，默认值：{}
          // env: 'production'                    // 取消注释以过滤特定环?
        },

        // 监控链路配置（E2E 监控链路健康检查）
        // 配置 alertName 即为启用，不配置或留空即为禁用
        deadManSwitch: {
          alertName: 'PrometheusAlertmanagerE2eDeadManSwitch'  // 监控链路告警名称（此告警持续 firing 表示监控链路正常?
        },

        // 层级配置（右侧面板）
        // 如果为空数组 []，则显示扁平的告警列?
        // 如果配置了columns，则按层级显示（Column -> Grid）
        columns: [                                // 可选，默认值：[]
          {
            label: 'instance',                    // Column 层级->label (按实例分?
            displayNameAnnotation: null,          // 可选：如果配置了且 annotation 存在，优先显?annotation ?
            grids: {
              // Prometheus/Alertmanager conventional alert name label key
              label: 'alertname',                 // Grid 层级 label（按告警名称分组）
              displayNameAnnotation: null,
              highlightAnnotations: ['summary', 'description'],
              muteexclaudelabel: [],
              muteIncludeLabels: [],
            }
          }
        ],

      }
    },
    {
      // ========== 外部链接服务（新窗口打开）=========
      id: 'grafana-dashboard',                    // 必需：服务唯一标识
      displayName: 'Grafana 仪表盘',              // 必需：服务显示名
      type: 'external-link',                      // 必需：服务类型（external-link）
      externalUrl: 'http://127.0.0.1:3000'       // 必需：外部链URL（Grafana 默认端口 3000）
    },
    {
      // ========== 外部链接服务示例 2 ==========
      id: 'alertmanager-ui',                      // 必需：服务唯一标识
      displayName: 'Alertmanager UI',             // 必需：服务显示名
      type: 'external-link',                      // 必需：服务类型（external-link）
      externalUrl: 'http://127.0.0.1:9093'       // 必需：Alertmanager UI URL
    }
  ],

  // ============================================================
  // 全局配置（所有服务共享，均为可选）
  // ============================================================

  // 虚拟滚动设置（可选，有完整默认配置）
  virtualScroll: {
    estimatedItemHeight: 60,                      // 可选，默认值：60（预估每条日志高度，像素?
    bufferSize: 10,                               // 可选，默认值：10（缓冲区大小?
    loadMoreThreshold: 0.2                        // 可选，默认值：0.2（滚动到距离底部 20% 时加载更多）
  }
}


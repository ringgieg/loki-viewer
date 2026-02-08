# 配置指南 (Configuration Guide)

本文档说明如何通过修改 `public/config.js` 来配置 Dashboard（VMLog/VMAlert），无需重新编译应用。

## 配置文件位置

- **开发环境**: `public/config.js`
- **生产环境**: `dist/config.js` (构建后可直接修改)

## 核心概念

Dashboard 支持在一个界面中监控多个服务的日志/告警，并可以快速切换不同服务。

**主要特性**:
- 导航栏显示服务选择器，一键切换服务
- 切换服务时自动重新连接实时 tail
- 每个服务可以有独立的配置（标签、日志级别、每页条数等）
- 全局配置（API 路径、tail 设置等）对所有服务生效
- 路由格式: `/logs/:serviceId/:taskName`

**配置示例**:
```javascript
window.APP_CONFIG = {
  appTitle: '企业日志监控平台',

  // 当前激活的服务 ID（启动时显示的服务）
  activeService: 'batch-sync',

  // 服务列表
  services: [
    {
      id: 'batch-sync',
      displayName: '批量同步服务',
      type: 'vmlog-multitask',
      vmlog: {
        fixedLabels: {
          job: 'tasks',
          service: 'Batch-Sync'
        },
        taskLabel: 'task_name'
      },
      defaultLogLevel: '',
      logsPerPage: 500
    },
    {
      id: 'data-service',
      displayName: '数据服务',
      type: 'vmlog-multitask',
      vmlog: {
        fixedLabels: {
          job: 'api',
          service: 'Data-Service'
        },
        taskLabel: 'endpoint'
      },
      defaultLogLevel: 'WARN',
      logsPerPage: 1000
    }
  ],

  // 全局 VMLog API 配置（所有服务共享）
  vmlog: {
    apiBasePath: '/select/logsql',
    api: {
      tailLimit: 100,
      tailDelayFor: '0',
      maxRetries: 3,
      retryBaseDelay: 1000
    }
  }
}
```

## 重要概念说明

### appTitle vs service 的区别

- **`appTitle`**: 界面显示标题，用于导航栏显示，纯展示用途
  - 例如: "数据中台日志监控平台"、"生产环境监控"
  - 如果不配置，使用默认标题
  - 与 VMLog 查询无关

- **`vmlog.fixedLabels.service`**: VMLog 查询使用的服务标签值
  - 例如: "Batch-Sync"、"Data-Service"
  - 这是传递给 VMLog 的实际标签值，用于筛选日志
  - 必须与日志数据中的对应字段完全匹配

**示例**:
```javascript
window.APP_CONFIG = {
  appTitle: '数据中台日志监控',      // 导航栏显示: "数据中台日志监控"
  vmlog: {
    fixedLabels: {
      service: 'Batch-Sync'     // 查询: {service="Batch-Sync", ...}
    }
  }
}
```

## 配置选项

### 基础配置

#### `pageTitle` (可选)
- **类型**: `string`
- **默认值**: `''` (空字符串)
- **说明**: 浏览器标签页标题。如果为空，使用默认标题
- **示例**:
  ```javascript
  pageTitle: '数据中台日志监控'
  ```

#### `appTitle` (可选)
- **类型**: `string`
- **默认值**: 使用默认标题
- **说明**: 导航栏显示的应用标题
- **重要**: 这是独立的显示标题，与 VMLog 查询中使用的 `service` 标签值分开
- **用途**: 自定义应用在界面上的显示名称
- **示例**:
  ```javascript
  appTitle: '数据中台日志监控平台'
  ```

#### `defaultLogLevel`
- **类型**: `string`
- **默认值**: `''` (显示所有级别)
- **可选值**: `''`, `'ERROR'`, `'WARN'`, `'INFO'`, `'DEBUG'`
- **说明**: 默认日志级别过滤器
- **示例**:
  ```javascript
  defaultLogLevel: 'ERROR'  // 默认只显示 ERROR 日志
  ```

#### `logsPerPage`
- **类型**: `number`
- **默认值**: `500`
- **说明**: 每页加载的日志条数
- **建议**: 根据服务器性能调整，一般在 100-1000 之间
- **示例**:
  ```javascript
  logsPerPage: 1000
  ```

### VMLog API 配置

#### `vmlog.apiBasePath`
- **类型**: `string`
- **默认值**: `'/select/logsql'`
- **说明**: VMLog（VictoriaLogs LogsQL）查询 API 的基础路径
- **使用场景**: 当使用反向代理或非标准路径时
- **示例**:
  ```javascript
  vmlog: {
    apiBasePath: '/select/logsql'
  }
  ```

#### `vmlog.api`
- **Type**: `object`
- **Description**: VMLog API settings for tailing and retry behavior.
- **Fields**:
  - `tailDelayFor`: Tail offset window in seconds (default: `'0'`)
  - `maxRetries`: Max retries for VMLog API requests (default: `3`)
  - `retryBaseDelay`: Base delay for exponential backoff in ms (default: `1000`)

#### `vmlog.tail`
- **Type**: `object`
- **Description**: 实时 tail 的重连/刷新设置（实现为 HTTP streaming / fetch stream，不是 SSE/EventSource 也不是 WebSocket）
- **Fields**:
  - `refreshInterval`: Tail refresh interval (default: `'1s'`)
  - `reconnectDelay`: Reconnect delay in ms (default: `3000`)
  - `initializationDelay`: Delay before alerts in ms (default: `2000`)

> 兼容性说明：旧配置名 `vmlog.websocket.*` 仍可用，但建议迁移到 `vmlog.tail.*`。

#### `vmlog.fixedLabels`
- **类型**: `object`
- **默认值**: `{ job: 'tasks', service: 'Batch-Sync' }`
- **说明**: 固定的标签筛选器，会自动添加到所有查询中
- **用途**: 这些是固定的 `label="value"` 对，用于限定查询范围。**包括服务名**
- **重要**: `service` 应该在这里配置，而不是作为顶层配置项
- **使用场景**:
  - 指定要监控的服务（必需）
  - 在多租户环境中过滤特定环境
  - 限定查询范围到特定的日志源
  - 添加必需的业务标签过滤器
- **示例**:
  ```javascript
  vmlog: {
    fixedLabels: {
      job: 'tasks',
      service: 'Data-Service',
      env: 'production',
      region: 'us-east-1'
    }
  }
  // 生成的查询: {job="tasks", service="Data-Service", env="production", region="us-east-1", task_name="xxx"}
  ```

  **最小配置**:
  ```javascript
  vmlog: {
    fixedLabels: {
      service: 'Batch-Sync'  // 至少需要指定服务
    }
  }
  ```

#### `vmlog.taskLabel`
- **类型**: `string`
- **默认值**: `'task_name'`
- **说明**: 用于任务分类的**动态标签名**
- **用途**: 该标签用于获取任务列表并按任务过滤日志
- **使用场景**: 当日志使用不同的标签名来标识任务时（如 `job_name`、`task`、`job_id` 等）
- **示例**:
  ```javascript
  vmlog: {
    taskLabel: 'job_name'  // 查询将使用 job_name="xxx" 来过滤任务
  }
  ```

### 调度配置

#### `schedule` (可选)
- **类型**: `object`
- **说明**: 主题切换 + 定时自动刷新（用于缓解长时间运行的内存累积）
- **兼容性**: 旧配置 `themeSchedule` 仍可用，但建议迁移到 `schedule`
- **字段**:
  - `mode`: `'auto' | 'dark' | 'light'`
  - `timeZone`: 时区（默认：`'Asia/Shanghai'`）
  - `dayStart`: 白天开始时间（`HH:MM`）
  - `nightStart`: 夜间开始时间（`HH:MM`）
  - `autoRefresh`: `Array<string>`，到点自动刷新时间点列表（`HH:MM`）
    - **规则**: 仅当没有全局告警遮罩（`hasAlert === false`）时才会刷新
- **示例**:
  ```javascript
  schedule: {
    mode: 'auto',
    timeZone: 'Asia/Shanghai',
    dayStart: '08:25',
    nightStart: '16:25',
    autoRefresh: ['04:00', '16:30']
  }
  ```

### 服务配置

#### `activeService` (必填)
- **类型**: `string`
- **默认值**: `'batch-sync'`
- **说明**: 启动时激活的服务 ID
- **示例**:
  ```javascript
  activeService: 'data-service'
  ```

#### `services` (必填)
- **类型**: `Array<ServiceConfig>`
- **默认值**: 包含 batch-sync 和 data-service 两个服务
- **说明**: 服务配置数组，定义所有可监控的服务
- **服务配置对象**:
  - `id` (必填): 服务唯一标识
  - `displayName` (必填): 服务显示名称
  - `vmlog` (必填): 该服务的 VMLog 配置（fixedLabels, taskLabel）
  - `defaultLogLevel` (可选): 该服务的默认日志级别
  - `logsPerPage` (可选): 该服务的每页日志条数
- **示例**:
  ```javascript
  services: [
    {
      id: 'batch-sync',
      displayName: '批量同步服务',
      type: 'vmlog-multitask',
      vmlog: {
        fixedLabels: {
          job: 'tasks',
          service: 'Batch-Sync'
        },
        taskLabel: 'task_name'
      },
      defaultLogLevel: '',
      logsPerPage: 500
    },
    {
      id: 'data-service',
      displayName: '数据服务',
      type: 'vmlog-multitask',
      vmlog: {
        fixedLabels: {
          job: 'api',
          service: 'Data-Service'
        },
        taskLabel: 'endpoint'
      },
      defaultLogLevel: 'WARN',
      logsPerPage: 1000
    }
  ]
  ```

**注意**:
- `vmlog.fixedLabels` 和 `vmlog.taskLabel` 必须配置在每个服务对象中
- 全局 `vmlog` 配置（apiBasePath、api、tail）对所有服务生效
- 可以为不同服务配置不同的日志级别和每页条数
- `activeService` 必须是 `services` 数组中的某个服务的 ID

### 路由配置

#### `routing.basePath`
- **类型**: `string`
- **默认值**: `'/logs'`
- **说明**: 任务路由的基础路径
- **格式**: 应该是一个路径字符串，任务详情页面将是 `basePath/:taskName`
- **注意**: 修改后所有路由将使用新路径
- **示例**:
  ```javascript
  routing: {
    basePath: '/tasks'  // 任务页面将是 /tasks/:taskName
  }
  ```

### 虚拟滚动配置

#### `virtualScroll.estimatedItemHeight`
- **类型**: `number`
- **默认值**: `60`
- **说明**: 预估每条日志的高度 (像素)
- **建议**: 根据实际日志内容长度调整

#### `virtualScroll.bufferSize`
- **类型**: `number`
- **默认值**: `10`
- **说明**: 可视区域外缓冲的日志条数
- **建议**: 较大的值提供更流畅的滚动，但占用更多内存

#### `virtualScroll.loadMoreThreshold`
- **类型**: `number`
- **默认值**: `0.2`
- **说明**: 触发加载更多的滚动阈值 (0-1 之间的小数)
- **示例**: `0.2` 表示滚动到距离底部 20% 时加载更多

### 实时 Tail 配置

实时 tail 断开后会持续重连，直到成功建立新连接或手动关闭（实现为 HTTP streaming / fetch stream）。

#### `vmlog.tail.reconnectDelay`
- **类型**: `number`
- **默认值**: `3000`
- **说明**: 重连延迟时间 (毫秒)

#### `vmlog.tail.initializationDelay`
- **类型**: `number`
- **默认值**: `2000`
- **说明**: 初始化完成后多久开始监控新错误 (毫秒)
- **用途**: 防止页面加载时的历史错误日志触发告警
- **建议**: 根据日志量调整，日志量大时可适当增加

### 告警配置

#### `alert.newLogHighlightDuration`
- **类型**: `number`
- **默认值**: `3000`
- **说明**: 新日志高亮显示的持续时间 (毫秒)

### 查询配置

#### `query.defaultTimeRangeDays`
- **类型**: `number`
- **默认值**: `7`
- **说明**: 默认查询多少天的日志数据
- **用途**: 控制初始加载和分页加载时的时间范围
- **建议**: 根据日志量和 VMLog 性能调整
  - 日志量大时建议设置较小值（如 3-7 天）
  - 时间范围过大可能导致查询超时
- **注意**: 此配置可在全局设置，也可在每个服务中单独设置
- **示例**:
  ```javascript
  query: {
    defaultTimeRangeDays: 3  // 只查询最近 3 天的日志
  }
  ```

  **服务级别配置示例**:
  ```javascript
  services: [
    {
      id: 'batch-sync',
      displayName: '批量同步服务',
      query: {
        defaultTimeRangeDays: 14  // 该服务查询 14 天
      },
      vmlog: { ... }
    },
    {
      id: 'data-service',
      displayName: '数据服务',
      query: {
        defaultTimeRangeDays: 3   // 该服务只查询 3 天
      },
      vmlog: { ... }
    }
  ]
  ```

## 配置示例

### 示例 1: 最小配置（监控单个服务）
```javascript
window.APP_CONFIG = {
  appTitle: '批量同步监控',
  activeService: 'batch-sync',

  services: [
    {
      id: 'batch-sync',
      displayName: '批量同步服务',
      type: 'vmlog-multitask',
      vmlog: {
        fixedLabels: {
          job: 'tasks',
          service: 'Batch-Sync'
        },
        taskLabel: 'task_name'
      }
    }
  ],

  vmlog: {
    apiBasePath: '/select/logsql',
    api: {
      tailDelayFor: '0',
      maxRetries: 3,
      retryBaseDelay: 1000
    }
  }
}
```

### 示例 2: 多服务配置
```javascript
window.APP_CONFIG = {
  appTitle: '企业日志监控平台',
  activeService: 'batch-sync',

  services: [
    {
      id: 'batch-sync',
      displayName: '批量同步服务',
      type: 'vmlog-multitask',
      vmlog: {
        fixedLabels: {
          job: 'tasks',
          service: 'Batch-Sync'
        },
        taskLabel: 'task_name'
      },
      defaultLogLevel: '',
      logsPerPage: 500
    },
    {
      id: 'data-service',
      displayName: '数据服务',
      type: 'vmlog-multitask',
      vmlog: {
        fixedLabels: {
          job: 'api',
          service: 'Data-Service'
        },
        taskLabel: 'endpoint'
      },
      defaultLogLevel: 'WARN',
      logsPerPage: 1000
    }
  ],

  vmlog: {
    apiBasePath: '/select/logsql',
    api: {
      tailDelayFor: '0',
      maxRetries: 3,
      retryBaseDelay: 1000
    }
  }
}
```

### 示例 3: 使用外部 VMLog 服务器和多标签筛选
```javascript
window.APP_CONFIG = {
  appTitle: '生产环境监控',
  activeService: 'my-service',

  services: [
    {
      id: 'my-service',
      displayName: '我的服务',
      type: 'vmlog-multitask',
      vmlog: {
        // 固定的标签筛选器（包括服务名、环境、集群等）
        fixedLabels: {
          service: 'My-Service',
          env: 'production',
          cluster: 'k8s-prod-01'
        },
        taskLabel: 'job_name'
      }
    }
  ],

  vmlog: {
    apiBasePath: 'http://127.0.0.1:9428/select/logsql',
    api: {
      tailDelayFor: '0',
      maxRetries: 3,
      retryBaseDelay: 1000
    }
  }
}
// 查询示例: {service="My-Service", env="production", cluster="k8s-prod-01", job_name="xxx"}
```

### 示例 4: 完整配置
```javascript
window.APP_CONFIG = {
  pageTitle: '数据中台日志监控',  // 浏览器标签页标题
  appTitle: '数据中台监控平台',   // 导航栏显示标题

  activeService: 'batch-sync',

  services: [
    {
      id: 'batch-sync',
      displayName: '批量同步服务',
      type: 'vmlog-multitask',
      vmlog: {
        fixedLabels: {
          job: 'tasks',
          service: 'Batch-Sync'
        },
        taskLabel: 'task_name'
      },
      defaultLogLevel: '',
      logsPerPage: 500
    },
    {
      id: 'data-service',
      displayName: '数据服务',
      type: 'vmlog-multitask',
      vmlog: {
        fixedLabels: {
          job: 'api',
          service: 'Data-Service'
        },
        taskLabel: 'endpoint'
      },
      defaultLogLevel: 'WARN',
      logsPerPage: 1000
    }
  ],

  vmlog: {
    apiBasePath: '/select/logsql',
    api: {
      tailDelayFor: '0',
      maxRetries: 3,
      retryBaseDelay: 1000
    },
    tail: {
      reconnectDelay: 3000,
      initializationDelay: 2000
    }
  },

  routing: {
    basePath: '/logs'
  },

  virtualScroll: {
    estimatedItemHeight: 60,
    bufferSize: 10,
    loadMoreThreshold: 0.2
  },

  alert: {
    newLogHighlightDuration: 3000
  }
}
```

## 生产环境修改配置

1. 构建应用: `npm run build`
2. 部署到服务器
3. 直接修改 `dist/config.js` 文件
4. 刷新浏览器页面 (无需重新构建)

## 注意事项

1. **配置验证**: 应用会使用默认值处理缺失或无效的配置项
2. **类型安全**: 确保配置值的类型与文档一致
3. **路径格式**: 所有路径配置应以 `/` 开头
4. **字符串为空**: 某些选项使用空字符串 (`''`) 表示"使用默认值"或"自动检测"
5. **生产环境**: 修改配置后需要刷新页面才能生效

## 故障排查

### 配置未生效
- 检查 `config.js` 语法是否正确 (使用 JavaScript 语法检查工具)
- 确保 `window.APP_CONFIG` 对象正确定义
- 清除浏览器缓存后重试

### Tail 连接失败
- 检查 `vmlog.apiBasePath` 配置
- 确认 VMLog（VictoriaLogs）服务可访问
- 检查浏览器控制台的错误信息

### 路由不工作
- 确保 `routing.basePath` 格式正确 (以 `/` 开头，不以 `/` 结尾)
- 清除浏览器缓存
- 检查服务器路由配置是否支持 SPA

## 技术支持

如有问题，请查看:
- 浏览器开发者工具的 Console 面板
- Network 面板中的 WebSocket 连接状态
- `src/utils/config.js` 中的配置读取逻辑

> 备注：tail 为 HTTP 流式请求；Network 面板里通常表现为持续进行中的 `tail` 请求，而不是 WebSocket。

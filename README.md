# Loki Log Viewer

基于 Vue 3 + Element Plus 的 Loki 日志查看器，用于查看和分析 Batch-Sync 服务日志。

## 功能特性

### 实时日志流
- **WebSocket 实时推送**：通过 Loki `/loki/api/v1/tail` 接口实时接收新日志
- **自动重连**：WebSocket 断开后自动重连（最多 5 次）
- **连接状态显示**：实时显示连接状态（已连接/已暂停/历史模式）
- **暂停/继续**：可随时暂停或继续实时日志流

### 大量日志支持
- **虚拟滚动**：只渲染可视区域的日志，支持显示数万条日志
- **无限滚动**：滚动到底部自动加载更多历史日志
- **游标分页**：基于时间戳的分页，避免重复日志

### 任务管理
- **任务列表**：左侧显示所有任务，支持搜索过滤
- **关注管理**：右键设置任务关注状态，关注的任务高亮显示
- **错误统计**：显示每个任务 24 小时内的错误数量
- **新日志提醒**：实时显示新到达的日志数量

### 日志筛选
- **级别筛选**：按 ERROR/WARN/INFO/DEBUG 级别筛选
- **关键字搜索**：实时过滤日志内容
- **时间范围**：历史模式下可选择时间范围
- **关键字高亮**：搜索关键字在日志中高亮显示

## 快速开始

### 方式 1: Docker Compose（推荐）

使用 Docker Compose 启动完整的 Loki + Viewer 环境：

```bash
# Windows
.\start.ps1

# Linux/Mac
chmod +x start.sh && ./start.sh
```

访问 http://localhost:8080

### 方式 2: 开发模式

#### 安装依赖

```bash
cd loki-viewer
npm install
```

#### 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173

#### 构建生产版本

```bash
npm run build
```

### 方式 3: Docker 镜像

```bash
# 本地构建
docker build -t loki-viewer:latest .

# 或使用 GitHub 发布的镜像
docker pull ghcr.io/yourorg/yourrepo/loki-viewer:latest

# 运行容器
docker run -d -p 8080:80 --name loki-viewer loki-viewer:latest
```

## 使用说明

### 实时模式 vs 历史模式

| 功能 | 实时模式 | 历史模式 |
|------|----------|----------|
| 数据来源 | WebSocket 实时推送 | REST API 查询 |
| 日志更新 | 自动接收新日志 | 手动刷新 |
| 时间范围 | 不支持 | 支持 |
| 级别筛选 | 不支持 | 支持 |

### 切换模式
- 使用顶部的"实时/历史"开关切换模式
- 实时模式下显示连接状态指示灯
- 历史模式下可选择时间范围和级别筛选

### 任务列表操作
- **点击**任务查看日志
- **右键**任务打开上下文菜单
  - 设为关注/取消关注
  - 标记为已读
  - 查看日志

### 关注状态
- 关注的任务显示金色星标，正常颜色
- 未关注的任务显示灰色星标，整体灰色
- 错误数字标记也会根据关注状态变色

### 日志操作
- **回到顶部**：跳转到最新日志
- **跳到底部**：跳转到最早日志
- **清空**：清空当前日志列表
- **导出**：导出日志为 .log 文件

## 项目结构

```
loki-viewer/
├── index.html
├── package.json
├── vite.config.js
├── README.md
└── src/
    ├── main.js                 # 应用入口
    ├── App.vue                 # 根组件
    ├── api/
    │   └── loki.js             # Loki API 封装（REST + WebSocket）
    ├── components/
    │   ├── NavBar.vue          # 顶部导航栏
    │   ├── TaskList.vue        # 左侧任务列表
    │   ├── LogViewer.vue       # 右侧日志查看器
    │   └── VirtualLogList.vue  # 虚拟滚动日志列表
    ├── stores/
    │   └── taskStore.js        # Pinia 状态管理
    └── styles/
        └── main.css
```

## API 说明

### REST API

```javascript
// 查询日志（带分页）
queryLogsWithCursor(query, { limit, cursor, direction })

// 查询任务日志
queryTaskLogs(taskName, { service, level, limit, cursor })

// 获取错误数量
getErrorCount(taskName, since)

// 获取任务列表
getTaskNames()

// 获取服务列表
getServices()
```

### WebSocket API

```javascript
// 实时日志流
tailTaskLogs(taskName, {
  onLog: (logs) => {},    // 收到新日志
  onOpen: () => {},       // 连接建立
  onClose: () => {},      // 连接关闭
  onError: (err) => {}    // 连接错误
}, options)
```

## 配置

### Loki 代理（开发模式）

开发模式下，Vite 会将 `/loki` 路径代理到 `http://localhost:3100`。

如需修改 Loki 地址，编辑 `vite.config.js`：

```javascript
proxy: {
  '/loki': {
    target: 'http://your-loki-server:3100',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/loki/, '')
  }
}
```

### WebSocket 地址

WebSocket 默认连接到 `ws://localhost:3100`。如需修改，编辑 `src/api/loki.js`：

```javascript
const LOKI_WS_URL = `ws://your-loki-server:3100`
```

### 本地存储

以下数据保存在浏览器 localStorage 中：

| Key | 说明 |
|-----|------|
| `loki-viewer-watched-tasks` | 关注的任务列表 |
| `loki-viewer-last-read` | 任务最后查看时间 |
| `loki-viewer-settings` | 用户设置 |

## 技术栈

- Vue 3 + Composition API
- Element Plus 组件库
- Pinia 状态管理
- Axios HTTP 客户端
- Day.js 日期处理
- Vite 构建工具
- WebSocket 实时通信
- 虚拟滚动（自定义实现）

## 部署指南

详细的部署文档请参考 [DEPLOYMENT.md](DEPLOYMENT.md)，包括：

- Docker 部署配置
- GitHub Actions CI/CD 设置
- Nginx 反向代理配置
- 生产环境部署指南
- Kubernetes 部署示例
- 故障排查

### Docker Compose 配置说明

[docker-compose.yml](docker-compose.yml) 包含完整的服务栈：

- **loki-viewer**: 前端 + Nginx（端口 8080）
- **loki**: 日志服务器（端口 3100）
- **promtail**: 日志采集器

### Nginx 反向代理

Nginx 配置位于 [nginx.conf](nginx.conf)，实现了：

- 静态文件服务（前端资源）
- Loki API 反向代理 (`/loki/*` → Loki 服务器）
- WebSocket 支持（用于实时日志流）
- 健康检查端点 (`/health`)
- 资源缓存优化

自定义 Loki 地址：
```nginx
location /loki/ {
    proxy_pass http://your-loki-server:3100/;
}
```

### GitHub CI/CD

推送代码到 GitHub 会自动触发构建和发布：

1. 推送到 `main` 或 `develop` 分支
2. GitHub Actions 自动构建 Docker 镜像
3. 镜像推送到 GitHub Container Registry
4. 支持平台：linux/amd64

查看工作流配置：[.github/workflows/docker-build.yml](.github/workflows/docker-build.yml)

### Docker 镜像内置工具

Docker 镜像除了提供 Web 服务外，还包含了以下工具用于运维和调试：

**Python 环境**:
- Python 3 + pip
- requests 库

**网络工具**:
- curl, wget
- traceroute, ping, nslookup

**实用工具**:
- vim (文本编辑器)
- jq (JSON 处理)

验证工具安装：
```bash
docker exec loki-viewer sh /test-tools.sh
```

运行 Python 查询示例：
```bash
docker exec loki-viewer python3 /examples/query-loki.py
```

## 注意事项

1. 确保 Loki 服务正在运行（默认 http://localhost:3100）
2. 确保 Promtail 已正确配置并收集日志
3. WebSocket 需要 Loki 启用 CORS（或使用 Nginx 代理）
4. 浏览器需要支持 ES6+ 和 WebSocket
5. 生产部署时请修改 nginx.conf 中的 Loki 地址

## 性能优化

- **虚拟滚动**：只渲染可视区域 + 缓冲区的日志项
- **游标分页**：避免使用 offset，使用时间戳作为游标
- **防抖搜索**：关键字搜索使用计算属性实时过滤
- **WebSocket 重连**：指数退避重连策略
- **本地缓存**：设置和状态持久化到 localStorage

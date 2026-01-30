# Loki Viewer - 测试文档

## 测试覆盖范围

本项目使用 **Vitest** 作为测试框架，配合 **@vue/test-utils** 进行 Vue 组件测试。

### 测试统计

- **测试文件**: 5 个
- **测试用例**: 68 个
- **通过率**: 100% ✅ (68/68 通过)

## 测试文件列表

### 1. config.test.js - 配置工具测试 ✅
**位置**: `src/utils/config.test.js`
**测试数量**: 10 个
**状态**: 全部通过

测试内容：
- ✅ 返回完整配置对象
- ✅ 读取顶层配置值
- ✅ 使用点语法读取嵌套配置
- ✅ 深层嵌套配置访问
- ✅ 缺失配置的 fallback 处理
- ✅ window.APP_CONFIG 未定义时使用默认配置
- ✅ window.APP_CONFIG 优先级高于默认配置
- ✅ 处理中间键缺失
- ✅ 未提供 fallback 时返回 undefined
- ✅ 处理 null 值

### 2. loki.test.js - Loki API 测试 ✅
**位置**: `src/api/loki.test.js`
**测试数量**: 25 个
**状态**: 全部通过

**queryLogsWithCursor() 测试**:
- ✅ 使用默认参数查询日志
- ✅ 处理基于游标的向后分页
- ✅ 返回 nextCursor 和 hasMore 标志
- ✅ 429 错误时重试（指数退避）
- ✅ 达到最大重试次数后抛出错误

**getLabelValues() 测试**:
- ✅ 从 API 获取标签值
- ✅ 处理空标签值
- ✅ API 失败时抛出错误

**buildTaskQuery() 测试**:
- ✅ 构建无任务名的基础查询
- ✅ 构建包含任务名的查询
- ✅ 添加 ERROR 级别过滤
- ✅ 添加 WARN 级别过滤（包括 ERROR 和 WARN）
- ✅ 添加 INFO 级别过滤（包括 ERROR、WARN、INFO）
- ✅ 添加 DEBUG 级别过滤（包括所有级别）
- ✅ 默认使用 Batch-Sync 服务

**filterLogsByLevel() 测试**:
- ✅ 无过滤时返回所有日志
- ✅ 只过滤 ERROR
- ✅ 过滤 ERROR 和 WARN
- ✅ 过滤 ERROR、WARN 和 INFO
- ✅ DEBUG 包含所有级别
- ✅ 处理无级别日志（默认为 INFO）
- ✅ 大小写不敏感
- ✅ 未知级别返回所有日志

### 3. taskStore.test.js - Pinia Store 测试 ✅
**位置**: `src/stores/taskStore.test.js`
**测试数量**: 11 个
**状态**: 全部通过

**初始化测试**:
- ✅ 空任务和关注列表初始化

**fetchTasks() 测试**:
- ✅ 从 API 获取任务并标记关注任务
- ✅ 设置加载状态
- ✅ 优雅处理获取错误

**toggleWatched() 测试**:
- ✅ 未关注任务添加到关注列表
- ✅ 已关注任务从关注列表移除
- ✅ 持久化关注任务到 localStorage

**sortedTasks 测试**:
- ✅ 关注任务排在未关注任务前面
- ✅ 组内按字母顺序排序
- ✅ 任务变化时响应式更新

**initialize() 测试**:
- ✅ 加载关注任务并从 API 获取任务列表

**注意**: `loadWatchedTasks()` 和 `saveWatchedTasks()` 是私有函数，通过 `initialize()` 和 `toggleWatched()` 间接测试

### 4. TaskList.test.js - TaskList 组件测试 ✅
**位置**: `src/components/TaskList.test.js`
**测试数量**: 15 个
**状态**: 全部通过

测试内容：
- ✅ 正确渲染任务列表
- ✅ 在页脚显示任务总数
- ✅ 基于搜索查询过滤任务
- ✅ 过滤列表为空时显示"暂无任务"
- ✅ 高亮选中的任务
- ✅ 为未关注任务应用样式
- ✅ 为关注任务显示图标
- ✅ 点击任务时导航
- ✅ 右键显示上下文菜单
- ✅ 点击遮罩层关闭上下文菜单
- ✅ 通过上下文菜单切换关注状态
- ✅ 未关注任务显示"设为关注"
- ✅ 已关注任务显示"取消关注"
- ✅ 按 Escape 键关闭上下文菜单
- ✅ 显示加载状态

### 5. LogViewer.test.js - LogViewer 组件测试 ✅
**位置**: `src/components/LogViewer.test.js`
**测试数量**: 7 个
**状态**: 全部通过

测试内容：
- ✅ 未选择任务时显示"请选择一个任务"
- ✅ 选择任务时获取初始日志
- ✅ 选择级别过滤器时传递给 API
- ✅ 基于 WebSocket 状态显示连接状态
- ✅ 切换任务时清除日志
- ✅ 优雅处理 API 错误
- ✅ 切换任务时重置分页状态

## 运行测试

### 基本命令

```bash
# 运行所有测试
npm test

# 运行测试并生成覆盖率报告
npm run test:coverage

# 运行测试 UI（交互式）
npm run test:ui

# 运行测试一次（CI 模式）
npm run test:run
```

### 运行特定测试

```bash
# 运行单个测试文件
npm test -- src/api/loki.test.js

# 运行匹配特定模式的测试
npm test -- --grep "filterLogsByLevel"

# 监听模式
npm test -- --watch
```

## 测试配置

### vite.config.js

```javascript
export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'examples/',
        '*.config.js',
        'test-tools.sh'
      ]
    }
  }
})
```

### 依赖

- **vitest**: ^4.0.18 - 测试框架
- **@vue/test-utils**: ^2.4.6 - Vue 组件测试工具
- **happy-dom**: ^20.4.0 - DOM 环境模拟
- **@vitest/ui**: ^4.0.18 - 测试 UI

## 已知问题

### v-loading 指令警告（已解决）

Element Plus 的 `v-loading` 指令在测试环境中会产生警告，但不影响测试通过：

```
[Vue warn]: Failed to resolve directive: loading
```

**影响**: 仅控制台警告，所有测试正常通过
**解决方案**: 测试通过检查 store 的 loading 状态而非 UI 指令实现

### 大整数精度

JavaScript 的 Number 类型在处理超过 `Number.MAX_SAFE_INTEGER` (9007199254740991) 的整数时会丢失精度。

**影响**: Loki 时间戳（纳秒级）可能超过安全整数范围
**解决方案**: 测试中使用较小的时间戳值，生产代码使用 BigInt 或字符串处理

## 测试最佳实践

1. **Mock 外部依赖**: 使用 `vi.mock()` 模拟 axios、路由等外部依赖
2. **测试隔离**: 每个测试用例独立运行，使用 `beforeEach` 重置状态
3. **异步处理**: 使用 `await flushPromises()` 确保异步操作完成
4. **清理资源**: 使用 `afterEach` 清理 localStorage、定时器等资源
5. **描述性命名**: 测试用例名称清晰描述测试意图

## 持续集成

建议在 CI/CD 流程中添加测试步骤：

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:run
      - run: npm run test:coverage
```

## 未覆盖的文件

以下文件当前没有测试覆盖，可在后续需要时添加：

### 核心功能文件
- **src/stores/wsStore.js** - WebSocket 连接管理
- **src/stores/alertStore.js** - 警报状态管理
- **src/utils/audio.js** - 音频播放工具

### UI 组件
- **src/components/VirtualLogList.vue** - 虚拟滚动日志列表
- **src/components/NavBar.vue** - 导航栏组件
- **src/components/AlertOverlay.vue** - 警报覆盖层

### 其他文件
- **src/router/index.js** - 路由配置（通常不需要单元测试）
- **src/main.js** - 应用入口（通常不需要单元测试）
- **src/App.vue** - 根组件（通常不需要单元测试）

**注意**: 项目遵循"覆盖率不用高，但通过率要100%"的原则，优先保证现有测试的稳定性。

## 测试覆盖率目标

- **语句覆盖率**: > 80%
- **分支覆盖率**: > 75%
- **函数覆盖率**: > 80%
- **行覆盖率**: > 80%

## 贡献指南

添加新功能时，请确保：

1. 为新功能编写单元测试
2. 确保所有现有测试通过
3. 测试覆盖率不低于现有水平
4. 更新相关文档

---

**最后更新**: 2026-01-30
**维护者**: Claude Code

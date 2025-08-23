# Nintendo Switch 游戏爬虫

基于 Cloudflare KV 队列的智能游戏数据采集工具，实现用户驱动的数据采集闭环。

## 功能特性

- 🕷️ 自动爬取 Nintendo eShop 游戏信息
- 🗄️ 数据存储到 Cloudflare D1 数据库
- 🔄 **KV 队列管理**：智能的用户驱动数据采集
- ⚡ 支持并发爬取，提高效率
- 📊 完整的状态追踪（pending → processing → completed）
- 🤖 GitHub Actions 自动化运行
- 🧹 自动清理和错误处理

## 🚀 快速开始

### 本地运行

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd nintendo-switch-scraper
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **配置环境变量**

   复制并编辑环境变量文件：
   ```bash
   cp .env.example .env
   ```

   编辑 `.env` 文件：
   ```env
   # Cloudflare 配置
   CLOUDFLARE_API_TOKEN=your_api_token
   CLOUDFLARE_ACCOUNT_ID=your_account_id
   CLOUDFLARE_D1_DATABASE_ID=your_database_id

   # KV 配置（用于队列管理）
   CLOUDFLARE_KV_GAME_IDS_ID=your_kv_namespace_id

   # 爬虫配置
   SCRAPER_CONCURRENT=3
   SCRAPER_DELAY_MIN=2000
   SCRAPER_DELAY_MAX=5000
   SCRAPER_HEADLESS=true
   SCRAPER_BATCH_SIZE=50
   ```

4. **运行爬虫**
   ```bash
   pnpm scrape
   ```

5. **测试 KV 连接**
   ```bash
   pnpm test:kv
   ```

### GitHub Actions 自动化

1. **设置 Secrets**

   在 GitHub 仓库设置中添加以下 Secrets：
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_D1_DATABASE_ID`
   - `CLOUDFLARE_KV_GAME_IDS_ID`

2. **自动触发条件**
   - 📅 **定时运行**：每天 UTC 0点（北京时间 8点）
   - 🔧 **手动触发**：在 Actions 页面手动运行，支持参数配置

3. **手动触发选项**
   - **并发数量**：控制同时处理的游戏数量
   - **延迟设置**：控制请求间隔时间
   - **批次大小**：每次从队列读取的游戏数量

## ⚙️ 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 | 必需 |
|--------|------|--------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token | - | ✅ |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID | - | ✅ |
| `CLOUDFLARE_D1_DATABASE_ID` | D1 数据库 ID | - | ✅ |
| `CLOUDFLARE_KV_GAME_IDS_ID` | KV 游戏 ID 命名空间 ID | - | ✅ |
| `SCRAPER_CONCURRENT` | 并发数量 | 3 | ❌ |
| `SCRAPER_DELAY_MIN` | 最小延迟(ms) | 2000 | ❌ |
| `SCRAPER_DELAY_MAX` | 最大延迟(ms) | 5000 | ❌ |
| `SCRAPER_BATCH_SIZE` | KV 队列批次大小 | 50 | ❌ |
| `SCRAPER_HEADLESS` | 无头模式 | true | ❌ |

### 可用命令

| 命令 | 说明 |
|------|------|
| `pnpm scrape` | 运行 KV 队列爬虫 |
| `pnpm test:kv` | 测试 KV 队列连接和功能 |
| `pnpm validate` | 验证配置和环境 |
| `pnpm format-ids` | 格式化工具 |

## 🔄 KV 队列管理系统

### 工作原理

KV 队列管理系统实现了用户驱动的数据采集闭环：

1. **用户查询** → 用户通过 API 查询游戏记录
2. **智能检测** → API 发现数据库中缺失的游戏信息
3. **队列添加** → 自动将缺失的游戏 ID 添加到 KV 队列
4. **爬虫处理** → 爬虫从队列读取并处理游戏 ID
5. **状态更新** → 完成后更新状态并清理队列
6. **数据完善** → 用户下次查询时获得完整信息

### 队列状态流转

```
pending → 爬取成功 → 从队列移除
   ↓
 failed → 失败次数累积 → 黑名单 (3次失败后)
```

- **pending**: 等待处理的游戏 ID
- **failed**: 处理失败的游戏 ID（包含失败次数）
- **blacklisted**: 失败次数达到上限的游戏 ID（自动过期）

### KV 存储结构

```
GAME_IDS 命名空间：
├── "pending:{titleId}" → { 
│     addedAt: timestamp, 
│     source: "user_query",
│     status: "pending",
│     failureCount: 0
│   }
└── "failed:{titleId}" → { 
      addedAt: timestamp,
      source: "user_query", 
      status: "failed",
      failureCount: 3,
      lastFailedAt: timestamp,
      blacklisted: true,
      reason: "error message"
    }
```

### 队列管理功能

- **自动去重**：避免重复处理相同的游戏 ID
- **智能黑名单**：失败3次后自动加入黑名单，30天后过期
- **失败追踪**：记录失败次数和原因
- **状态管理**：简化的 pending/failed 状态管理
- **批量处理**：支持批量读取和处理

## 📊 数据库结构

爬虫会将游戏信息存储到 D1 数据库的 `games` 表中，包含以下字段：

- `title_id` - 游戏 ID（主键）
- `formal_name` - 正式名称
- `name_zh_hant` - 繁体中文名称
- `description` - 游戏描述
- `publisher_name` - 发行商
- `genre` - 游戏类型
- `release_date` - 发布日期
- `screenshots` - 截图 URL（JSON 数组）
- `platform` - 平台信息
- `rom_size` - 游戏大小
- `in_app_purchase` - 是否有内购
- 等等...

## 📊 监控和统计

### 运行报告

爬虫运行完成后会生成详细的报告，包含：

- 处理统计（成功/失败数量和比例）
- 失败的游戏 ID 列表
- 队列状态统计
- 运行时间和性能指标

报告文件保存在 `reports/` 目录下。

### GitHub Actions 输出

在 GitHub Actions 中，爬虫会自动生成运行摘要，包含：

- 📊 处理统计信息
- ❌ 失败的游戏 ID 列表
- ✅ 成功处理的游戏列表
- 📄 详细日志文件下载

### 队列统计

可以通过以下方式查看队列状态：

- **API 接口**：`GET /api/admin/queue/stats`
- **健康检查**：`GET /health`（包含队列信息）
- **爬虫日志**：运行时显示队列统计

## 🔧 故障排除

### 常见问题

1. **KV 连接失败**
   - 检查 `CLOUDFLARE_KV_GAME_IDS_ID` 是否正确
   - 确认 API Token 有 KV 读写权限

2. **队列为空**
   - 确认 API 项目正在运行并添加游戏 ID 到队列
   - 检查 KV 命名空间是否正确绑定

3. **处理卡住**
   - 爬虫会自动清理超过 1 小时的 processing 状态
   - 可以手动重启爬虫来重置状态

4. **爬取失败率高**
   - 增加延迟时间（`SCRAPER_DELAY_MIN/MAX`）
   - 减少并发数量（`SCRAPER_CONCURRENT`）
   - 检查网络连接和代理设置

### 日志分析

爬虫提供详细的日志输出：

- `🔍` 开始处理游戏
- `🔄` 状态更新信息
- `✅` 成功处理
- `❌` 处理失败
- `📊` 统计信息
- `🧹` 清理操作

## 🤝 与 API 项目集成

本爬虫项目与 `nintendo-switch-api` 项目协同工作：

1. **API 项目**负责：
   - 用户游戏记录查询
   - 智能队列管理
   - 游戏数据增强

2. **爬虫项目**负责：
   - 从 KV 队列读取待处理游戏 ID
   - 爬取游戏详细信息
   - 更新队列状态
   - 数据存储到 D1 数据库

3. **数据流向**：
   ```
   用户查询 → API 发现缺失 → 添加到 KV 队列 → 爬虫处理 → 数据入库 → 用户获得完整信息
   ```

## ⚠️ 注意事项

- 🚫 请遵守 Nintendo 的服务条款和 robots.txt
- ⏱️ 建议设置合理的延迟时间，避免过于频繁的请求
- 🔒 妥善保管 Cloudflare API 凭证
- 📊 定期检查爬取结果和错误日志
- 🔄 需要与 API 项目配合使用以实现完整闭环
- 💰 注意 Cloudflare 免费额度的使用情况

## 📄 许可证

MIT License

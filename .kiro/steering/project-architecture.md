---
inclusion: always
---

# Nintendo Switch 游戏数据系统架构

## 项目概述

这是一个基于 Cloudflare 生态系统的 Nintendo Switch 游戏数据管理系统，由两个协作项目组成，实现了从数据采集到API服务的完整数据流。

### 项目组成

1. **nintendo-switch-scraper** (当前项目)
   - **角色**：数据采集器和爬虫引擎
   - **功能**：爬取 Nintendo eShop 游戏信息，数据清洗和上传
   - **运行环境**：Node.js + GitHub Actions 自动化
   - **数据流向**：Nintendo eShop → 爬虫 → Cloudflare D1
   - **仓库**：https://github.com/MyGameOne/nintendo-switch-scraper

2. **nintendo-switch-api** (配套项目)
   - **角色**：API 服务提供者和用户接口
   - **功能**：Nintendo 账户认证、用户数据获取、游戏记录查询
   - **运行环境**：Cloudflare Workers 无服务器架构
   - **数据流向**：Nintendo API ↔ Workers ↔ Cloudflare D1 → 客户端
   - **仓库**：https://github.com/MyGameOne/nintendo-switch-api

## 技术架构

### 底层基础设施
```
Cloudflare D1 Database (SQLite)
├── 游戏元数据存储 (games 表)
├── 爬虫统计信息 (scraping_stats 表)
├── 自动备份和同步
├── 全球边缘分布
└── 数据库绑定: nintendo-games-db (ID: 2bfcb37e-394d-4ce5-8201-140273523d6b)
```

### 完整数据流架构
```
Nintendo eShop (数据源)
    ↓ (Playwright 爬取)
nintendo-switch-scraper (GitHub Actions)
    ↓ (D1 HTTP API 上传)
Cloudflare D1 Database
    ↓ (原生 D1 查询)
nintendo-switch-api (Workers)
    ↓ (REST API + OAuth2)
客户端应用 / 用户界面
    ↑ (Nintendo API 认证)
Nintendo Switch Online API
```

### 双向数据流说明
- **爬虫数据流**：eShop → Scraper → D1 (游戏元数据)
- **用户数据流**：Nintendo API → Workers → 客户端 (用户游戏记录)
- **增强数据流**：D1 → Workers (为用户记录添加中文名称等元数据)

## 项目职责分工

### nintendo-switch-scraper (数据采集层)
- **主要功能**：
  - 使用 Playwright 爬取 Nintendo eShop 游戏信息
  - 反检测机制和智能延迟控制
  - 数据清洗、格式化和验证
  - 通过 Cloudflare D1 HTTP API 批量上传数据
  - GitHub Actions 自动化调度和监控

- **核心组件**：
  - `GameScraper`: 反检测网页爬取引擎 (Playwright + 随机 UA/视口)
  - `D1Uploader`: 数据上传器 (纯 SQL，支持 INSERT/UPDATE)
  - GitHub Actions: 定时任务、CI/CD 和错误报告
  - 配置管理: 环境变量和并发控制

- **数据处理流程**：
  1. 从 `data/game-ids.json` 读取游戏 ID 列表
  2. 使用 p-limit 控制并发爬取游戏详情页面
  3. 从 NXSTORE 对象提取结构化数据
  4. 批量上传到 Cloudflare D1 数据库 (支持去重和更新)
  5. 生成运行报告和统计信息

### nintendo-switch-api (数据服务层)
- **主要功能**：
  - Nintendo OAuth2 认证流程处理
  - 用户档案和游戏记录获取
  - 游戏元数据增强 (添加中文名称、发行商信息)
  - RESTful API 接口提供
  - 高性能边缘计算和全球分发

- **核心组件**：
  - **认证处理器** (`handlers/auth.ts`): OAuth2 流程管理
  - **用户处理器** (`handlers/user.ts`): 用户信息获取
  - **游戏处理器** (`handlers/games.ts`): 游戏记录和元数据整合
  - **数据库服务** (`services/database-service.ts`): D1 数据库操作
  - **Nintendo 服务** (`services/nintendo-service.ts`): Nintendo API 集成

- **API 端点**：
  - `GET /health`: 健康检查和数据库统计
  - `POST /api/auth/url`: 生成 Nintendo OAuth URL
  - `POST /api/auth/callback`: 处理 OAuth 回调
  - `POST /api/user`: 获取用户档案信息
  - `POST /api/games`: 获取用户游戏记录 (增强版)
  - `GET /api/stats`: 获取数据库统计信息

- **核心特性**：
  - 基于 Cloudflare Workers 的无服务器架构
  - 原生 D1 数据库集成和查询优化
  - 自动 CORS 处理和性能监控
  - 全球低延迟访问和边缘计算
  - 错误处理和类型安全 (TypeScript)

## 数据库设计

### 核心表结构

#### games 表 (游戏元数据)
```sql
CREATE TABLE games (
  title_id TEXT PRIMARY KEY,           -- 游戏 ID (16位十六进制)
  formal_name TEXT,                    -- 正式名称
  name_zh_hant TEXT,                   -- 繁体中文名 (爬虫字段)
  name_zh_hans TEXT,                   -- 简体中文名 (爬虫字段)
  name_zh TEXT,                        -- 中文名称 (API 使用)
  name_en TEXT,                        -- 英文名称
  name_ja TEXT,                        -- 日文名称
  catch_copy TEXT,                     -- 宣传语 (爬虫字段)
  description TEXT,                    -- 游戏描述
  publisher_name TEXT,                 -- 发行商名称
  publisher_id INTEGER,                -- 发行商 ID (爬虫字段)
  genre TEXT,                          -- 游戏类型
  release_date TEXT,                   -- 发布日期
  hero_banner_url TEXT,                -- 主横幅图片 (爬虫字段)
  image_url TEXT,                      -- 封面图片 (API 字段)
  screenshots TEXT,                    -- 截图 URL 数组 (JSON)
  platform TEXT DEFAULT 'HAC',        -- 平台标识
  languages TEXT,                      -- 支持语言 (JSON 数组)
  player_number TEXT,                  -- 游玩人数信息 (JSON)
  play_styles TEXT,                    -- 游玩模式 (JSON 数组，爬虫字段)
  rom_size INTEGER,                    -- 游戏大小 (字节)
  rating_age INTEGER,                  -- 年龄分级
  rating_name TEXT,                    -- 分级名称
  in_app_purchase BOOLEAN DEFAULT FALSE, -- 是否含内购
  cloud_backup_type TEXT,              -- 云备份类型 (爬虫字段)
  price INTEGER,                       -- 价格 (港币分，API 字段)
  is_free BOOLEAN DEFAULT FALSE,       -- 是否免费 (API 字段)
  public_status TEXT DEFAULT 'public', -- 公开状态 (API 字段)
  region TEXT DEFAULT 'HK',            -- 数据来源地区
  data_source TEXT DEFAULT 'scraper',  -- 数据来源 (scraper/manual)
  notes TEXT,                          -- 备注信息 (爬虫字段)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### scraping_stats 表 (爬虫统计)
```sql
CREATE TABLE scraping_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,                  -- 日期 (YYYY-MM-DD)
  total_games INTEGER DEFAULT 0,      -- 总游戏数
  updated_games INTEGER DEFAULT 0,    -- 更新的游戏数
  new_games INTEGER DEFAULT 0,        -- 新增的游戏数
  success_rate REAL DEFAULT 0,        -- 成功率
  errors TEXT,                         -- 错误信息 (JSON 字符串)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 索引设计
```sql
-- 性能优化索引
CREATE INDEX idx_games_name_zh ON games(name_zh);
CREATE INDEX idx_games_publisher ON games(publisher_name);
CREATE INDEX idx_games_genre ON games(genre);
CREATE INDEX idx_games_release_date ON games(release_date);
CREATE INDEX idx_games_updated_at ON games(updated_at);
CREATE INDEX idx_games_region ON games(region);
CREATE INDEX idx_stats_date ON scraping_stats(date);
```

### 字段映射说明
- **爬虫专用字段**：`name_zh_hant`, `name_zh_hans`, `catch_copy`, `hero_banner_url`, `play_styles`, `cloud_backup_type`, `notes`
- **API 专用字段**：`name_zh`, `image_url`, `price`, `is_free`, `public_status`
- **共享字段**：`title_id`, `formal_name`, `description`, `publisher_name` 等核心信息
- **数据增强**：API 使用 `name_zh` 和 `publisher_name` 增强用户游戏记录

## 部署和运维

### nintendo-switch-scraper 部署
- **运行环境**: GitHub Actions (ubuntu-latest) + 本地开发
- **自动触发条件**:
  - 📅 **定时运行**: 每天 UTC 0点 (北京时间 8点)
  - 📝 **文件变更**: `data/game-ids.json` 文件更新时
  - 🔧 **手动触发**: GitHub Actions 页面手动运行 (支持参数配置)
- **必需环境变量**:
  - `CLOUDFLARE_API_TOKEN`: Cloudflare API 令牌
  - `CLOUDFLARE_ACCOUNT_ID`: Cloudflare 账户 ID
  - `CLOUDFLARE_D1_DATABASE_ID`: D1 数据库 ID
- **可选配置**:
  - `SCRAPER_CONCURRENT`: 并发数量 (默认: 3)
  - `SCRAPER_DELAY_MIN/MAX`: 延迟范围 (默认: 2000-5000ms)
  - `SCRAPER_HEADLESS`: 无头模式 (默认: true)
  - `SCRAPER_PARALLEL`: 并行模式 (默认: true)

### nintendo-switch-api 部署
- **运行环境**: Cloudflare Workers (全球边缘网络)
- **配置文件**: `wrangler.jsonc`
- **数据库绑定**:
  - 绑定名称: `DB`
  - 数据库名称: `nintendo-games-db`
  - 数据库 ID: `2bfcb37e-394d-4ce5-8201-140273523d6b`
- **部署命令**: `pnpm deploy` (通过 Wrangler CLI)
- **开发环境**: `pnpm dev` (本地 Workers 开发服务器)
- **监控**: Cloudflare 可观测性已启用

### 共享基础设施
- **Cloudflare D1 数据库**: `nintendo-games-db`
- **数据同步**: 爬虫写入 → API 读取
- **全球分发**: Cloudflare 边缘网络
- **成本控制**: 完全在免费额度内运行

## 开发工作流

### 添加新游戏数据
1. **编辑游戏 ID 列表**: 修改 `nintendo-switch-scraper/data/game-ids.json`
2. **触发自动爬取**: 提交到主分支或等待定时任务
3. **数据验证**: GitHub Actions 自动验证 JSON 格式
4. **并发爬取**: 使用 Playwright 批量爬取游戏信息
5. **数据上传**: 通过 D1 HTTP API 批量上传到数据库
6. **API 可用**: 数据立即在 API 端点可用

### 爬虫功能扩展
1. **修改爬取逻辑**: 编辑 `src/scraper/game-scraper.ts`
2. **更新数据模型**: 修改 `src/types.ts` 中的类型定义
3. **调整上传器**: 更新 `src/scraper/d1-uploader.ts` 的 SQL 语句
4. **本地测试**: 使用 `pnpm scrape` 本地测试
5. **部署验证**: 通过 GitHub Actions 自动部署和验证

### API 功能扩展
1. **添加新端点**: 在 `nintendo-switch-api/src/handlers/` 中创建处理器
2. **更新路由**: 修改 `src/index.ts` 中的路由逻辑
3. **数据库操作**: 使用 `DatabaseService` 进行 D1 查询
4. **类型定义**: 更新 `src/types.ts` 中的接口定义
5. **本地开发**: 使用 `pnpm dev` 启动本地 Workers 环境
6. **部署上线**: 使用 `pnpm deploy` 部署到 Cloudflare Workers
7. **全球更新**: 边缘节点自动更新 (通常几分钟内)

## 监控和维护

### 爬虫监控 (nintendo-switch-scraper)
- **运行日志**: GitHub Actions 自动生成详细日志
- **成功率统计**: 自动计算爬取成功率和失败游戏列表
- **错误报告**: 失败时自动生成 GitHub Step Summary
- **日志存档**: 运行日志自动上传为 Artifacts (保留30天)
- **数据验证**:
  - JSON 格式验证 (`pnpm validate`)
  - 游戏 ID 格式检查 (16位十六进制)
  - 重复数据检测和去重

### API 监控 (nintendo-switch-api)
- **健康检查**: `/health` 端点提供服务状态和数据库统计
- **性能指标**:
  - 响应时间追踪 (`X-Response-Time` 头)
  - 时间戳记录 (`X-Timestamp` 头)
  - Cloudflare 可观测性集成
- **错误处理**:
  - 自定义错误类 (`NintendoAPIError`, `SessionError`)
  - 全局错误捕获和日志记录
  - 优雅的错误响应格式

### 数据库监控
- **统计信息**:
  - 总游戏数量追踪
  - 中文名称覆盖率统计
  - 数据源分布 (scraper vs manual)
- **查询优化**:
  - 索引性能监控
  - 批量查询优化 (游戏增强功能)
- **连接状态**: D1 连接测试和故障检测

### 自动化维护
- **定时任务**: 每日自动爬取和数据更新
- **失败重试**: 爬虫失败时的重试机制
- **数据清理**: 定期清理过期统计数据
- **版本控制**: Git 提交触发的自动化流程

## 扩展性考虑

### 数据源扩展
- **多地区支持**: 扩展到 US, JP, EU 等其他地区的 eShop
- **多语言数据**: 支持更多语言的游戏信息采集
- **价格追踪**: 添加游戏价格历史和折扣信息
- **评分集成**: 整合 Metacritic、用户评分等第三方数据

### 架构扩展
- **分布式爬取**:
  - 使用 Cloudflare Workers Cron Triggers
  - 多个 GitHub Actions 并行执行
  - 任务队列和负载均衡
- **缓存层**:
  - Cloudflare KV 存储热点数据
  - Redis 兼容缓存 (Upstash)
  - CDN 缓存策略优化
- **实时更新**:
  - WebSocket 连接 (Cloudflare Durable Objects)
  - Server-Sent Events 推送
  - Webhook 通知机制

### 功能扩展
- **用户系统**:
  - 游戏收藏和愿望单
  - 个性化推荐算法
  - 社交功能和评论系统
- **数据分析**:
  - 游戏趋势分析
  - 发行商统计
  - 用户行为分析
- **管理界面**:
  - 基于 Cloudflare Pages 的管理后台
  - 游戏 ID 管理和批量操作
  - 爬虫状态监控和控制

### 技术栈扩展
- **前端应用**: React/Vue + Cloudflare Pages
- **移动应用**: React Native 或 Flutter
- **数据处理**: Cloudflare Workers + D1 Analytics
- **机器学习**: Cloudflare AI 集成推荐系统

## 安全性

### 认证和授权
- **API 令牌管理**:
  - Cloudflare API Token 存储在 GitHub Secrets
  - 最小权限原则 (仅 D1 数据库访问)
  - 定期轮换和审计
- **Nintendo OAuth2**:
  - 标准 OAuth2 流程实现
  - Session 状态管理和验证
  - PKCE (Proof Key for Code Exchange) 支持

### 数据保护
- **传输安全**:
  - 全程 HTTPS 加密
  - TLS 1.3 最新协议
  - Cloudflare 边缘加密
- **存储安全**:
  - D1 数据库访问控制
  - 敏感数据脱敏处理
  - 自动备份和恢复

### 爬虫合规
- **服务条款遵守**:
  - 遵守 Nintendo eShop 服务条款
  - 合理的请求频率 (2-5秒延迟)
  - 非商业用途声明
- **反检测机制**:
  - 随机 User-Agent 轮换
  - 动态视口大小
  - 真实浏览器行为模拟
  - IP 地址分散 (GitHub Actions 随机 IP)
- **错误处理**:
  - 优雅降级和重试机制
  - 429 状态码处理
  - 自动暂停和恢复

### API 安全
- **CORS 配置**:
  - 适当的跨域资源共享设置
  - 预检请求处理
  - 安全头设置
- **输入验证**:
  - 请求参数验证和清理
  - JSON 格式验证
  - SQL 注入防护 (参数化查询)
- **访问控制**:
  - 请求频率限制 (Cloudflare Rate Limiting)
  - DDoS 防护
  - 恶意请求检测

## 成本优化

### Cloudflare 免费额度利用
- **Workers**: 100,000 请求/天 (当前使用 < 1%)
- **D1 数据库**:
  - 5GB 存储空间 (当前使用 < 100MB)
  - 25M 行读取/月 (当前使用 < 1M)
  - 100K 行写入/天 (爬虫使用 < 100)
- **Pages**: 无限静态托管 (未来管理界面)
- **CDN**: 全球边缘缓存和 DDoS 防护
- **Analytics**: 免费监控和分析

### GitHub Actions 优化
- **运行时间**: 每月 2000 分钟免费额度
- **存储**: Actions 缓存和 Artifacts 存储
- **并发控制**: 避免不必要的并行任务
- **缓存策略**: pnpm 依赖缓存复用

### 资源使用优化
- **智能缓存**:
  - D1 查询结果缓存
  - 静态资源 CDN 缓存
  - 浏览器缓存策略
- **数据压缩**:
  - JSON 响应 gzip 压缩
  - 图片 URL 优化
  - 批量查询减少请求次数
- **按需加载**:
  - 分页查询大数据集
  - 懒加载非关键数据
  - 条件查询优化
- **定期清理**:
  - 过期统计数据清理
  - 无效游戏 ID 移除
  - 日志文件轮转

### 成本监控
- **使用量追踪**:
  - Cloudflare Dashboard 监控
  - GitHub Actions 使用统计
  - 自动化成本报告
- **预算控制**:
  - 免费额度预警
  - 使用量趋势分析
  - 成本优化建议

### 总成本评估
- **当前成本**: $0/月 (完全在免费额度内)
- **预期增长**: 即使 10x 增长仍在免费额度内
- **付费阈值**: 需要达到 100万+ 请求/天才需要付费
- **ROI**: 零成本运行，高价值数据服务

## 总结

这个架构设计充分利用了 Cloudflare 生态系统的优势，实现了：

✅ **高性能**: 全球边缘网络，低延迟响应
✅ **低成本**: 完全免费运行，零运维成本
✅ **高可用**: 99.9%+ 可用性保证
✅ **可扩展**: 支持未来功能和流量增长
✅ **安全性**: 企业级安全防护
✅ **易维护**: 自动化部署和监控

通过 **nintendo-switch-scraper** 和 **nintendo-switch-api** 的协作，构建了一个完整的 Nintendo Switch 游戏数据生态系统，为开发者和用户提供了丰富的游戏信息和便捷的 API 服务。

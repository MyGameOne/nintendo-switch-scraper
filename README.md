# Nintendo Switch 游戏数据库管理系统

一个用于管理 Nintendo Switch 游戏数据的完整系统，支持网页爬虫自动获取游戏信息和手动管理。

## 功能特性

- 🎮 游戏数据管理（增删改查）
- 🕷️ 自动爬虫获取游戏信息
- 🌐 Web 管理界面
- 💾 Cloudflare D1 数据库存储
- 🔍 游戏搜索功能

## 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
复制 `.env` 文件并填入你的 Cloudflare 配置：
```bash
CLOUDFLARE_API_TOKEN=your_api_token
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_D1_DATABASE_ID=your_database_id
```

### 3. 初始化数据库
```bash
npm run init-db
```

### 4. 测试数据库连接
```bash
npm run test-db
```

### 5. 启动开发服务器
```bash
npm run dev
```

### 6. 访问 Web 界面
```
http://localhost:3000
```

## 可用脚本

- `npm run dev` - 启动开发服务器
- `npm run build` - 构建项目
- `npm run start` - 启动生产服务器
- `npm run scrape` - 运行爬虫
- `npm run init-db` - 初始化数据库
- `npm run test-db` - 测试数据库连接
- `npm run db:generate` - 生成数据库迁移文件
- `npm run db:push` - 推送 schema 变更到数据库

## 数据库管理

使用 Drizzle Kit 管理数据库：

```bash
# 生成迁移文件
npm run db:generate

# 推送 schema 变更（开发环境）
npm run db:push

# 应用迁移（生产环境）
npm run db:migrate
```

# Nintendo Switch 游戏爬虫

自动爬取 Nintendo Switch 游戏信息并上传到 Cloudflare D1 数据库的工具。

## 功能特性

- 🕷️ 自动爬取 Nintendo eShop 游戏信息
- 🗄️ 数据存储到 Cloudflare D1 数据库
- ⚡ 支持并发爬取，提高效率
- 🔄 自动去重和更新机制
- 🤖 GitHub Actions 自动化运行
- 📅 支持定时任务和文件变更触发

## 快速开始

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
   
   创建 `.env` 文件：
   ```env
   CLOUDFLARE_API_TOKEN=your_api_token
   CLOUDFLARE_ACCOUNT_ID=your_account_id
   CLOUDFLARE_D1_DATABASE_ID=your_database_id
   
   # 可选配置
   SCRAPER_CONCURRENT=3
   SCRAPER_DELAY_MIN=2000
   SCRAPER_DELAY_MAX=5000
   SCRAPER_HEADLESS=true
   SCRAPER_PARALLEL=true
   ```

4. **准备游戏 ID 列表**
   
   编辑 `data/game-ids.json` 文件，添加要爬取的游戏 ID：
   ```json
   [
     "0100000000010000",
     "01007ef00011e000",
     "0100f2c0115b6000"
   ]
   ```

5. **运行爬虫**
   ```bash
   pnpm scrape
   ```

### GitHub Actions 自动化

1. **设置 Secrets**
   
   在 GitHub 仓库设置中添加以下 Secrets：
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_D1_DATABASE_ID`

2. **自动触发条件**
   - 📅 **定时运行**：每天 UTC 0点（北京时间 8点）
   - 📝 **文件变更**：当 `data/game-ids.json` 文件更新时
   - 🔧 **手动触发**：在 Actions 页面手动运行

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token | 必填 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID | 必填 |
| `CLOUDFLARE_D1_DATABASE_ID` | D1 数据库 ID | 必填 |
| `SCRAPER_CONCURRENT` | 并发数量 | 3 |
| `SCRAPER_DELAY_MIN` | 最小延迟(ms) | 2000 |
| `SCRAPER_DELAY_MAX` | 最大延迟(ms) | 5000 |
| `SCRAPER_HEADLESS` | 无头模式 | true |
| `SCRAPER_PARALLEL` | 并行模式 | true |

### 游戏 ID 格式

游戏 ID 是 16 位十六进制字符串，可以从 Nintendo eShop URL 中获取：
```
https://ec.nintendo.com/apps/0100000000010000/HK
                              ^^^^^^^^^^^^^^^^
                              这就是游戏 ID
```

## 数据库结构

爬虫会将游戏信息存储到 D1 数据库的 `games` 表中，包含以下字段：

- `title_id` - 游戏 ID（主键）
- `formal_name` - 正式名称
- `name_zh_hant` - 繁体中文名称
- `name_zh_hans` - 简体中文名称
- `name_en` - 英文名称
- `name_ja` - 日文名称
- `description` - 游戏描述
- `publisher_name` - 发行商
- `genre` - 游戏类型
- `release_date` - 发布日期
- `screenshots` - 截图 URL（JSON 数组）
- `platform` - 平台信息
- `rom_size` - 游戏大小
- `in_app_purchase` - 是否有内购
- 等等...

## 注意事项

- 🚫 请遵守 Nintendo 的服务条款和 robots.txt
- ⏱️ 建议设置合理的延迟时间，避免过于频繁的请求
- 🔒 妥善保管 Cloudflare API 凭证
- 📊 定期检查爬取结果和错误日志

## 许可证

MIT License
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { ScraperService } from '../src/services/scraper-service';
import { GameService } from '../src/services/game-service';
import { D1Uploader } from '../src/scraper/d1-uploader';

// 加载环境变量
dotenv.config();

async function main() {
  console.log('🚀 Nintendo Switch 爬虫启动...\n');
  
  // 验证环境变量
  const requiredEnvs = [
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ACCOUNT_ID', 
    'CLOUDFLARE_D1_DATABASE_ID'
  ];
  
  const missing = requiredEnvs.filter(env => !process.env[env]);
  if (missing.length > 0) {
    console.error('❌ 缺少环境变量:', missing.join(', '));
    console.error('请检查 .env 文件配置');
    process.exit(1);
  }

  // 读取游戏 ID 列表
  const gameIdsPath = path.join(process.cwd(), 'data/game-ids.json');
  if (!fs.existsSync(gameIdsPath)) {
    console.error('❌ 游戏 ID 文件不存在:', gameIdsPath);
    console.error('请创建 data/game-ids.json 文件');
    process.exit(1);
  }

  let gameIds: string[];
  try {
    gameIds = JSON.parse(fs.readFileSync(gameIdsPath, 'utf8'));
  } catch (error) {
    console.error('❌ 解析游戏 ID 文件失败:', error);
    process.exit(1);
  }

  if (!Array.isArray(gameIds) || gameIds.length === 0) {
    console.log('✅ 没有游戏 ID 需要处理');
    return;
  }

  console.log(`📋 找到 ${gameIds.length} 个游戏 ID 需要处理`);
  console.log(`🔧 配置信息:`);
  console.log(`   并发数: ${process.env.SCRAPER_CONCURRENT || 3}`);
  console.log(`   延迟范围: ${process.env.SCRAPER_DELAY_MIN || 2000}-${process.env.SCRAPER_DELAY_MAX || 5000}ms`);
  console.log(`   无头模式: ${process.env.SCRAPER_HEADLESS !== 'false'}`);
  console.log(`   并行模式: ${process.env.SCRAPER_PARALLEL !== 'false'}`);
  console.log('');

  // 初始化服务
  const d1Uploader = new D1Uploader({
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN!,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID!,
    CLOUDFLARE_D1_DATABASE_ID: process.env.CLOUDFLARE_D1_DATABASE_ID!
  });

  // 测试数据库连接
  const isConnected = await d1Uploader.testConnection();
  if (!isConnected) {
    console.error('❌ 数据库连接失败');
    process.exit(1);
  }

  // 创建 GameService（使用 D1Uploader 的数据库连接）
  const gameService = new GameService(d1Uploader.getDbConnection());
  const scraperService = new ScraperService(gameService);

  try {
    // 初始化爬虫
    await scraperService.initialize();

    // 批量爬取并保存游戏
    const useParallel = process.env.SCRAPER_PARALLEL !== 'false';
    const concurrency = parseInt(process.env.SCRAPER_CONCURRENT || '3');
    
    const result = useParallel 
      ? await scraperService.parallelScrapeAndSave(gameIds, concurrency)
      : await scraperService.batchScrapeAndSave(gameIds);

    console.log('🎉 所有任务完成！');
    console.log(`📊 最终统计: 成功 ${result.success}, 失败 ${result.failed}`);

  } catch (error) {
    console.error('❌ 爬虫执行过程中出错:', error);
    process.exit(1);
  } finally {
    await scraperService.destroy();
  }
}

// 错误处理
process.on('uncaughtException', async (error) => {
  console.error('❌ 未捕获的异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  console.error('❌ 未处理的 Promise 拒绝:', reason);
  process.exit(1);
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n🔄 收到中断信号，正在优雅关闭...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 收到终止信号，正在优雅关闭...');
  process.exit(0);
});

main().catch(console.error);

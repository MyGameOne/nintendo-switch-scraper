import { GameScraper } from '../scraper/game-scraper';
import { GameService } from './game-service';
import type { ScrapedGameInfo } from '../types';
import type { NewGame } from '../db/schema';
import pLimit from 'p-limit';

export class ScraperService {
  private scraper: GameScraper;
  private gameService: GameService;

  constructor(gameService: GameService) {
    this.scraper = new GameScraper();
    this.gameService = gameService;
  }

  async initialize() {
    await this.scraper.initialize();
  }

  async destroy() {
    await this.scraper.destroy();
  }

  /**
   * 爬取单个游戏并保存到数据库
   */
  async scrapeAndSaveGame(titleId: string): Promise<boolean> {
    try {
      console.log(`🎯 开始爬取游戏: ${titleId}`);
      
      const scrapedGame = await this.scraper.scrapeGame(titleId);
      if (!scrapedGame) {
        console.error(`❌ 爬取游戏 ${titleId} 失败`);
        return false;
      }

      // 转换为数据库格式
      const gameData = this.convertScrapedToNewGame(scrapedGame);
      
      // 检查是否已存在
      const existingGame = await this.gameService.getGameById(titleId);
      
      if (existingGame) {
        // 更新现有游戏
        await this.gameService.updateGame(titleId, gameData);
        console.log(`✅ 更新游戏: ${scrapedGame.name_zh_hant || scrapedGame.formal_name}`);
      } else {
        // 创建新游戏
        await this.gameService.createGame(gameData);
        console.log(`✅ 新增游戏: ${scrapedGame.name_zh_hant || scrapedGame.formal_name}`);
      }

      return true;
    } catch (error) {
      console.error(`❌ 处理游戏 ${titleId} 失败:`, error);
      return false;
    }
  }

  /**
   * 批量爬取游戏（串行）
   */
  async batchScrapeAndSave(titleIds: string[]): Promise<{ success: number; failed: number }> {
    console.log(`🚀 开始批量爬取 ${titleIds.length} 个游戏（串行模式）`);

    let success = 0;
    let failed = 0;

    for (const titleId of titleIds) {
      const result = await this.scrapeAndSaveGame(titleId);
      if (result) {
        success++;
      } else {
        failed++;
      }

      // 添加延迟避免被封
      await this.delay();
    }

    console.log(`\n📊 批量爬取完成:`);
    console.log(`   成功: ${success}`);
    console.log(`   失败: ${failed}`);
    console.log(`   成功率: ${((success / titleIds.length) * 100).toFixed(1)}%\n`);

    return { success, failed };
  }

  /**
   * 并行批量爬取游戏（使用 p-limit）
   */
  async parallelScrapeAndSave(titleIds: string[], concurrency: number = 3): Promise<{ success: number; failed: number }> {
    console.log(`🚀 开始并行爬取 ${titleIds.length} 个游戏（并发数: ${concurrency}）`);

    let success = 0;
    let failed = 0;
    let processed = 0;

    // 创建并发限制器
    const limit = pLimit(concurrency);

    // 创建所有任务
    const tasks = titleIds.map((titleId, index) => 
      limit(async () => {
        // 添加随机延迟，避免同时启动
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
        }

        const result = await this.scrapeAndSaveGameWithoutDelay(titleId);
        processed++;
        
        console.log(`📊 进度: ${processed}/${titleIds.length} (${((processed / titleIds.length) * 100).toFixed(1)}%)`);
        
        if (result) {
          success++;
        } else {
          failed++;
        }

        return result;
      })
    );

    // 等待所有任务完成
    await Promise.all(tasks);

    console.log(`\n📊 并行爬取完成:`);
    console.log(`   成功: ${success}`);
    console.log(`   失败: ${failed}`);
    console.log(`   成功率: ${((success / titleIds.length) * 100).toFixed(1)}%\n`);

    return { success, failed };
  }

  /**
   * 爬取单个游戏并保存到数据库（无延迟版本，用于并发）
   */
  private async scrapeAndSaveGameWithoutDelay(titleId: string): Promise<boolean> {
    try {
      console.log(`🎯 开始爬取游戏: ${titleId}`);
      
      const scrapedGame = await this.scraper.scrapeGame(titleId);
      if (!scrapedGame) {
        console.error(`❌ 爬取游戏 ${titleId} 失败`);
        return false;
      }

      // 转换为数据库格式
      const gameData = this.convertScrapedToNewGame(scrapedGame);
      
      // 检查是否已存在
      const existingGame = await this.gameService.getGameById(titleId);
      
      if (existingGame) {
        // 更新现有游戏
        await this.gameService.updateGame(titleId, gameData);
        console.log(`✅ 更新游戏: ${scrapedGame.name_zh_hant || scrapedGame.formal_name}`);
      } else {
        // 创建新游戏
        await this.gameService.createGame(gameData);
        console.log(`✅ 新增游戏: ${scrapedGame.name_zh_hant || scrapedGame.formal_name}`);
      }

      return true;
    } catch (error) {
      console.error(`❌ 处理游戏 ${titleId} 失败:`, error);
      return false;
    }
  }

  /**
   * 转换爬取的游戏信息为数据库格式
   */
  private convertScrapedToNewGame(scraped: ScrapedGameInfo): NewGame {
    return {
      titleId: scraped.titleId,
      formalName: scraped.formal_name || null,
      nameZhHant: scraped.name_zh_hant || null,
      nameZhHans: scraped.name_zh_hans || null,
      nameEn: scraped.name_en || null,
      nameJa: scraped.name_ja || null,
      catchCopy: scraped.catch_copy || null,
      description: scraped.description || null,
      publisherName: scraped.publisher_name || null,
      publisherId: scraped.publisher_id || null,
      genre: scraped.genre || null,
      releaseDate: scraped.release_date || null,
      heroBannerUrl: scraped.hero_banner_url || null,
      screenshots: scraped.screenshots ? JSON.stringify(scraped.screenshots) : null,
      platform: scraped.platform || 'HAC',
      languages: scraped.languages ? JSON.stringify(scraped.languages) : null,
      playerNumber: scraped.player_number ? JSON.stringify(scraped.player_number) : null,
      playStyles: scraped.play_styles ? JSON.stringify(scraped.play_styles) : null,
      romSize: scraped.rom_size || null,
      ratingAge: scraped.rating_age || null,
      ratingName: scraped.rating_name || null,
      inAppPurchase: scraped.in_app_purchase || false,
      cloudBackupType: scraped.cloud_backup_type || null,
      region: scraped.region || 'HK',
      dataSource: scraped.data_source || 'scraper',
      notes: scraped.notes || null
    };
  }

  /**
   * 随机延迟
   */
  private async delay(): Promise<void> {
    const min = parseInt(process.env.SCRAPER_DELAY_MIN || '2000');
    const max = parseInt(process.env.SCRAPER_DELAY_MAX || '5000');
    const delay = Math.random() * (max - min) + min;
    console.log(`⏳ 延迟 ${Math.round(delay)}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
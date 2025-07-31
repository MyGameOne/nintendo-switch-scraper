import { drizzle } from 'drizzle-orm/d1';
import type { ScrapedGameInfo, CloudflareEnv } from '../types';
import { games, type NewGame } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { DbConnection } from '../db/connection';

export class D1Uploader {
  private apiToken: string;
  private accountId: string;
  private databaseId: string;
  private db: DbConnection;

  constructor(env: CloudflareEnv) {
    this.apiToken = env.CLOUDFLARE_API_TOKEN;
    this.accountId = env.CLOUDFLARE_ACCOUNT_ID;
    this.databaseId = env.CLOUDFLARE_D1_DATABASE_ID;
    
    // 创建 D1 HTTP 客户端用于 Drizzle
    this.db = drizzle(this.createD1HttpClient(), { schema: { games } }) as DbConnection;
  }

  /**
   * 获取数据库连接实例
   */
  getDbConnection(): DbConnection {
    return this.db;
  }

  private createD1HttpClient() {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/d1/database/${this.databaseId}/query`;
    
    return {
      prepare: (query: string) => {
        const stmt = {
          bind: (...values: any[]) => {
            return {
              first: async () => {
                const response = await this.executeQuery(url, query, values);
                return response.result?.[0]?.results?.[0] || null;
              },
              all: async () => {
                const response = await this.executeQuery(url, query, values);
                return response.result?.[0]?.results || [];
              },
              run: async () => {
                const response = await this.executeQuery(url, query, values);
                return {
                  success: response.success,
                  meta: response.result?.[0]?.meta || {},
                  changes: response.result?.[0]?.meta?.changes || 0,
                  last_row_id: response.result?.[0]?.meta?.last_row_id || 0,
                  duration: response.result?.[0]?.meta?.duration || 0
                };
              },
              get: async () => {
                const response = await this.executeQuery(url, query, values);
                return response.result?.[0]?.results?.[0] || null;
              },
              raw: async () => {
                const response = await this.executeQuery(url, query, values);
                return response.result?.[0]?.results || [];
              }
            };
          },
          // 添加直接调用方法（无参数绑定）
          first: async () => {
            const response = await this.executeQuery(url, query, []);
            return response.result?.[0]?.results?.[0] || null;
          },
          all: async () => {
            const response = await this.executeQuery(url, query, []);
            return response.result?.[0]?.results || [];
          },
          run: async () => {
            const response = await this.executeQuery(url, query, []);
            return {
              success: response.success,
              meta: response.result?.[0]?.meta || {},
              changes: response.result?.[0]?.meta?.changes || 0,
              last_row_id: response.result?.[0]?.meta?.last_row_id || 0,
              duration: response.result?.[0]?.meta?.duration || 0
            };
          },
          get: async () => {
            const response = await this.executeQuery(url, query, []);
            return response.result?.[0]?.results?.[0] || null;
          },
          raw: async () => {
            const response = await this.executeQuery(url, query, []);
            return response.result?.[0]?.results || [];
          }
        };
        return stmt;
      }
    } as any;
  }

  private async executeQuery(url: string, sql: string, params: any[] = []) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql,
        params
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`D1 API Error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(`D1 操作失败: ${JSON.stringify(result.errors)}`);
    }

    return result;
  }

  async uploadGames(gamesList: ScrapedGameInfo[]): Promise<void> {
    if (gamesList.length === 0) {
      console.log('📤 没有游戏需要上传');
      return;
    }

    console.log(`📤 开始上传 ${gamesList.length} 个游戏到 Cloudflare D1...`);

    let totalUploaded = 0;
    
    for (const game of gamesList) {
      try {
        await this.uploadSingleGame(game);
        totalUploaded++;
        console.log(`✅ 已上传: ${game.name_zh_hant || game.formal_name} (${totalUploaded}/${gamesList.length})`);
      } catch (error) {
        console.error(`❌ 上传游戏 ${game.titleId} 失败:`, error);
      }
    }

    console.log(`🎉 上传完成！成功上传 ${totalUploaded}/${gamesList.length} 个游戏`);
  }

  private async uploadSingleGame(game: ScrapedGameInfo): Promise<void> {
    // 转换 ScrapedGameInfo 到 NewGame 格式
    const gameData: NewGame = {
      titleId: game.titleId,
      formalName: game.formal_name || null,
      nameZhHant: game.name_zh_hant || null,
      nameZhHans: game.name_zh_hans || null,
      nameEn: game.name_en || null,
      nameJa: game.name_ja || null,
      catchCopy: game.catch_copy || null,
      description: game.description || null,
      publisherName: game.publisher_name || null,
      publisherId: game.publisher_id || null,
      genre: game.genre || null,
      releaseDate: game.release_date || null,
      heroBannerUrl: game.hero_banner_url || null,
      screenshots: game.screenshots ? JSON.stringify(game.screenshots) : null,
      platform: game.platform || 'HAC',
      languages: game.languages ? JSON.stringify(game.languages) : null,
      playerNumber: game.player_number ? JSON.stringify(game.player_number) : null,
      playStyles: game.play_styles ? JSON.stringify(game.play_styles) : null,
      romSize: game.rom_size || null,
      ratingAge: game.rating_age || null,
      ratingName: game.rating_name || null,
      inAppPurchase: game.in_app_purchase || false,
      cloudBackupType: game.cloud_backup_type || null,
      region: game.region || 'HK',
      dataSource: game.data_source || 'scraper',
      notes: game.notes || null,
      updatedAt: new Date().toISOString()
    };

    // 检查游戏是否已存在
    const existingGame = await this.db
      .select()
      .from(games)
      .where(eq(games.titleId, game.titleId))
      .get();

    if (existingGame) {
      // 更新现有游戏
      await this.db
        .update(games)
        .set(gameData)
        .where(eq(games.titleId, game.titleId))
        .run();
    } else {
      // 插入新游戏
      await this.db
        .insert(games)
        .values({
          ...gameData,
          createdAt: new Date().toISOString()
        })
        .run();
    }
  }

  /**
   * 测试数据库连接
   */
  async testConnection(): Promise<boolean> {
    try {
      // 使用 Drizzle ORM 查询游戏数量
      const result = await this.db
        .select()
        .from(games)
        .all();
      
      const count = result.length;
      console.log(`✅ Drizzle ORM D1 连接成功，当前游戏数量: ${count}`);
      return true;
    } catch (error) {
      console.error('❌ D1 连接测试异常:', error);
      
      // 如果 Drizzle 查询失败，回退到原生 SQL
      try {
        const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/d1/database/${this.databaseId}/query`;
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sql: 'SELECT COUNT(*) as count FROM games'
          })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            const count = result.result[0]?.results[0]?.count || 0;
            console.log(`✅ D1 连接成功（回退模式），当前游戏数量: ${count}`);
            return true;
          }
        }
      } catch (fallbackError) {
        console.error('❌ 回退查询也失败:', fallbackError);
      }
      
      return false;
    }
  }

  /**
   * 获取游戏统计信息
   */
  async getStats() {
    try {
      // 使用 Drizzle ORM 查询统计信息
      const allGames = await this.db.select().from(games).all();
      
      const total = allGames.length;
      const scraped = allGames.filter((game: any) => game.dataSource === 'scraper').length;
      const manual = allGames.filter((game: any) => game.dataSource === 'manual').length;

      return { total, scraped, manual };
    } catch (error) {
      console.error('❌ 获取统计信息失败:', error);
      
      // 如果 Drizzle 查询失败，回退到原生 SQL
      try {
        const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/d1/database/${this.databaseId}/query`;
        
        const queries = [
          'SELECT COUNT(*) as count FROM games',
          'SELECT COUNT(*) as count FROM games WHERE data_source = "scraper"',
          'SELECT COUNT(*) as count FROM games WHERE data_source = "manual"'
        ];

        const results = await Promise.all(queries.map(async (sql) => {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sql })
          });
          
          if (response.ok) {
            const result = await response.json();
            return result.result[0]?.results[0]?.count || 0;
          }
          return 0;
        }));

        return {
          total: results[0],
          scraped: results[1],
          manual: results[2]
        };
      } catch (fallbackError) {
        console.error('❌ 回退查询也失败:', fallbackError);
        return { total: 0, scraped: 0, manual: 0 };
      }
    }
  }
}
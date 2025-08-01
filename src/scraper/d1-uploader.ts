import type { ScrapedGameInfo, CloudflareEnv } from '../types';

export class D1Uploader {
  private apiToken: string;
  private accountId: string;
  private databaseId: string;

  constructor(env: CloudflareEnv) {
    this.apiToken = env.CLOUDFLARE_API_TOKEN;
    this.accountId = env.CLOUDFLARE_ACCOUNT_ID;
    this.databaseId = env.CLOUDFLARE_D1_DATABASE_ID;
  }

  private async executeD1Query(sql: string, params: any[] = []) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/d1/database/${this.databaseId}/query`;

    try {
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

      const result = await response.json() as any;

      if (!result.success) {
        throw new Error(`D1 操作失败: ${JSON.stringify(result.errors)}`);
      }

      // 返回第一个查询结果
      const queryResult = result.result?.[0] || {};
      return {
        success: result.success,
        results: queryResult.results || [],
        meta: queryResult.meta || {}
      };
    } catch (error) {
      console.error('D1 查询执行失败:', { sql, params, error });
      throw error;
    }
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
    const currentTime = new Date().toISOString();
    
    // 检查游戏是否已存在
    const checkQuery = 'SELECT title_id FROM games WHERE title_id = ?';
    const existingGame = await this.executeD1Query(checkQuery, [game.titleId]);
    
    if (existingGame.results.length > 0) {
      // 更新现有游戏
      const updateQuery = `
        UPDATE games SET
          formal_name = ?,
          name_zh_hant = ?,
          name_zh_hans = ?,
          name_en = ?,
          name_ja = ?,
          catch_copy = ?,
          description = ?,
          publisher_name = ?,
          publisher_id = ?,
          genre = ?,
          release_date = ?,
          hero_banner_url = ?,
          screenshots = ?,
          platform = ?,
          languages = ?,
          player_number = ?,
          play_styles = ?,
          rom_size = ?,
          rating_age = ?,
          rating_name = ?,
          in_app_purchase = ?,
          cloud_backup_type = ?,
          region = ?,
          data_source = ?,
          notes = ?,
          updated_at = ?
        WHERE title_id = ?
      `;
      
      await this.executeD1Query(updateQuery, [
        game.formal_name || null,
        game.name_zh_hant || null,
        game.name_zh_hans || null,
        game.name_en || null,
        game.name_ja || null,
        game.catch_copy || null,
        game.description || null,
        game.publisher_name || null,
        game.publisher_id || null,
        game.genre || null,
        game.release_date || null,
        game.hero_banner_url || null,
        game.screenshots ? JSON.stringify(game.screenshots) : null,
        game.platform || 'HAC',
        game.languages ? JSON.stringify(game.languages) : null,
        game.player_number ? JSON.stringify(game.player_number) : null,
        game.play_styles ? JSON.stringify(game.play_styles) : null,
        game.rom_size || null,
        game.rating_age || null,
        game.rating_name || null,
        game.in_app_purchase ? 1 : 0,
        game.cloud_backup_type || null,
        game.region || 'HK',
        game.data_source || 'scraper',
        game.notes || null,
        currentTime,
        game.titleId
      ]);
    } else {
      // 插入新游戏
      const insertQuery = `
        INSERT INTO games (
          title_id, formal_name, name_zh_hant, name_zh_hans, name_en, name_ja,
          catch_copy, description, publisher_name, publisher_id, genre, release_date,
          hero_banner_url, screenshots, platform, languages, player_number, play_styles,
          rom_size, rating_age, rating_name, in_app_purchase, cloud_backup_type,
          region, data_source, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      await this.executeD1Query(insertQuery, [
        game.titleId,
        game.formal_name || null,
        game.name_zh_hant || null,
        game.name_zh_hans || null,
        game.name_en || null,
        game.name_ja || null,
        game.catch_copy || null,
        game.description || null,
        game.publisher_name || null,
        game.publisher_id || null,
        game.genre || null,
        game.release_date || null,
        game.hero_banner_url || null,
        game.screenshots ? JSON.stringify(game.screenshots) : null,
        game.platform || 'HAC',
        game.languages ? JSON.stringify(game.languages) : null,
        game.player_number ? JSON.stringify(game.player_number) : null,
        game.play_styles ? JSON.stringify(game.play_styles) : null,
        game.rom_size || null,
        game.rating_age || null,
        game.rating_name || null,
        game.in_app_purchase ? 1 : 0,
        game.cloud_backup_type || null,
        game.region || 'HK',
        game.data_source || 'scraper',
        game.notes || null,
        currentTime,
        currentTime
      ]);
    }
  }

  /**
   * 测试数据库连接
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.executeD1Query('SELECT COUNT(*) as count FROM games');
      const count = response.results[0]?.count || 0;
      console.log(`✅ D1 连接成功，当前游戏数量: ${count}`);
      return true;
    } catch (error) {
      console.error('❌ D1 连接测试失败:', error);
      return false;
    }
  }

  /**
   * 获取游戏统计信息
   */
  async getStats() {
    try {
      const queries = [
        'SELECT COUNT(*) as count FROM games',
        'SELECT COUNT(*) as count FROM games WHERE data_source = "scraper"',
        'SELECT COUNT(*) as count FROM games WHERE data_source = "manual"'
      ];

      const results = await Promise.all(queries.map(async (sql) => {
        const response = await this.executeD1Query(sql);
        return response.results[0]?.count || 0;
      }));

      return {
        total: results[0],
        scraped: results[1],
        manual: results[2]
      };
    } catch (error) {
      console.error('❌ 获取统计信息失败:', error);
      return { total: 0, scraped: 0, manual: 0 };
    }
  }
}
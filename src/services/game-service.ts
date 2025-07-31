import { eq, like, desc, or, sql } from 'drizzle-orm';
import type { DbConnection } from '../db/connection';
import { games, type NewGame } from '../db/schema';

export class GameService {
  constructor(private db: DbConnection) {}

  // 获取所有游戏
  async getAllGames(limit = 50, offset = 0) {
    return await this.db
      .select()
      .from(games)
      .orderBy(desc(games.updatedAt))
      .limit(limit)
      .offset(offset);
  }

  // 根据 ID 获取游戏
  async getGameById(titleId: string) {
    return await this.db
      .select()
      .from(games)
      .where(eq(games.titleId, titleId))
      .get();
  }

  // 搜索游戏
  async searchGames(query: string) {
    return await this.db
      .select()
      .from(games)
      .where(
        or(
          like(games.nameZhHant, `%${query}%`),
          like(games.nameZhHans, `%${query}%`),
          like(games.nameEn, `%${query}%`),
          like(games.nameJa, `%${query}%`),
          like(games.formalName, `%${query}%`),
          like(games.publisherName, `%${query}%`)
        )
      )
      .orderBy(desc(games.updatedAt));
  }

  // 创建游戏
  async createGame(gameData: NewGame) {
    return await this.db
      .insert(games)
      .values({
        ...gameData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .returning();
  }

  // 更新游戏
  async updateGame(titleId: string, gameData: Partial<NewGame>) {
    return await this.db
      .update(games)
      .set({
        ...gameData,
        updatedAt: new Date().toISOString()
      })
      .where(eq(games.titleId, titleId))
      .returning();
  }

  // 删除游戏
  async deleteGame(titleId: string) {
    return await this.db
      .delete(games)
      .where(eq(games.titleId, titleId))
      .returning();
  }

  // 批量插入游戏（爬虫使用）
  async batchInsertGames(gamesData: NewGame[]) {
    const results = [];
    for (const gameData of gamesData) {
      try {
        // 先尝试插入，如果冲突则更新
        const existingGame = await this.getGameById(gameData.titleId!);
        
        if (existingGame) {
          // 更新现有游戏
          const result = await this.updateGame(gameData.titleId!, gameData);
          results.push(result[0]);
        } else {
          // 插入新游戏
          const result = await this.createGame(gameData);
          results.push(result[0]);
        }
      } catch (error) {
        console.error(`处理游戏 ${gameData.titleId} 失败:`, error);
      }
    }
    return results;
  }

  // 获取统计信息
  async getStats() {
    const totalGames = await this.db
      .select({ count: sql`COUNT(*)` })
      .from(games)
      .get();

    const scrapedGames = await this.db
      .select({ count: sql`COUNT(*)` })
      .from(games)
      .where(eq(games.dataSource, 'scraper'))
      .get();

    const manualGames = await this.db
      .select({ count: sql`COUNT(*)` })
      .from(games)
      .where(eq(games.dataSource, 'manual'))
      .get();

    return {
      total: totalGames?.count || 0,
      scraped: scrapedGames?.count || 0,
      manual: manualGames?.count || 0
    };
  }
}

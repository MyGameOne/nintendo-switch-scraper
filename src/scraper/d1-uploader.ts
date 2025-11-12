import type { CloudflareEnv, ScrapedGameInfo } from '../types'
import Cloudflare from 'cloudflare'

export class D1Uploader {
  private client: Cloudflare
  private accountId: string
  private databaseId: string

  constructor(env: CloudflareEnv) {
    this.client = new Cloudflare({
      apiToken: env.CLOUDFLARE_API_TOKEN,
    })
    this.accountId = env.CLOUDFLARE_ACCOUNT_ID
    this.databaseId = env.CLOUDFLARE_D1_DATABASE_ID
  }

  private async executeD1Query(sql: string, params: any[] = []): Promise<{
    success: boolean
    results: any[]
    meta: object
  }> {
    try {
      const queryResultPages = this.client.d1.database.query(
        this.databaseId,
        {
          account_id: this.accountId,
          sql,
          params,
        },
      )

      // 收集所有页面的结果
      const allResults: any[] = []
      for await (const queryResult of queryResultPages) {
        allResults.push(...(queryResult.results || []))
      }

      return {
        success: true,
        results: allResults,
        meta: {},
      }
    }
    catch (error) {
      console.error('D1 查询执行失败:', { sql, params, error })
      throw error
    }
  }

  async uploadGames(gamesList: ScrapedGameInfo[], forceRefresh: boolean = false): Promise<void> {
    if (gamesList.length === 0) {
      console.log('📤 没有游戏需要上传')
      return
    }

    const mode = forceRefresh ? '强制刷新' : '普通上传'
    console.log(`📤 开始${mode} ${gamesList.length} 个游戏到 Cloudflare D1...`)

    let totalUploaded = 0

    for (const game of gamesList) {
      try {
        await this.uploadSingleGame(game, forceRefresh)
        totalUploaded++
        const action = forceRefresh ? '刷新' : '上传'
        console.log(`✅ 已${action}: ${game.name_zh_hant || game.formal_name} (${totalUploaded}/${gamesList.length})`)
      }
      catch (error) {
        console.error(`❌ 上传游戏 ${game.titleId} 失败:`, error)
      }
    }

    console.log(`🎉 ${mode}完成！成功处理 ${totalUploaded}/${gamesList.length} 个游戏`)
  }

  private async uploadSingleGame(game: ScrapedGameInfo, forceRefresh: boolean = false): Promise<void> {
    const currentTime = new Date().toISOString()

    // 检查游戏是否已存在
    const checkQuery = 'SELECT * FROM games WHERE title_id = ?'
    const existingGameResult = await this.executeD1Query(checkQuery, [game.titleId])

    if (existingGameResult.results.length > 0) {
      // 如果是强制刷新模式，或者游戏已存在，则更新
      if (forceRefresh) {
        console.log(`🔄 强制刷新游戏: ${game.titleId}`)
      }

      // 获取旧数据
      const oldGame = existingGameResult.results[0]

      // 智能合并：如果新数据为空，则使用旧数据
      const mergedData = {
        nsuid: game.nsuid || oldGame.nsuid,
        formal_name: game.formal_name || oldGame.formal_name,
        name_zh_hant: game.name_zh_hant || oldGame.name_zh_hant,
        name_zh_hans: game.name_zh_hans || oldGame.name_zh_hans,
        name_en: game.name_en || oldGame.name_en,
        name_ja: game.name_ja || oldGame.name_ja,
        catch_copy: game.catch_copy || oldGame.catch_copy,
        description: game.description || oldGame.description,
        publisher_name: game.publisher_name || oldGame.publisher_name,
        publisher_id: game.publisher_id ?? oldGame.publisher_id,
        genre: game.genre || oldGame.genre,
        release_date: game.release_date || oldGame.release_date,
        hero_banner_url: game.hero_banner_url || oldGame.hero_banner_url,
        screenshots: game.screenshots?.length ? JSON.stringify(game.screenshots) : oldGame.screenshots,
        platform: game.platform || oldGame.platform || 'HAC',
        languages: game.languages?.length ? JSON.stringify(game.languages) : oldGame.languages,
        player_number: game.player_number ? JSON.stringify(game.player_number) : oldGame.player_number,
        play_styles: game.play_styles?.length ? JSON.stringify(game.play_styles) : oldGame.play_styles,
        rom_size: game.rom_size ?? oldGame.rom_size,
        rom_size_infos: game.rom_size_infos ? JSON.stringify(game.rom_size_infos) : oldGame.rom_size_infos,
        rating_age: game.rating_age ?? oldGame.rating_age,
        rating_name: game.rating_name || oldGame.rating_name,
        in_app_purchase: game.in_app_purchase !== undefined ? (game.in_app_purchase ? 1 : 0) : oldGame.in_app_purchase,
        cloud_backup_type: game.cloud_backup_type || oldGame.cloud_backup_type,
        region: game.region || oldGame.region || 'HK',
        data_source: game.data_source || oldGame.data_source || 'scraper',
        notes: game.notes || oldGame.notes,
      }

      // 更新现有游戏
      const updateQuery = `
        UPDATE games SET
          nsuid = ?,
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
          rom_size_infos = ?,
          rating_age = ?,
          rating_name = ?,
          in_app_purchase = ?,
          cloud_backup_type = ?,
          region = ?,
          data_source = ?,
          notes = ?,
          updated_at = ?
        WHERE title_id = ?
      `

      await this.executeD1Query(updateQuery, [
        mergedData.nsuid,
        mergedData.formal_name,
        mergedData.name_zh_hant,
        mergedData.name_zh_hans,
        mergedData.name_en,
        mergedData.name_ja,
        mergedData.catch_copy,
        mergedData.description,
        mergedData.publisher_name,
        mergedData.publisher_id,
        mergedData.genre,
        mergedData.release_date,
        mergedData.hero_banner_url,
        mergedData.screenshots,
        mergedData.platform,
        mergedData.languages,
        mergedData.player_number,
        mergedData.play_styles,
        mergedData.rom_size,
        mergedData.rom_size_infos,
        mergedData.rating_age,
        mergedData.rating_name,
        mergedData.in_app_purchase,
        mergedData.cloud_backup_type,
        mergedData.region,
        mergedData.data_source,
        mergedData.notes,
        currentTime,
        game.titleId,
      ])
    }
    else {
      // 插入新游戏
      const insertQuery = `
        INSERT INTO games (
          title_id, nsuid, formal_name, name_zh_hant, name_zh_hans, name_en, name_ja,
          catch_copy, description, publisher_name, publisher_id, genre, release_date,
          hero_banner_url, screenshots, platform, languages, player_number, play_styles,
          rom_size, rom_size_infos, rating_age, rating_name, in_app_purchase, cloud_backup_type,
          region, data_source, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `

      await this.executeD1Query(insertQuery, [
        game.titleId,
        game.nsuid || null,
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
        game.rom_size_infos ? JSON.stringify(game.rom_size_infos) : null,
        game.rating_age || null,
        game.rating_name || null,
        game.in_app_purchase ? 1 : 0,
        game.cloud_backup_type || null,
        game.region || 'HK',
        game.data_source || 'scraper',
        game.notes || null,
        currentTime,
        currentTime,
      ])
    }
  }

  /**
   * 测试数据库连接
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.executeD1Query('SELECT COUNT(*) as count FROM games')
      const count = response.results[0]?.count || 0
      console.log(`✅ D1 连接成功，当前游戏数量: ${count}`)

      return true
    }
    catch (error) {
      console.error('❌ D1 连接测试失败:', error)
      return false
    }
  }

  /**
   * 获取游戏统计信息
   */
  async getStats(): Promise<{
    total: any
    scraped: any
    manual: any
  }> {
    try {
      const queries = [
        'SELECT COUNT(*) as count FROM games',
        'SELECT COUNT(*) as count FROM games WHERE data_source = "scraper"',
        'SELECT COUNT(*) as count FROM games WHERE data_source = "manual"',
      ]

      const results = await Promise.all(queries.map(async (sql) => {
        const response = await this.executeD1Query(sql)
        return response.results[0]?.count || 0
      }))

      return {
        total: results[0],
        scraped: results[1],
        manual: results[2],
      }
    }
    catch (error) {
      console.error('❌ 获取统计信息失败:', error)
      return { total: 0, scraped: 0, manual: 0 }
    }
  }
}

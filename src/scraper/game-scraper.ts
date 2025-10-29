import type { Browser, BrowserContext } from 'playwright'
import type { GameIdInfo, ScrapedGameInfo } from '../types'
import process from 'node:process'
import { chromium } from 'playwright'

export class GameScraper {
  private browser: Browser | null = null
  private context: BrowserContext | null = null

  /**
   * 判断游戏 ID 类型
   * @param id 游戏 ID
   * @returns ID 类型信息
   */
  private detectGameIdType(id: string): GameIdInfo {
    // titleId: 16位十六进制 (例如: 0100f43008c44000)
    // nsuid: 14位数字 (例如: 70010000095550)
    const titleIdPattern = /^[0-9a-f]{16}$/i
    const nsuidPattern = /^\d{14}$/

    if (titleIdPattern.test(id)) {
      return { id, type: 'titleId' }
    }
    else if (nsuidPattern.test(id)) {
      return { id, type: 'nsuid' }
    }
    else {
      throw new Error(`无效的游戏 ID 格式: ${id}`)
    }
  }

  /**
   * 根据 ID 类型生成对应的 URL
   * @param idInfo ID 信息
   * @returns 游戏页面 URL
   */
  private getGameUrl(idInfo: GameIdInfo): string {
    if (idInfo.type === 'titleId') {
      // titleId 格式: https://ec.nintendo.com/apps/{titleId}/HK
      return `https://ec.nintendo.com/apps/${idInfo.id}/HK`
    }
    else {
      // nsuid 格式: https://ec.nintendo.com/HK/zh/titles/{nsuid}
      return `https://ec.nintendo.com/HK/zh/titles/${idInfo.id}`
    }
  }

  private readonly userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  ]

  private readonly viewports = [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1280, height: 720 },
  ]

  async initialize(): Promise<void> {
    console.log('🛡️ 初始化反检测爬虫...')

    this.browser = await chromium.launch({
      headless: process.env.SCRAPER_HEADLESS !== 'false',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-field-trial-config',
        '--disable-back-forward-cache',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--no-crash-upload',
        '--no-default-browser-check',
        '--no-pings',
        '--password-store=basic',
        '--use-mock-keychain',
        '--disable-component-extensions-with-background-pages',
        '--disable-default-apps',
        '--mute-audio',
        '--no-service-autorun',
        '--disable-background-networking',
      ],
    })

    this.context = await this.browser.newContext({
      viewport: this.getRandomViewport(),
      userAgent: this.getRandomUserAgent(),
      locale: 'zh-CN',
      timezoneId: 'Asia/Hong_Kong',
      geolocation: { latitude: 22.3193, longitude: 114.1694 },
      permissions: ['geolocation'],
      extraHTTPHeaders: {
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
      },
    })

    // 添加完整的反检测脚本
    await this.context.addInitScript(`
      // 覆盖 webdriver 属性
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      // 覆盖 plugins 属性
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // 覆盖 languages 属性
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en'],
      });
      
      // 添加 chrome 对象
      window.chrome = {
        runtime: {},
      };
      
      // 覆盖 permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: window.Notification?.permission || 'default' }) :
          originalQuery(parameters)
      );

      // 模拟真实的屏幕属性
      Object.defineProperty(screen, 'availWidth', {
        get: () => window.innerWidth,
      });
      Object.defineProperty(screen, 'availHeight', {
        get: () => window.innerHeight,
      });
    `)

    console.log('✅ 爬虫初始化完成')
  }

  async scrapeGame(gameId: string): Promise<ScrapedGameInfo | null> {
    if (!this.context) {
      throw new Error('爬虫未初始化')
    }

    try {
      // 检测游戏 ID 类型
      const idInfo = this.detectGameIdType(gameId)
      console.log(`🎯 开始爬取游戏: ${gameId} (类型: ${idInfo.type})`)

      const page = await this.context.newPage()

      // 随机延迟
      await this.randomDelay()

      const url = this.getGameUrl(idInfo)
      console.log(`🌐 访问: ${url}`)

      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000,
      })

      if (!response || !response.ok()) {
        throw new Error(`HTTP ${response?.status()}: 页面加载失败`)
      }

      // 等待页面完全加载
      await page.waitForTimeout(Math.random() * 2000 + 1000)

      // 检查是否被阻止
      const isBlocked = await page.evaluate(() => {
        const title = document.title.toLowerCase()
        // eslint-disable-next-line unicorn/prefer-dom-node-text-content
        const body = document.body.innerText.toLowerCase()
        return title.includes('access denied')
          || title.includes('blocked')
          || body.includes('access denied')
          || body.includes('blocked')
          || body.includes('captcha')
      })

      if (isBlocked) {
        throw new Error('页面被阻止访问')
      }

      // 提取游戏信息
      const gameInfo = await page.evaluate(() => {
        try {
          // 尝试从 NXSTORE 对象中提取信息
          const nxstore = (window as any).NXSTORE
          if (nxstore && nxstore.titleDetail && nxstore.titleDetail.jsonData) {
            const data = nxstore.titleDetail.jsonData

            const screenshots = data.screenshots
              ? data.screenshots.map((screenshot: any) =>
                  screenshot.images?.[0]?.url,
                ).filter(Boolean)
              : []

            // 提取游玩模式
            const playStyles = data.play_styles
              ? data.play_styles.map((style: any) => style.name)
              : []

            // 提取ROM大小 - 简化逻辑避免复杂函数
            let romSize: number | undefined
            if (data.rom_size_infos && Array.isArray(data.rom_size_infos)) {
              // 优先查找 BEE 平台
              let info = data.rom_size_infos.find((item: any) =>
                item.platform === 'BEE'
                && typeof item.total_rom_size === 'number'
                && item.total_rom_size > 0,
              )

              // 如果没有 BEE，查找 HAC
              if (!info) {
                info = data.rom_size_infos.find((item: any) =>
                  item.platform === 'HAC'
                  && typeof item.total_rom_size === 'number'
                  && item.total_rom_size > 0,
                )
              }

              // 如果还没有，取任何有效的
              if (!info) {
                info = data.rom_size_infos.find((item: any) =>
                  typeof item.total_rom_size === 'number'
                  && item.total_rom_size > 0,
                )
              }

              if (info) {
                romSize = info.total_rom_size
              }
            }

            return {
              title_id: data.applications?.[0]?.id ?? gameId,
              nsuid: data.id,
              formal_name: data.formal_name,
              catch_copy: data.catch_copy,
              description: data.description,
              publisher_name: data.publisher?.name,
              publisher_id: data.publisher?.id,
              genre: data.genre,
              release_date: data.release_date_on_eshop,
              hero_banner_url: data.hero_banner_url,
              screenshots,
              platform: data.label_platform,
              languages: data.languages || [],
              player_number: data.player_number || {},
              play_styles: playStyles,
              rom_size: romSize,
              rating_age: data.rating_info?.rating?.age,
              rating_name: data.rating_info?.rating?.name,
              in_app_purchase: data.in_app_purchase,
              cloud_backup_type: data.cloud_backup_type,
            }
          }

          // 备用方案：从 meta 标签提取
          const nameElement = document.querySelector('meta[name="search.name"]')
          const publisherElement = document.querySelector('meta[name="search.publisher"]')

          return {
            name_zh_hant: nameElement ? nameElement.getAttribute('content') : null,
            publisher_name: publisherElement ? publisherElement.getAttribute('content') : null,
          }
        }
        catch (error) {
          console.error('页面数据提取失败:', error)
          return null
        }
      }) as any

      await page.close()

      if (gameInfo && (gameInfo.formal_name || gameInfo.name_zh_hant)) {
        // 优先使用从页面爬取到的 titleId
        const titleId = gameInfo.title_id || gameId

        // 如果没有从页面获取到 titleId，且输入的是 nsuid，则报错
        if (!gameInfo.title_id && idInfo.type === 'nsuid') {
          throw new Error(`无法从页面获取 titleId，输入的 nsuid: ${gameId}`)
        }

        // 记录 nsuid 用于日志
        const nsuid = idInfo.type === 'nsuid' ? gameId : (gameInfo.nsuid || undefined)

        const result: ScrapedGameInfo = {
          titleId,
          nsuid,
          ...gameInfo,
          name_zh_hant: gameInfo.formal_name || gameInfo.name_zh_hant,
          region: 'HK',
          data_source: 'scraper',
        }

        console.log(`✅ 成功爬取: ${result.name_zh_hant || result.formal_name}`)
        console.log(`   titleId: ${result.titleId}${result.nsuid ? `, nsuid: ${result.nsuid}` : ''}`)
        console.log(`   输入ID: ${gameId} (${idInfo.type})`)
        return result
      }
      else {
        throw new Error('未找到游戏信息')
      }
    }
    catch (error) {
      console.error(`❌ 爬取失败 ${gameId}:`, error)
      return null
    }
  }

  async batchScrapeGames(gameIds: string[]): Promise<ScrapedGameInfo[]> {
    console.log(`🚀 开始批量爬取 ${gameIds.length} 个游戏`)

    const results: ScrapedGameInfo[] = []
    let successCount = 0
    let failCount = 0

    for (const gameId of gameIds) {
      try {
        const gameInfo = await this.scrapeGame(gameId)
        if (gameInfo) {
          results.push(gameInfo)
          successCount++
        }
        else {
          failCount++
        }
      }
      catch (error) {
        console.error(`处理游戏 ${gameId} 时出错:`, error)
        failCount++
      }
    }

    console.log(`\n📊 批量爬取完成:`)
    console.log(`   成功: ${successCount}`)
    console.log(`   失败: ${failCount}`)
    console.log(`   成功率: ${((successCount / gameIds.length) * 100).toFixed(1)}%\n`)

    return results
  }

  async destroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.context = null
    }
    console.log('🔚 爬虫已销毁')
  }

  private getRandomUserAgent(): string {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)]
  }

  private getRandomViewport(): {
    width: number
    height: number
  } {
    const baseViewport = this.viewports[Math.floor(Math.random() * this.viewports.length)]
    return {
      width: baseViewport.width + Math.floor(Math.random() * 100),
      height: baseViewport.height + Math.floor(Math.random() * 100),
    }
  }

  private async randomDelay(): Promise<void> {
    const min = Number.parseInt(process.env.SCRAPER_DELAY_MIN || '2000')
    const max = Number.parseInt(process.env.SCRAPER_DELAY_MAX || '5000')
    const delay = Math.random() * (max - min) + min
    console.log(`⏳ 延迟 ${Math.round(delay)}ms`)
    await new Promise(resolve => setTimeout(resolve, delay))
  }
}

import type { Browser, BrowserContext } from 'playwright'
import type { ScrapedGameInfo } from '../types'
import process from 'node:process'
import { chromium } from 'playwright'

export class GameScraper {
  private browser: Browser | null = null
  private context: BrowserContext | null = null

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

  async scrapeGame(titleId: string): Promise<ScrapedGameInfo | null> {
    if (!this.context) {
      throw new Error('爬虫未初始化')
    }

    try {
      console.log(`🎯 开始爬取游戏: ${titleId}`)

      const page = await this.context.newPage()

      // 随机延迟
      await this.randomDelay()

      const url = `https://ec.nintendo.com/apps/${titleId}/HK`
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

          return {
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
            rom_size: data.rom_size_infos?.[0]?.total_rom_size,
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
      }) as any

      await page.close()

      if (gameInfo && (gameInfo.formal_name || gameInfo.name_zh_hant)) {
        const result: ScrapedGameInfo = {
          titleId,
          ...gameInfo,
          name_zh_hant: gameInfo.formal_name || gameInfo.name_zh_hant,
          region: 'HK',
          data_source: 'scraper',
        }

        console.log(`✅ 成功爬取: ${result.name_zh_hant || result.formal_name}`)
        return result
      }
      else {
        throw new Error('未找到游戏信息')
      }
    }
    catch (error) {
      console.error(`❌ 爬取失败 ${titleId}:`, error)
      return null
    }
  }

  async batchScrapeGames(titleIds: string[]): Promise<ScrapedGameInfo[]> {
    console.log(`🚀 开始批量爬取 ${titleIds.length} 个游戏`)

    const results: ScrapedGameInfo[] = []
    let successCount = 0
    let failCount = 0

    for (const titleId of titleIds) {
      try {
        const gameInfo = await this.scrapeGame(titleId)
        if (gameInfo) {
          results.push(gameInfo)
          successCount++
        }
        else {
          failCount++
        }
      }
      catch (error) {
        console.error(`处理游戏 ${titleId} 时出错:`, error)
        failCount++
      }
    }

    console.log(`\n📊 批量爬取完成:`)
    console.log(`   成功: ${successCount}`)
    console.log(`   失败: ${failCount}`)
    console.log(`   成功率: ${((successCount / titleIds.length) * 100).toFixed(1)}%\n`)

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

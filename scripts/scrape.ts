import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'
import pLimit from 'p-limit'
import { D1Uploader } from '../src/scraper/d1-uploader'
import { GameScraper } from '../src/scraper/game-scraper'
import { KVQueueManager } from '../src/scraper/kv-queue-manager'

// 加载环境变量
dotenv.config()

async function main() {
  console.log('🚀 Nintendo Switch KV 队列爬虫启动...\n')

  // 验证环境变量
  const requiredEnvs = [
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_D1_DATABASE_ID',
    'CLOUDFLARE_KV_GAME_IDS_ID',
  ]

  const missing = requiredEnvs.filter(env => !process.env[env])
  if (missing.length > 0) {
    console.error('❌ 缺少环境变量:', missing.join(', '))
    console.error('请检查 .env 文件配置')
    process.exit(1)
  }

  console.log(`🔧 配置信息:`)
  console.log(`   并发数: ${process.env.SCRAPER_CONCURRENT || 3}`)
  console.log(`   延迟范围: ${process.env.SCRAPER_DELAY_MIN || 2000}-${process.env.SCRAPER_DELAY_MAX || 5000}ms`)
  console.log(`   无头模式: ${process.env.SCRAPER_HEADLESS !== 'false'}`)
  console.log(`   KV 命名空间 ID: ${process.env.CLOUDFLARE_KV_GAME_IDS_ID}`)
  console.log('')

  // 初始化服务
  const kvQueueManager = new KVQueueManager({
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN!,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID!,
    CLOUDFLARE_D1_DATABASE_ID: process.env.CLOUDFLARE_D1_DATABASE_ID!,
    CLOUDFLARE_KV_GAME_IDS_ID: process.env.CLOUDFLARE_KV_GAME_IDS_ID!,
  })

  const d1Uploader = new D1Uploader({
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN!,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID!,
    CLOUDFLARE_D1_DATABASE_ID: process.env.CLOUDFLARE_D1_DATABASE_ID!,
    CLOUDFLARE_KV_GAME_IDS_ID: process.env.CLOUDFLARE_KV_GAME_IDS_ID!,
  })

  // 测试连接
  console.log('🔍 测试服务连接...')
  const [kvConnected, d1Connected] = await Promise.all([
    kvQueueManager.testConnection(),
    d1Uploader.testConnection(),
  ])

  if (!kvConnected || !d1Connected) {
    console.error('❌ 服务连接失败')
    process.exit(1)
  }

  // 清理过期的 processing 状态
  await kvQueueManager.cleanupStaleProcessing()

  // 获取队列统计
  const queueStats = await kvQueueManager.getQueueStats()
  console.log('📊 队列统计:')
  console.log(`   待处理: ${queueStats.pendingCount}`)
  console.log(`   失败: ${queueStats.failedCount}`)
  console.log(`   黑名单: ${queueStats.blacklistedCount}`)
  console.log('')

  if (queueStats.pendingCount === 0) {
    console.log('✅ 队列中没有待处理的游戏，任务完成')
    return
  }

  // 获取待处理的游戏 ID
  const batchSize = Number.parseInt(process.env.SCRAPER_BATCH_SIZE || '50')
  const queueItems = await kvQueueManager.getPendingGameIds(batchSize)

  if (queueItems.length === 0) {
    console.log('✅ 没有游戏 ID 需要处理')
    return
  }

  console.log(`📋 获取到 ${queueItems.length} 个待处理游戏:`)
  queueItems.forEach((item, index) => {
    const addedTime = new Date(item.addedAt).toLocaleString()
    const taskType = item.forceRefresh ? '🔄 刷新' : '📝 新增'
    const priority = item.priority === 'refresh' ? ' [高优先级]' : ''
    console.log(`   ${index + 1}. ${taskType} ${item.titleId} (来源: ${item.source}, 添加时间: ${addedTime})${priority}`)
  })
  console.log('')

  // 初始化爬虫
  const scraper = new GameScraper()
  await scraper.initialize()

  try {
    const concurrency = Number.parseInt(process.env.SCRAPER_CONCURRENT || '3')
    const limit = pLimit(concurrency)

    let successCount = 0
    let failedCount = 0
    const failedGames: string[] = []

    console.log(`🚀 开始处理 ${queueItems.length} 个游戏...`)

    // 并发处理游戏
    const tasks = queueItems.map(item =>
      limit(async () => {
        const { titleId, forceRefresh } = item
        const taskType = forceRefresh ? '🔄 刷新' : '📝 新增'

        try {
          console.log(`${taskType} 开始处理游戏: ${titleId}`)

          // 爬取游戏信息
          const gameInfo = await scraper.scrapeGame(titleId)

          if (gameInfo) {
            // 上传到数据库（强制刷新模式会覆盖已有数据）
            await d1Uploader.uploadGames([gameInfo], forceRefresh)

            // 标记为完成
            await kvQueueManager.markAsCompleted(titleId)

            successCount++
            const action = forceRefresh ? '刷新' : '新增'
            console.log(`✅ ${action}成功: ${gameInfo.name_zh_hant || gameInfo.formal_name} (${titleId})`)
          }
          else {
            // 标记为失败
            await kvQueueManager.markAsFailed(titleId, '爬取失败：未获取到游戏信息')
            failedCount++
            failedGames.push(titleId)
            console.log(`❌ 爬取失败: ${titleId}`)
          }
        }
        catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)

          // 标记为失败
          await kvQueueManager.markAsFailed(titleId, errorMessage)

          failedCount++
          failedGames.push(titleId)
          console.error(`❌ 处理游戏 ${titleId} 时出错:`, error)
        }
      }),
    )

    await Promise.all(tasks)

    // 最终统计
    console.log('\n🎉 批量处理完成！')
    console.log(`📊 处理统计:`)
    console.log(`   成功: ${successCount}`)
    console.log(`   失败: ${failedCount}`)
    console.log(`   成功率: ${((successCount / queueItems.length) * 100).toFixed(1)}%`)

    if (failedGames.length > 0) {
      console.log(`\n❌ 失败的游戏 ID:`)
      failedGames.forEach(id => console.log(`   - ${id}`))
    }

    // 获取更新后的队列统计
    const finalStats = await kvQueueManager.getQueueStats()
    console.log('\n📊 更新后的队列统计:')
    console.log(`   待处理: ${finalStats.pendingCount}`)
    console.log(`   失败: ${finalStats.failedCount}`)
    console.log(`   黑名单: ${finalStats.blacklistedCount}`)

    // 生成运行报告
    await generateReport({
      processedCount: queueItems.length,
      successCount,
      failedCount,
      failedGames,
      queueStats: finalStats,
    })
  }
  catch (error) {
    console.error('❌ 爬虫执行过程中出错:', error)
    process.exit(1)
  }
  finally {
    await scraper.destroy()
  }
}

/**
 * 生成运行报告
 */
async function generateReport(stats: {
  processedCount: number
  successCount: number
  failedCount: number
  failedGames: string[]
  queueStats: any
}) {
  try {
    const report = {
      timestamp: new Date().toISOString(),
      processed: stats.processedCount,
      success: stats.successCount,
      failed: stats.failedCount,
      successRate: `${((stats.successCount / stats.processedCount) * 100).toFixed(1)}%`,
      failedGames: stats.failedGames,
      queueStats: stats.queueStats,
    }

    const reportPath = path.join(process.cwd(), 'reports', `scrape-report-${Date.now()}.json`)

    // 确保报告目录存在
    const reportDir = path.dirname(reportPath)
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true })
    }

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
    console.log(`📄 运行报告已保存: ${reportPath}`)
  }
  catch (error) {
    console.error('❌ 生成报告失败:', error)
  }
}

// 错误处理
process.on('uncaughtException', async (error) => {
  console.error('❌ 未捕获的异常:', error)
  process.exit(1)
})

process.on('unhandledRejection', async (reason) => {
  console.error('❌ 未处理的 Promise 拒绝:', reason)
  process.exit(1)
})

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n🔄 收到中断信号，正在优雅关闭...')
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n🔄 收到终止信号，正在优雅关闭...')
  process.exit(0)
})

main().catch(console.error)

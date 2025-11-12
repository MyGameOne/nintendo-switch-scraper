import type { CloudflareEnv } from '../types'
import Cloudflare from 'cloudflare'

export interface QueueItem {
  titleId: string
  addedAt: number
  source: string
  status: 'pending' | 'processing' | 'failed'
  failureCount: number
  lastFailedAt?: number
  blacklisted?: boolean
  reason?: string
  priority?: 'normal' | 'high' | 'refresh'
  forceRefresh?: boolean
}

export class KVQueueManager {
  private client: Cloudflare
  private accountId: string
  private gameIdsNamespaceId: string

  constructor(env: CloudflareEnv) {
    this.client = new Cloudflare({
      apiToken: env.CLOUDFLARE_API_TOKEN,
    })
    this.accountId = env.CLOUDFLARE_ACCOUNT_ID
    this.gameIdsNamespaceId = env.CLOUDFLARE_KV_GAME_IDS_ID
  }

  /**
   * 获取待处理的游戏 ID 列表（刷新任务优先）
   * @param limit 限制数量，默认 100
   * @returns 待处理的游戏 ID 数组
   */
  async getPendingGameIds(limit: number = 100): Promise<QueueItem[]> {
    try {
      console.log(`📋 从 KV 队列获取待处理游戏 ID (限制: ${limit})...`)

      // 列出所有 pending: 开头的键
      const listResponse = await this.client.kv.namespaces.keys.list(
        this.gameIdsNamespaceId,
        {
          account_id: this.accountId,
          prefix: 'pending:',
          limit,
        },
      )

      if (!listResponse.result || listResponse.result.length === 0) {
        console.log('📋 KV 队列中没有待处理的游戏 ID')
        return []
      }

      console.log(`📋 找到 ${listResponse.result.length} 个待处理的游戏 ID`)

      // 批量获取队列项的详细信息
      const refreshTasks: QueueItem[] = []
      const normalTasks: QueueItem[] = []

      for (const key of listResponse.result) {
        try {
          const titleId = key.name.replace('pending:', '')
          const valueResponse = await this.client.kv.namespaces.values.get(
            this.gameIdsNamespaceId,
            key.name,
            {
              account_id: this.accountId,
            },
          )

          if (valueResponse) {
            const valueText = await valueResponse.text()
            const queueData = JSON.parse(valueText)
            const queueItem: QueueItem = {
              titleId,
              addedAt: queueData.addedAt || Date.now(),
              source: queueData.source || 'unknown',
              status: queueData.status || 'pending',
              failureCount: queueData.failureCount || 0,
              lastFailedAt: queueData.lastFailedAt,
              blacklisted: queueData.blacklisted,
              reason: queueData.reason,
              priority: queueData.priority || 'normal',
              forceRefresh: queueData.forceRefresh || false,
            }

            // 刷新任务优先
            if (queueItem.forceRefresh || queueItem.priority === 'refresh') {
              refreshTasks.push(queueItem)
            }
            else {
              normalTasks.push(queueItem)
            }
          }
        }
        catch (error) {
          console.warn(`⚠️ 解析队列项 ${key.name} 失败:`, error)
          // 如果解析失败，仍然添加基本信息
          normalTasks.push({
            titleId: key.name.replace('pending:', ''),
            addedAt: Date.now(),
            source: 'unknown',
            status: 'pending',
            failureCount: 0,
            priority: 'normal',
            forceRefresh: false,
          })
        }
      }

      // 刷新任务按添加时间排序
      refreshTasks.sort((a, b) => a.addedAt - b.addedAt)
      // 普通任务按添加时间排序
      normalTasks.sort((a, b) => a.addedAt - b.addedAt)

      // 刷新任务优先返回
      const queueItems = [...refreshTasks, ...normalTasks]

      if (refreshTasks.length > 0) {
        console.log(`🔄 发现 ${refreshTasks.length} 个刷新任务（优先处理）`)
      }
      console.log(`✅ 成功获取 ${queueItems.length} 个队列项 (刷新: ${refreshTasks.length}, 普通: ${normalTasks.length})`)
      return queueItems
    }
    catch (error) {
      console.error('❌ 获取 KV 队列失败:', error)
      throw new Error(`获取 KV 队列失败: ${error}`)
    }
  }

  /**
   * 将游戏 ID 状态更新为 processing（保持兼容性，实际不再使用）
   * @param titleId 游戏 ID
   */
  async markAsProcessing(titleId: string): Promise<void> {
    // 新的 KV 结构不再使用 processing 状态，保持方法兼容性但不执行操作
    console.log(`🔄 游戏 ${titleId} 开始处理（新结构不需要 processing 状态）`)
  }

  /**
   * 标记游戏爬取成功并从队列中移除
   * @param titleId 游戏 ID
   */
  async markAsCompleted(titleId: string): Promise<void> {
    try {
      const pendingKey = `pending:${titleId}`
      const failedKey = `failed:${titleId}`

      // 从队列和失败记录中移除
      await Promise.all([
        this.deleteKey(pendingKey),
        this.deleteKey(failedKey),
      ])

      console.log(`✅ 游戏 ${titleId} 爬取成功，已从队列中移除`)
    }
    catch (error) {
      console.error(`❌ 标记游戏 ${titleId} 完成失败:`, error)
    }
  }

  /**
   * 记录游戏爬取失败
   * @param titleId 游戏 ID
   * @param error 错误信息
   */
  async markAsFailed(titleId: string, error: string): Promise<void> {
    try {
      const pendingKey = `pending:${titleId}`
      const failedKey = `failed:${titleId}`
      const MAX_FAILURE_COUNT = 3
      const BLACKLIST_TTL = 30 * 24 * 60 * 60 // 30天

      // 从待处理队列中移除
      await this.deleteKey(pendingKey)

      // 获取或创建失败记录
      let failureData: QueueItem
      const existingFailure = await this.client.kv.namespaces.values.get(
        this.gameIdsNamespaceId,
        failedKey,
        { account_id: this.accountId },
      )

      if (existingFailure) {
        try {
          const valueText = await existingFailure.text()
          failureData = JSON.parse(valueText)
          failureData.failureCount += 1
          failureData.lastFailedAt = Date.now()
          failureData.reason = error.substring(0, 500)
        }
        catch {
          // 解析失败，创建新记录
          failureData = {
            titleId,
            addedAt: Date.now(),
            source: 'unknown',
            status: 'failed',
            failureCount: 1,
            lastFailedAt: Date.now(),
            reason: error.substring(0, 500),
          }
        }
      }
      else {
        failureData = {
          titleId,
          addedAt: Date.now(),
          source: 'unknown',
          status: 'failed',
          failureCount: 1,
          lastFailedAt: Date.now(),
          reason: error.substring(0, 500),
        }
      }

      // 检查是否需要加入黑名单
      if (failureData.failureCount >= MAX_FAILURE_COUNT) {
        failureData.blacklisted = true
        console.log(`🚫 游戏 ID ${titleId} 失败 ${failureData.failureCount} 次，已加入黑名单`)

        // 设置较长的 TTL
        await this.client.kv.namespaces.values.update(
          this.gameIdsNamespaceId,
          failedKey,
          {
            account_id: this.accountId,
            value: JSON.stringify(failureData),
            expiration_ttl: BLACKLIST_TTL,
          },
        )
      }
      else {
        console.log(`⚠️ 游戏 ID ${titleId} 失败 ${failureData.failureCount} 次`)
        await this.client.kv.namespaces.values.update(
          this.gameIdsNamespaceId,
          failedKey,
          {
            account_id: this.accountId,
            value: JSON.stringify(failureData),
          },
        )
      }
    }
    catch (kvError) {
      console.error(`❌ 记录游戏 ${titleId} 失败状态时出错:`, kvError)
    }
  }

  /**
   * 删除 KV 中的键
   * @param key 要删除的键
   */
  private async deleteKey(key: string): Promise<void> {
    try {
      await this.client.kv.namespaces.values.delete(
        this.gameIdsNamespaceId,
        key,
        {
          account_id: this.accountId,
        },
      )
    }
    catch (error) {
      console.warn(`⚠️ 删除键 ${key} 失败:`, error)
      // 不抛出错误，因为删除失败不应该阻止主流程
    }
  }

  /**
   * 获取队列统计信息
   */
  async getQueueStats(): Promise<{
    pendingCount: number
    blacklistedCount: number
    failedCount: number
  }> {
    try {
      const [pendingList, failedList] = await Promise.all([
        this.client.kv.namespaces.keys.list(
          this.gameIdsNamespaceId,
          {
            account_id: this.accountId,
            prefix: 'pending:',
            limit: 1000,
          },
        ),
        this.client.kv.namespaces.keys.list(
          this.gameIdsNamespaceId,
          {
            account_id: this.accountId,
            prefix: 'failed:',
            limit: 1000,
          },
        ),
      ])

      // 统计黑名单数量
      let blacklistedCount = 0
      for (const key of failedList.result || []) {
        try {
          const valueResponse = await this.client.kv.namespaces.values.get(
            this.gameIdsNamespaceId,
            key.name,
            { account_id: this.accountId },
          )
          if (valueResponse) {
            const valueText = await valueResponse.text()
            const failureData: QueueItem = JSON.parse(valueText)
            if (failureData.blacklisted) {
              blacklistedCount++
            }
          }
        }
        catch {
          // 忽略解析错误
        }
      }

      return {
        pendingCount: pendingList.result?.length || 0,
        blacklistedCount,
        failedCount: failedList.result?.length || 0,
      }
    }
    catch (error) {
      console.error('❌ 获取队列统计失败:', error)
      return {
        pendingCount: 0,
        blacklistedCount: 0,
        failedCount: 0,
      }
    }
  }

  /**
   * 清理过期的失败记录（新结构不再需要清理 processing 状态）
   */
  async cleanupStaleProcessing(): Promise<void> {
    console.log('🧹 新的 KV 结构不需要清理 processing 状态')
    // 可以在这里添加清理过期失败记录的逻辑，但保持方法兼容性
  }

  /**
   * 测试 KV 连接
   */
  async testConnection(): Promise<boolean> {
    try {
      // 尝试列出键来测试连接
      await this.client.kv.namespaces.keys.list(
        this.gameIdsNamespaceId,
        {
          account_id: this.accountId,
          limit: 10,
        },
      )

      console.log('✅ KV 连接测试成功')
      return true
    }
    catch (error) {
      console.error('❌ KV 连接测试失败:', error)
      return false
    }
  }
}

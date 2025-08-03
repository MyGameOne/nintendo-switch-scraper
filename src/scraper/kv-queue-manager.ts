import type { CloudflareEnv } from '../types'
import Cloudflare from 'cloudflare'

export interface QueueItem {
  titleId: string
  addedAt: number
  source: string
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
   * 获取待处理的游戏 ID 列表
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
      const queueItems: QueueItem[] = []

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
            queueItems.push({
              titleId,
              addedAt: queueData.addedAt || Date.now(),
              source: queueData.source || 'unknown',
            })
          }
        }
        catch (error) {
          console.warn(`⚠️ 解析队列项 ${key.name} 失败:`, error)
          // 如果解析失败，仍然添加基本信息
          queueItems.push({
            titleId: key.name.replace('pending:', ''),
            addedAt: Date.now(),
            source: 'unknown',
          })
        }
      }

      // 按添加时间排序，优先处理较早添加的
      queueItems.sort((a, b) => a.addedAt - b.addedAt)

      console.log(`✅ 成功获取 ${queueItems.length} 个队列项`)
      return queueItems
    }
    catch (error) {
      console.error('❌ 获取 KV 队列失败:', error)
      throw new Error(`获取 KV 队列失败: ${error}`)
    }
  }

  /**
   * 将游戏 ID 状态更新为 processing
   * @param titleId 游戏 ID
   */
  async markAsProcessing(titleId: string): Promise<void> {
    try {
      const processingKey = `processing:${titleId}`
      const processingData = {
        startedAt: Date.now(),
        attempts: 1,
      }

      await this.client.kv.namespaces.values.update(
        this.gameIdsNamespaceId,
        processingKey,
        {
          account_id: this.accountId,
          value: JSON.stringify(processingData),
        },
      )

      console.log(`🔄 游戏 ${titleId} 状态已更新为 processing`)
    }
    catch (error) {
      console.error(`❌ 更新游戏 ${titleId} 状态为 processing 失败:`, error)
      // 不抛出错误，因为这不应该阻止爬取过程
    }
  }

  /**
   * 将游戏 ID 状态更新为 completed 并清理 pending 状态
   * @param titleId 游戏 ID
   */
  async markAsCompleted(titleId: string): Promise<void> {
    try {
      const completedKey = `completed:${titleId}`
      const pendingKey = `pending:${titleId}`
      const processingKey = `processing:${titleId}`

      const completedData = {
        completedAt: Date.now(),
        hasData: true,
      }

      // 添加 completed 状态
      await this.client.kv.namespaces.values.update(
        this.gameIdsNamespaceId,
        completedKey,
        {
          account_id: this.accountId,
          value: JSON.stringify(completedData),
        },
      )

      // 清理 pending 和 processing 状态
      await Promise.all([
        this.deleteKey(pendingKey),
        this.deleteKey(processingKey),
      ])

      console.log(`✅ 游戏 ${titleId} 状态已更新为 completed`)
    }
    catch (error) {
      console.error(`❌ 更新游戏 ${titleId} 状态为 completed 失败:`, error)
      // 不抛出错误，但记录警告
    }
  }

  /**
   * 将游戏 ID 状态更新为 failed
   * @param titleId 游戏 ID
   * @param error 错误信息
   */
  async markAsFailed(titleId: string, error: string): Promise<void> {
    try {
      const failedKey = `failed:${titleId}`
      const pendingKey = `pending:${titleId}`
      const processingKey = `processing:${titleId}`

      const failedData = {
        lastAttempt: Date.now(),
        attempts: 1,
        error: error.substring(0, 500), // 限制错误信息长度
      }

      // 添加 failed 状态
      await this.client.kv.namespaces.values.update(
        this.gameIdsNamespaceId,
        failedKey,
        {
          account_id: this.accountId,
          value: JSON.stringify(failedData),
        },
      )

      // 清理 pending 和 processing 状态
      await Promise.all([
        this.deleteKey(pendingKey),
        this.deleteKey(processingKey),
      ])

      console.log(`❌ 游戏 ${titleId} 状态已更新为 failed: ${error}`)
    }
    catch (kvError) {
      console.error(`❌ 更新游戏 ${titleId} 状态为 failed 失败:`, kvError)
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
    processingCount: number
    completedCount: number
    failedCount: number
  }> {
    try {
      const prefixes = ['pending:', 'processing:', 'completed:', 'failed:']
      const counts = await Promise.all(
        prefixes.map(async (prefix) => {
          try {
            const response = await this.client.kv.namespaces.keys.list(
              this.gameIdsNamespaceId,
              {
                account_id: this.accountId,
                prefix,
                limit: 1000, // 假设不会超过 1000 个
              },
            )
            return response.result?.length || 0
          }
          catch (error) {
            console.warn(`⚠️ 获取 ${prefix} 统计失败:`, error)
            return 0
          }
        }),
      )

      return {
        pendingCount: counts[0],
        processingCount: counts[1],
        completedCount: counts[2],
        failedCount: counts[3],
      }
    }
    catch (error) {
      console.error('❌ 获取队列统计失败:', error)
      return {
        pendingCount: 0,
        processingCount: 0,
        completedCount: 0,
        failedCount: 0,
      }
    }
  }

  /**
   * 清理长时间处于 processing 状态的游戏（超过 1 小时）
   */
  async cleanupStaleProcessing(): Promise<void> {
    try {
      console.log('🧹 清理长时间处于 processing 状态的游戏...')

      const response = await this.client.kv.namespaces.keys.list(
        this.gameIdsNamespaceId,
        {
          account_id: this.accountId,
          prefix: 'processing:',
          limit: 100,
        },
      )

      if (!response.result || response.result.length === 0) {
        console.log('✅ 没有需要清理的 processing 状态')
        return
      }

      const oneHourAgo = Date.now() - 60 * 60 * 1000 // 1小时前
      let cleanedCount = 0

      for (const key of response.result) {
        try {
          const valueResponse = await this.client.kv.namespaces.values.get(
            this.gameIdsNamespaceId,
            key.name,
            {
              account_id: this.accountId,
            },
          )

          if (valueResponse) {
            const valueText = await valueResponse.text()
            const processingData = JSON.parse(valueText)
            if (processingData.startedAt < oneHourAgo) {
              // 将过期的 processing 状态重新标记为 pending
              const titleId = key.name.replace('processing:', '')
              await this.deleteKey(key.name)

              const pendingKey = `pending:${titleId}`
              const pendingData = {
                addedAt: Date.now(),
                source: 'cleanup_retry',
              }

              await this.client.kv.namespaces.values.update(
                this.gameIdsNamespaceId,
                pendingKey,
                {
                  account_id: this.accountId,
                  value: JSON.stringify(pendingData),
                },
              )

              cleanedCount++
              console.log(`🔄 游戏 ${titleId} 从过期的 processing 状态重置为 pending`)
            }
          }
        }
        catch (error) {
          console.warn(`⚠️ 清理 processing 状态 ${key.name} 失败:`, error)
        }
      }

      if (cleanedCount > 0) {
        console.log(`✅ 清理完成，重置了 ${cleanedCount} 个过期的 processing 状态`)
      }
      else {
        console.log('✅ 没有过期的 processing 状态需要清理')
      }
    }
    catch (error) {
      console.error('❌ 清理 processing 状态失败:', error)
    }
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

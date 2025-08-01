# Cloudflare KV 集成设计方案

## 概述

为 nintendo-switch-api 项目集成 Cloudflare KV 存储，用于缓存热点数据，提升 API 响应性能和用户体验。

## 当前 nintendo-switch-api 架构分析

根据项目文档，nintendo-switch-api 具有以下特点：
- **运行环境**: Cloudflare Workers
- **数据库**: 直接使用 D1 绑定（高效）
- **主要功能**: Nintendo OAuth2 认证、用户数据获取、游戏记录查询
- **API 端点**: `/health`, `/api/auth/*`, `/api/user`, `/api/games`, `/api/stats`

## KV 集成策略

### 1. KV 使用场景

#### 高频查询缓存
```typescript
// 游戏详情缓存 - TTL: 1小时
await env.GAME_CACHE.put(`game:${titleId}`, JSON.stringify(gameData), {
  expirationTtl: 3600
})

// 热门游戏列表 - TTL: 30分钟
await env.GAME_CACHE.put('popular:games', JSON.stringify(popularGames), {
  expirationTtl: 1800
})
```

#### 用户会话缓存
```typescript
// 用户认证状态 - TTL: 24小时
await env.USER_CACHE.put(`session:${sessionId}`, JSON.stringify(userSession), {
  expirationTtl: 86400
})

// 用户游戏记录 - TTL: 10分钟
await env.USER_CACHE.put(`user:${userId}:games`, JSON.stringify(userGames), {
  expirationTtl: 600
})
```

#### 统计数据缓存
```typescript
// 数据库统计 - TTL: 5分钟
await env.STATS_CACHE.put('db:stats', JSON.stringify(dbStats), {
  expirationTtl: 300
})

// API 使用统计 - TTL: 1分钟
await env.STATS_CACHE.put('api:usage', JSON.stringify(apiUsage), {
  expirationTtl: 60
})
```

### 2. KV 命名空间设计

#### GAME_CACHE (游戏数据缓存)
- `game:{title_id}` → 完整游戏信息
- `games:search:{query_hash}` → 搜索结果
- `games:popular` → 热门游戏列表
- `games:recent` → 最新游戏列表
- `games:genre:{genre}` → 分类游戏列表

#### USER_CACHE (用户数据缓存)
- `session:{session_id}` → 用户会话信息
- `user:{user_id}:profile` → 用户档案
- `user:{user_id}:games` → 用户游戏记录
- `user:{user_id}:stats` → 用户统计信息

#### STATS_CACHE (统计数据缓存)
- `db:stats` → 数据库统计
- `api:usage:daily` → 每日 API 使用量
- `api:usage:hourly` → 每小时 API 使用量
- `system:health` → 系统健康状态

### 3. 缓存策略

#### 缓存层级
```
请求 → KV 缓存 → D1 数据库 → Nintendo API
  ↓       ↓         ↓           ↓
 <1ms   1-5ms    5-20ms     100-500ms
```

#### TTL 策略
- **静态数据** (游戏信息): 1-24小时
- **动态数据** (用户记录): 5-30分钟
- **实时数据** (统计信息): 1-5分钟
- **会话数据** (认证状态): 1-24小时

#### 缓存更新策略
1. **被动更新**: 缓存过期后重新获取
2. **主动更新**: 数据变更时立即更新缓存
3. **预热策略**: 定期更新热点数据

## 实施方案

### 阶段 1: 基础 KV 集成

#### 1.1 Wrangler 配置更新
```toml
# wrangler.toml
[[kv_namespaces]]
binding = "GAME_CACHE"
id = "your-game-cache-namespace-id"
preview_id = "your-game-cache-preview-id"

[[kv_namespaces]]
binding = "USER_CACHE"
id = "your-user-cache-namespace-id"
preview_id = "your-user-cache-preview-id"

[[kv_namespaces]]
binding = "STATS_CACHE"
id = "your-stats-cache-namespace-id"
preview_id = "your-stats-cache-preview-id"
```

#### 1.2 类型定义更新
```typescript
// src/types.ts
export interface Env {
  DB: D1Database
  GAME_CACHE: KVNamespace
  USER_CACHE: KVNamespace
  STATS_CACHE: KVNamespace
}
```

#### 1.3 缓存服务创建
```typescript
// src/services/cache-service.ts
export class CacheService {
  constructor(
    private gameCache: KVNamespace,
    private userCache: KVNamespace,
    private statsCache: KVNamespace
  ) {}

  // 游戏数据缓存
  async getGame(titleId: string): Promise<GameInfo | null> {
    const cached = await this.gameCache.get(`game:${titleId}`)
    return cached ? JSON.parse(cached) : null
  }

  async setGame(titleId: string, gameData: GameInfo, ttl: number = 3600): Promise<void> {
    await this.gameCache.put(`game:${titleId}`, JSON.stringify(gameData), {
      expirationTtl: ttl
    })
  }

  // 用户数据缓存
  async getUserGames(userId: string): Promise<UserGame[] | null> {
    const cached = await this.userCache.get(`user:${userId}:games`)
    return cached ? JSON.parse(cached) : null
  }

  async setUserGames(userId: string, games: UserGame[], ttl: number = 600): Promise<void> {
    await this.userCache.put(`user:${userId}:games`, JSON.stringify(games), {
      expirationTtl: ttl
    })
  }

  // 统计数据缓存
  async getStats(key: string): Promise<any | null> {
    const cached = await this.statsCache.get(key)
    return cached ? JSON.parse(cached) : null
  }

  async setStats(key: string, data: any, ttl: number = 300): Promise<void> {
    await this.statsCache.put(key, JSON.stringify(data), {
      expirationTtl: ttl
    })
  }
}
```

### 阶段 2: API 端点缓存集成

#### 2.1 游戏查询缓存
```typescript
// src/handlers/games.ts
export async function handleGamesRequest(request: Request, env: Env): Promise<Response> {
  const cacheService = new CacheService(env.GAME_CACHE, env.USER_CACHE, env.STATS_CACHE)
  const userId = getUserIdFromRequest(request)

  // 1. 检查用户游戏记录缓存
  let userGames = await cacheService.getUserGames(userId)

  if (!userGames) {
    // 2. 缓存未命中，从 Nintendo API 获取
    userGames = await fetchUserGamesFromNintendo(userId)

    // 3. 从 D1 获取游戏元数据并增强
    const enhancedGames = await enhanceGamesWithMetadata(userGames, env.DB, cacheService)

    // 4. 缓存结果
    await cacheService.setUserGames(userId, enhancedGames)

    return Response.json(enhancedGames)
  }

  return Response.json(userGames)
}

async function enhanceGamesWithMetadata(
  userGames: UserGame[],
  db: D1Database,
  cache: CacheService
): Promise<EnhancedUserGame[]> {
  const enhanced = []

  for (const game of userGames) {
    // 先检查游戏缓存
    let gameInfo = await cache.getGame(game.titleId)

    if (!gameInfo) {
      // 从 D1 查询游戏信息
      gameInfo = await db.prepare('SELECT * FROM games WHERE title_id = ?')
        .bind(game.titleId)
        .first()

      if (gameInfo) {
        // 缓存游戏信息
        await cache.setGame(game.titleId, gameInfo)
      }
    }

    enhanced.push({
      ...game,
      name_zh: gameInfo?.name_zh || game.name,
      publisher_name: gameInfo?.publisher_name,
      genre: gameInfo?.genre,
      image_url: gameInfo?.image_url
    })
  }

  return enhanced
}
```

#### 2.2 统计数据缓存
```typescript
// src/handlers/stats.ts
export async function handleStatsRequest(request: Request, env: Env): Promise<Response> {
  const cacheService = new CacheService(env.GAME_CACHE, env.USER_CACHE, env.STATS_CACHE)

  // 检查统计缓存
  let stats = await cacheService.getStats('db:stats')

  if (!stats) {
    // 从 D1 查询统计数据
    const queries = [
      'SELECT COUNT(*) as total FROM games',
      'SELECT COUNT(*) as scraped FROM games WHERE data_source = "scraper"',
      'SELECT COUNT(*) as manual FROM games WHERE data_source = "manual"'
    ]

    const results = await Promise.all(queries.map(sql =>
      env.DB.prepare(sql).first()
    ))

    stats = {
      total_games: results[0]?.total || 0,
      scraped_games: results[1]?.scraped || 0,
      manual_games: results[2]?.manual || 0,
      last_updated: new Date().toISOString()
    }

    // 缓存 5 分钟
    await cacheService.setStats('db:stats', stats, 300)
  }

  return Response.json(stats)
}
```

### 阶段 3: 高级缓存功能

#### 3.1 缓存预热
```typescript
// src/services/cache-warmer.ts
export class CacheWarmer {
  constructor(private cacheService: CacheService, private db: D1Database) {}

  async warmPopularGames(): Promise<void> {
    // 获取热门游戏
    const popularGames = await this.db.prepare(`
      SELECT * FROM games
      ORDER BY updated_at DESC
      LIMIT 100
    `).all()

    // 预热游戏缓存
    for (const game of popularGames.results) {
      await this.cacheService.setGame(game.title_id, game, 7200) // 2小时
    }

    // 缓存热门游戏列表
    await this.cacheService.gameCache.put('games:popular', JSON.stringify(popularGames.results), {
      expirationTtl: 1800 // 30分钟
    })
  }

  async warmStats(): Promise<void> {
    // 预热统计数据
    const stats = await this.calculateStats()
    await this.cacheService.setStats('db:stats', stats, 600) // 10分钟
  }
}
```

#### 3.2 缓存失效策略
```typescript
// src/services/cache-invalidator.ts
export class CacheInvalidator {
  constructor(private cacheService: CacheService) {}

  async invalidateGame(titleId: string): Promise<void> {
    await this.cacheService.gameCache.delete(`game:${titleId}`)
    // 同时失效相关的搜索缓存
    // 这里可以实现更复杂的失效逻辑
  }

  async invalidateUserCache(userId: string): Promise<void> {
    await this.cacheService.userCache.delete(`user:${userId}:games`)
    await this.cacheService.userCache.delete(`user:${userId}:profile`)
  }

  async invalidateStats(): Promise<void> {
    await this.cacheService.statsCache.delete('db:stats')
    await this.cacheService.statsCache.delete('api:usage:daily')
  }
}
```

## 性能预期

### 缓存命中率目标
- **游戏信息查询**: 80-90%
- **用户游戏记录**: 60-70%
- **统计数据**: 95%+

### 响应时间改进
- **缓存命中**: 1-5ms (vs 20-100ms)
- **缓存未命中**: 25-120ms (vs 100-500ms)
- **整体平均**: 预期提升 60-80%

### 成本控制
- **KV 读取**: 每月 1000万次免费
- **KV 写入**: 每月 100万次免费
- **存储**: 1GB 免费
- **预期使用**: 远低于免费额度

## 监控和维护

### 缓存指标监控
```typescript
// src/services/cache-metrics.ts
export class CacheMetrics {
  constructor(private statsCache: KVNamespace) {}

  async recordCacheHit(key: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0]
    const hitKey = `metrics:${today}:hits`

    const current = await this.statsCache.get(hitKey) || '0'
    await this.statsCache.put(hitKey, String(Number.parseInt(current) + 1), {
      expirationTtl: 86400 * 7 // 保留7天
    })
  }

  async recordCacheMiss(key: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0]
    const missKey = `metrics:${today}:misses`

    const current = await this.statsCache.get(missKey) || '0'
    await this.statsCache.put(missKey, String(Number.parseInt(current) + 1), {
      expirationTtl: 86400 * 7
    })
  }

  async getCacheStats(): Promise<CacheStats> {
    const today = new Date().toISOString().split('T')[0]
    const hits = Number.parseInt(await this.statsCache.get(`metrics:${today}:hits`) || '0')
    const misses = Number.parseInt(await this.statsCache.get(`metrics:${today}:misses`) || '0')

    return {
      hits,
      misses,
      hitRate: hits / (hits + misses) || 0,
      date: today
    }
  }
}
```

## 总结

通过集成 Cloudflare KV，nintendo-switch-api 将获得：

✅ **显著的性能提升**: 响应时间减少 60-80%
✅ **更好的用户体验**: 快速的数据加载
✅ **降低数据库负载**: 减少 D1 查询次数
✅ **成本效益**: 完全在免费额度内运行
✅ **高可用性**: 全球边缘缓存
✅ **易于维护**: 自动过期和失效机制

这个方案将 KV 作为高效的缓存层，与现有的 D1 绑定完美配合，为用户提供更快速的 API 响应。

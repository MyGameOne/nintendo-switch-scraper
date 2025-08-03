export interface ScrapedGameInfo {
  titleId: string
  formal_name?: string
  name_zh_hant?: string // 繁体中文名称（从香港网站获取）
  name_zh_hans?: string // 简体中文名称（预留）
  name_en?: string // 英文名称（预留）
  name_ja?: string // 日文名称（预留）
  catch_copy?: string // 宣传语
  description?: string
  publisher_name?: string
  publisher_id?: number
  genre?: string
  release_date?: string
  hero_banner_url?: string
  screenshots?: string[] // 截图数组
  platform?: string
  languages?: any[] // 语言数组
  player_number?: any // 游玩人数对象
  play_styles?: any[] // 游玩模式数组
  rom_size?: number
  rating_age?: number
  rating_name?: string
  in_app_purchase?: boolean
  cloud_backup_type?: string
  region?: string
  data_source?: string // 数据来源
  notes?: string // 备注
}

export interface CloudflareEnv {
  CLOUDFLARE_API_TOKEN: string
  CLOUDFLARE_ACCOUNT_ID: string
  CLOUDFLARE_D1_DATABASE_ID: string
  CLOUDFLARE_KV_GAME_IDS_ID: string
}

// 用于 Drizzle ORM 的类型
export interface GameInsert {
  titleId: string
  formalName?: string
  nameZhHant?: string
  nameZhHans?: string
  nameEn?: string
  nameJa?: string
  catchCopy?: string
  description?: string
  publisherName?: string
  publisherId?: number
  genre?: string
  releaseDate?: string
  heroBannerUrl?: string
  screenshots?: string // JSON string
  platform?: string
  languages?: string // JSON string
  playerNumber?: string // JSON string
  playStyles?: string // JSON string
  romSize?: number
  ratingAge?: number
  ratingName?: string
  inAppPurchase?: boolean
  cloudBackupType?: string
  region?: string
  dataSource?: string
  notes?: string
}

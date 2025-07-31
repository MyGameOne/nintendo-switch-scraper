import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const games = sqliteTable('games', {
  titleId: text('title_id').primaryKey(),
  formalName: text('formal_name'),
  nameZhHant: text('name_zh_hant'),
  nameZhHans: text('name_zh_hans'),
  nameEn: text('name_en'),
  nameJa: text('name_ja'),
  catchCopy: text('catch_copy'),
  description: text('description'),
  publisherName: text('publisher_name'),
  publisherId: integer('publisher_id'),
  genre: text('genre'),
  releaseDate: text('release_date'),
  heroBannerUrl: text('hero_banner_url'),
  screenshots: text('screenshots'), // JSON string
  platform: text('platform').default('HAC'),
  languages: text('languages'), // JSON string
  playerNumber: text('player_number'), // JSON string
  playStyles: text('play_styles'), // JSON string
  romSize: integer('rom_size'),
  ratingAge: integer('rating_age'),
  ratingName: text('rating_name'),
  inAppPurchase: integer('in_app_purchase', { mode: 'boolean' }).default(false),
  cloudBackupType: text('cloud_backup_type'),
  region: text('region').default('HK'),
  dataSource: text('data_source').default('scraper'),
  notes: text('notes'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;

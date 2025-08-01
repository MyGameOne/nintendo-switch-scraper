#!/usr/bin/env node

import { execSync } from 'child_process';
import path from 'path';

console.log('🎮 Nintendo Switch 游戏爬虫');
console.log('');

// 运行爬虫脚本
try {
  const scriptPath = path.join(process.cwd(), 'scripts/scrape.ts');
  execSync(`npx tsx ${scriptPath}`, { stdio: 'inherit' });
} catch (error) {
  console.error('❌ 爬虫执行失败:', error);
  process.exit(1);
}
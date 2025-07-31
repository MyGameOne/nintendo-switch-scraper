import dotenv from 'dotenv';
import { D1Uploader } from '../src/scraper/d1-uploader';

dotenv.config();

async function testDbConnection() {
  console.log('🔧 测试 Cloudflare D1 数据库连接...\n');
  
  // 验证环境变量
  const requiredEnvs = [
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ACCOUNT_ID', 
    'CLOUDFLARE_D1_DATABASE_ID'
  ];
  
  const missing = requiredEnvs.filter(env => !process.env[env]);
  if (missing.length > 0) {
    console.error('❌ 缺少环境变量:', missing.join(', '));
    console.error('请检查 .env 文件配置');
    process.exit(1);
  }

  console.log('✅ 环境变量检查通过');
  console.log(`📋 配置信息:`);
  console.log(`   Account ID: ${process.env.CLOUDFLARE_ACCOUNT_ID}`);
  console.log(`   Database ID: ${process.env.CLOUDFLARE_D1_DATABASE_ID}`);
  console.log(`   API Token: ${process.env.CLOUDFLARE_API_TOKEN?.substring(0, 10)}...`);
  console.log('');

  // 测试连接
  const uploader = new D1Uploader({
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN!,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID!,
    CLOUDFLARE_D1_DATABASE_ID: process.env.CLOUDFLARE_D1_DATABASE_ID!
  });

  const isConnected = await uploader.testConnection();
  
  if (isConnected) {
    console.log('🎉 数据库连接测试成功！');
  } else {
    console.log('❌ 数据库连接测试失败！');
    process.exit(1);
  }
}

testDbConnection().catch(console.error);
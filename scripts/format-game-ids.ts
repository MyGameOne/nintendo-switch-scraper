import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

function formatGameIds() {
  const gameIdsPath = path.join(process.cwd(), 'data/game-ids.json')

  console.log('🔧 格式化 game-ids.json 文件...')

  // 检查文件是否存在
  if (!fs.existsSync(gameIdsPath)) {
    console.error('❌ data/game-ids.json 文件不存在')
    process.exit(1)
  }

  let gameIds: any

  try {
    // 读取并解析 JSON
    const content = fs.readFileSync(gameIdsPath, 'utf8')
    gameIds = JSON.parse(content)
  }
  catch (error) {
    console.error('❌ JSON 格式无效:', error)
    process.exit(1)
  }

  // 检查是否为数组
  if (!Array.isArray(gameIds)) {
    console.error('❌ 必须是数组格式')
    process.exit(1)
  }

  // 格式化处理
  const formatted = gameIds
    .map((id: string) => id.toLowerCase()) // 转换为小写
    .filter((id: string, index: number, arr: string[]) => arr.indexOf(id) === index) // 去重
    .sort() // 排序

  // 写回文件
  const formattedJson = JSON.stringify(formatted, null, 2)
  fs.writeFileSync(gameIdsPath, `${formattedJson}\n`, 'utf8')

  console.log('✅ game-ids.json 已格式化')
  console.log('📊 处理结果:')
  console.log(`   - 原始数量: ${gameIds.length}`)
  console.log(`   - 格式化后: ${formatted.length}`)

  if (gameIds.length !== formatted.length) {
    console.log(`   - 去重: ${gameIds.length - formatted.length} 个`)
  }

  console.log('   - 排序: 已按字母顺序排列')
  console.log('   - 大小写: 已统一为小写')
}

formatGameIds()

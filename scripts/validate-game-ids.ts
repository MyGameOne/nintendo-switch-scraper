import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

function validateGameIds() {
  const gameIdsPath = path.join(process.cwd(), 'data/game-ids.json')

  console.log('🔍 验证 game-ids.json 文件...')

  // 检查文件是否存在
  if (!fs.existsSync(gameIdsPath)) {
    console.error('❌ data/game-ids.json 文件不存在')
    process.exit(1)
  }

  let gameIds: any

  try {
    // 验证 JSON 格式
    const content = fs.readFileSync(gameIdsPath, 'utf8')
    gameIds = JSON.parse(content)
    console.log('✅ JSON 格式验证通过')
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

  console.log(`📋 游戏 ID 数量: ${gameIds.length}`)

  if (gameIds.length === 0) {
    console.log('⚠️ 数组为空')
    return
  }

  // 验证游戏 ID 格式（16位十六进制）
  console.log('🔍 验证游戏 ID 格式...')
  const hexPattern = /^[0-9a-f]{16}$/i
  const invalidIds: string[] = []

  for (const id of gameIds) {
    if (typeof id !== 'string' || !hexPattern.test(id)) {
      invalidIds.push(id)
    }
  }

  if (invalidIds.length > 0) {
    console.error('❌ 发现无效的游戏 ID 格式:')
    invalidIds.forEach(id => console.error(`   ${id}`))
    console.error('')
    console.error('💡 游戏 ID 必须是 16 位十六进制字符串，例如: 0100000000010000')
    process.exit(1)
  }

  // 检查重复的游戏 ID
  console.log('🔍 检查重复的游戏 ID...')
  const uniqueIds = new Set(gameIds)
  if (uniqueIds.size !== gameIds.length) {
    const duplicates: string[] = []
    const seen = new Set()

    for (const id of gameIds) {
      if (seen.has(id)) {
        duplicates.push(id)
      }
      else {
        seen.add(id)
      }
    }

    console.error('❌ 发现重复的游戏 ID:');
    [...new Set(duplicates)].forEach(id => console.error(`   ${id}`))
    process.exit(1)
  }

  // 检查大小写一致性（建议使用小写）
  console.log('🔍 检查大小写一致性...')
  const mixedCaseIds = gameIds.filter((id: string) => /[A-F]/.test(id))
  if (mixedCaseIds.length > 0) {
    console.log('⚠️ 建议使用小写字母:')
    mixedCaseIds.forEach((id: string) => console.log(`   ${id}`))
    console.log('')
    console.log('💡 虽然大写字母有效，但建议统一使用小写以保持一致性')
  }

  console.log('✅ 所有验证通过！')
  console.log('📊 统计信息:')
  console.log(`   - 总数量: ${gameIds.length}`)
  console.log('   - 格式: 16位十六进制')
  console.log('   - 重复: 无')
}

validateGameIds()

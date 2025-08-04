# Nintendo Switch 爬虫数据优化设计文档

## 设计概述

本设计文档描述了如何以最小的破坏性影响来优化Nintendo Switch游戏爬虫的数据提取逻辑。

## 架构设计

### 系统组件
1. **爬虫服务** (nintendo-switch-scraper)
2. **API服务** (nintendo-switch-api) 
3. **管理后台** (nintendo-switch-admin)
4. **D1数据库** (Cloudflare D1)

### 数据流
```
Nintendo eShop → 爬虫 → D1数据库 → API → 管理后台
```

## 数据库设计

### 新增字段
```sql
-- 只添加一个新字段，保持最小化
ALTER TABLE games ADD COLUMN platform_name TEXT;
```

### 字段映射
| 数据库字段 | 数据源 | 说明 |
|-----------|--------|------|
| `rom_size` | 智能选择 | 优先BEE平台，回退到HAC |
| `platform` | `label_platform` | 保持不变（HAC/BEE） |
| `platform_name` | `platform.name` | 新增友好名称 |
| `screenshots` | 清理后的数组 | 过滤无效URL |

## 核心算法设计

### 1. 智能容量获取算法

```typescript
function getRomSize(romSizeInfos: any[]): number | undefined {
  if (!Array.isArray(romSizeInfos) || romSizeInfos.length === 0) {
    return undefined;
  }

  // 优先级：BEE > HAC > 任何有数据的平台
  const priorities = ['BEE', 'HAC'];
  
  for (const platform of priorities) {
    const info = romSizeInfos.find(
      item => item.platform === platform && 
              typeof item.total_rom_size === 'number' && 
              item.total_rom_size > 0
    );
    if (info) {
      return info.total_rom_size;
    }
  }
  
  // 回退：选择任何有效的容量信息
  const fallback = romSizeInfos.find(
    item => typeof item.total_rom_size === 'number' && 
            item.total_rom_size > 0
  );
  
  return fallback?.total_rom_size;
}
```

### 2. 截图数据清理算法

```typescript
function getCleanScreenshots(screenshots: any[]): string[] {
  if (!Array.isArray(screenshots)) {
    return [];
  }

  return screenshots
    .map(screenshot => {
      // 提取URL
      const url = screenshot?.images?.[0]?.url;
      return typeof url === 'string' && url.startsWith('https://') ? url : null;
    })
    .filter((url): url is string => url !== null);
}
```

### 3. 平台名称获取

```typescript
function getPlatformInfo(data: any) {
  return {
    platform: data.label_platform, // 保持原有字段
    platform_name: data.platform?.name || data.label_platform // 新增字段
  };
}
```

## API设计

### 响应结构兼容性

```typescript
// API响应保持向后兼容
interface GameResponse {
  // 现有字段保持不变
  title_id: string;
  formal_name?: string;
  platform?: string; // HAC/BEE
  rom_size?: number; // 优化后的智能获取
  screenshots?: string; // JSON字符串，内容已清理
  
  // 新增字段
  platform_name?: string; // "Nintendo Switch" / "Nintendo Switch 2"
}
```

## 实施策略

### 阶段1: 爬虫优化 (1-2天)
1. 修改 `game-scraper.ts` 中的数据提取逻辑
2. 更新 `ScrapedGameInfo` 类型定义
3. 添加数据验证和错误处理
4. 本地测试验证

### 阶段2: 数据库迁移 (1天)
1. 添加 `platform_name` 字段到D1数据库
2. 创建数据迁移脚本
3. 测试迁移脚本

### 阶段3: API适配 (1天)
1. 更新API服务以支持新字段
2. 确保向后兼容性
3. 更新类型定义

### 阶段4: 前端适配 (1-2天)
1. 更新管理后台以显示新字段
2. 优化容量显示逻辑
3. 测试界面兼容性

### 阶段5: 数据重新爬取 (根据数据量)
1. 批量重新爬取现有游戏
2. 验证数据质量
3. 监控系统性能

## 错误处理策略

### 数据提取错误
- 容量获取失败：记录警告，存储null
- 截图获取失败：返回空数组
- 平台名称缺失：使用技术代号作为回退

### 数据库错误
- 字段缺失：使用默认值
- 类型不匹配：数据转换或跳过

### API错误
- 新字段缺失：不影响现有功能
- 数据格式变化：保持向后兼容

## 测试策略

### 单元测试
- 容量获取算法测试
- 截图清理算法测试
- 数据验证逻辑测试

### 集成测试
- 爬虫端到端测试
- API响应格式测试
- 数据库迁移测试

### 用户验收测试
- 管理后台功能测试
- 数据显示准确性测试
- 性能回归测试

## 监控和回滚

### 监控指标
- 数据提取成功率
- API响应时间
- 数据库查询性能
- 错误日志数量

### 回滚策略
- 数据库字段可以安全删除
- 爬虫逻辑可以快速回退
- API兼容性确保无缝回滚

## 性能考虑

### 爬虫性能
- 新算法复杂度：O(n)，n为平台数量（通常≤2）
- 内存使用：无显著增加
- 网络请求：无额外请求

### 数据库性能
- 新字段不影响现有查询
- 索引策略保持不变
- 存储空间增加：约5%

### API性能
- 响应大小略微增加
- 序列化时间无显著影响
- 缓存策略保持有效

## 安全考虑

### 数据验证
- URL格式验证
- 数据类型检查
- 输入长度限制

### 错误信息
- 不暴露内部结构
- 记录详细日志用于调试
- 用户友好的错误消息
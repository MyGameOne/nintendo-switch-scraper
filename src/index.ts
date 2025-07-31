import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { cors } from 'hono/cors';
import dotenv from 'dotenv';
import { createDbConnection } from './db/connection';
import { GameService } from './services/game-service';

dotenv.config();

const app = new Hono();

// 中间件
app.use('*', cors());
app.use('/static/*', serveStatic({ root: './' }));

// 模拟 D1 连接（用于本地开发）
const mockD1 = {
  prepare: (query: string) => ({
    bind: (...values: any[]) => ({
      first: async () => ({}),
      all: async () => ({ results: [] }),
      run: async () => ({})
    })
  })
};

const db = createDbConnection(mockD1 as any);
const gameService = new GameService(db);

// 首页 - 游戏管理界面
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Nintendo Switch 游戏数据库管理</title>
      <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
      <script src="https://unpkg.com/axios/dist/axios.min.js"></script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
        .stat-number { font-size: 2em; font-weight: bold; color: #667eea; }
        .controls { background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .search-box { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 16px; }
        .btn { padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; margin: 5px; }
        .btn-primary { background: #667eea; color: white; }
        .btn-success { background: #28a745; color: white; }
        .btn-danger { background: #dc3545; color: white; }
        .btn-secondary { background: #6c757d; color: white; }
        .games-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
        .game-card { background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); transition: transform 0.2s; }
        .game-card:hover { transform: translateY(-5px); }
        .game-image { width: 100%; height: 200px; object-fit: cover; background: #f0f0f0; }
        .game-info { padding: 20px; }
        .game-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; color: #333; }
        .game-meta { color: #666; font-size: 14px; margin-bottom: 5px; }
        .game-actions { padding: 15px 20px; border-top: 1px solid #eee; display: flex; gap: 10px; }
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; }
        .modal.show { display: flex; align-items: center; justify-content: center; }
        .modal-content { background: white; padding: 30px; border-radius: 10px; width: 90%; max-width: 600px; max-height: 80vh; overflow-y: auto; }
        .form-group { margin-bottom: 20px; }
        .form-label { display: block; margin-bottom: 5px; font-weight: bold; }
        .form-input { width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 5px; }
        .form-textarea { min-height: 100px; resize: vertical; }
        .loading { text-align: center; padding: 50px; color: #666; }
      </style>
    </head>
    <body>
      <div id="app">
        <div class="container">
          <!-- 头部 -->
          <div class="header">
            <h1>🎮 Nintendo Switch 游戏数据库管理</h1>
            <p>管理你的 Nintendo Switch 游戏数据库，支持爬虫自动获取和手动编辑</p>
          </div>

          <!-- 统计信息 -->
          <div class="stats">
            <div class="stat-card">
              <div class="stat-number">{{ stats.total }}</div>
              <div>总游戏数</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">{{ stats.scraped }}</div>
              <div>爬虫获取</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">{{ stats.manual }}</div>
              <div>手动添加</div>
            </div>
          </div>

          <!-- 控制面板 -->
          <div class="controls">
            <div style="display: flex; gap: 15px; align-items: center; flex-wrap: wrap;">
              <input 
                v-model="searchQuery" 
                @input="searchGames"
                class="search-box" 
                placeholder="搜索游戏名称、发行商..."
                style="flex: 1; min-width: 300px;"
              >
              <button @click="showAddModal" class="btn btn-success">➕ 添加游戏</button>
              <button @click="runScraper" class="btn btn-primary">🕷️ 运行爬虫</button>
              <button @click="loadGames" class="btn btn-secondary">🔄 刷新</button>
            </div>
          </div>

          <!-- 游戏列表 -->
          <div v-if="loading" class="loading">
            <div>加载中...</div>
          </div>

          <div v-else class="games-grid">
            <div v-for="game in games" :key="game.titleId" class="game-card">
              <img 
                :src="game.heroBannerUrl || '/static/placeholder.jpg'" 
                :alt="game.nameZhHant || game.formalName"
                class="game-image"
                @error="$event.target.src='/static/placeholder.jpg'"
              >
              <div class="game-info">
                <div class="game-title">{{ game.nameZhHant || game.formalName || game.titleId }}</div>
                <div class="game-meta">发行商: {{ game.publisherName || '未知' }}</div>
                <div class="game-meta">类型: {{ game.genre || '未知' }}</div>
                <div class="game-meta">发布日期: {{ game.releaseDate || '未知' }}</div>
                <div class="game-meta">数据来源: {{ game.dataSource === 'scraper' ? '爬虫' : '手动' }}</div>
              </div>
              <div class="game-actions">
                <button @click="editGame(game)" class="btn btn-primary">✏️ 编辑</button>
                <button @click="deleteGame(game.titleId)" class="btn btn-danger">🗑️ 删除</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 添加/编辑游戏模态框 -->
        <div class="modal" :class="{ show: showModal }">
          <div class="modal-content">
            <h2>{{ editingGame ? '编辑游戏' : '添加游戏' }}</h2>
            <form @submit.prevent="saveGame">
              <div class="form-group">
                <label class="form-label">游戏 ID *</label>
                <input v-model="gameForm.titleId" class="form-input" :disabled="editingGame" required>
              </div>
              <div class="form-group">
                <label class="form-label">正式名称</label>
                <input v-model="gameForm.formalName" class="form-input">
              </div>
              <div class="form-group">
                <label class="form-label">繁体中文名称</label>
                <input v-model="gameForm.nameZhHant" class="form-input">
              </div>
              <div class="form-group">
                <label class="form-label">简体中文名称</label>
                <input v-model="gameForm.nameZhHans" class="form-input">
              </div>
              <div class="form-group">
                <label class="form-label">英文名称</label>
                <input v-model="gameForm.nameEn" class="form-input">
              </div>
              <div class="form-group">
                <label class="form-label">日文名称</label>
                <input v-model="gameForm.nameJa" class="form-input">
              </div>
              <div class="form-group">
                <label class="form-label">发行商</label>
                <input v-model="gameForm.publisherName" class="form-input">
              </div>
              <div class="form-group">
                <label class="form-label">游戏类型</label>
                <input v-model="gameForm.genre" class="form-input">
              </div>
              <div class="form-group">
                <label class="form-label">发布日期</label>
                <input v-model="gameForm.releaseDate" class="form-input" type="date">
              </div>
              <div class="form-group">
                <label class="form-label">游戏描述</label>
                <textarea v-model="gameForm.description" class="form-input form-textarea"></textarea>
              </div>
              <div class="form-group">
                <label class="form-label">备注</label>
                <textarea v-model="gameForm.notes" class="form-input form-textarea"></textarea>
              </div>
              <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button type="button" @click="closeModal" class="btn btn-secondary">取消</button>
                <button type="submit" class="btn btn-success">保存</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <script>
        const { createApp } = Vue;
        
        createApp({
          data() {
            return {
              games: [],
              stats: { total: 0, scraped: 0, manual: 0 },
              loading: false,
              searchQuery: '',
              showModal: false,
              editingGame: null,
              gameForm: this.getEmptyForm()
            }
          },
          methods: {
            getEmptyForm() {
              return {
                titleId: '',
                formalName: '',
                nameZhHant: '',
                nameZhHans: '',
                nameEn: '',
                nameJa: '',
                publisherName: '',
                genre: '',
                releaseDate: '',
                description: '',
                notes: '',
                dataSource: 'manual'
              };
            },
            async loadGames() {
              this.loading = true;
              try {
                const response = await axios.get('/api/games');
                this.games = response.data.games;
                this.stats = response.data.stats;
              } catch (error) {
                alert('加载游戏列表失败: ' + error.message);
              }
              this.loading = false;
            },
            async searchGames() {
              if (!this.searchQuery.trim()) {
                this.loadGames();
                return;
              }
              
              this.loading = true;
              try {
                const response = await axios.get('/api/games/search', {
                  params: { q: this.searchQuery }
                });
                this.games = response.data.games;
              } catch (error) {
                alert('搜索失败: ' + error.message);
              }
              this.loading = false;
            },
            showAddModal() {
              this.editingGame = null;
              this.gameForm = this.getEmptyForm();
              this.showModal = true;
            },
            editGame(game) {
              this.editingGame = game;
              this.gameForm = { ...game };
              this.showModal = true;
            },
            closeModal() {
              this.showModal = false;
              this.editingGame = null;
              this.gameForm = this.getEmptyForm();
            },
            async saveGame() {
              try {
                if (this.editingGame) {
                  await axios.put('/api/games/' + this.gameForm.titleId, this.gameForm);
                } else {
                  await axios.post('/api/games', this.gameForm);
                }
                this.closeModal();
                this.loadGames();
                alert('保存成功！');
              } catch (error) {
                alert('保存失败: ' + error.response?.data?.error || error.message);
              }
            },
            async deleteGame(titleId) {
              if (!confirm('确定要删除这个游戏吗？')) return;
              
              try {
                await axios.delete('/api/games/' + titleId);
                this.loadGames();
                alert('删除成功！');
              } catch (error) {
                alert('删除失败: ' + error.message);
              }
            },
            async runScraper() {
              if (!confirm('确定要运行爬虫吗？这可能需要一些时间。')) return;
              
              try {
                const response = await axios.post('/api/scraper/run');
                alert('爬虫已启动: ' + response.data.message);
              } catch (error) {
                alert('启动爬虫失败: ' + error.message);
              }
            }
          },
          mounted() {
            this.loadGames();
          }
        }).mount('#app');
      </script>
    </body>
    </html>
  `);
});

// API 路由
app.get('/api/games', async (c) => {
  try {
    const games = await gameService.getAllGames();
    const stats = await gameService.getStats();
    return c.json({ games, stats });
  } catch (error) {
    return c.json({ error: 'Failed to load games' }, 500);
  }
});

app.get('/api/games/search', async (c) => {
  try {
    const query = c.req.query('q') || '';
    const games = await gameService.searchGames(query);
    return c.json({ games });
  } catch (error) {
    return c.json({ error: 'Search failed' }, 500);
  }
});

app.post('/api/games', async (c) => {
  try {
    const gameData = await c.req.json();
    const result = await gameService.createGame(gameData);
    return c.json({ game: result[0] });
  } catch (error) {
    return c.json({ error: 'Failed to create game' }, 500);
  }
});

app.put('/api/games/:id', async (c) => {
  try {
    const titleId = c.req.param('id');
    const gameData = await c.req.json();
    const result = await gameService.updateGame(titleId, gameData);
    return c.json({ game: result[0] });
  } catch (error) {
    return c.json({ error: 'Failed to update game' }, 500);
  }
});

app.delete('/api/games/:id', async (c) => {
  try {
    const titleId = c.req.param('id');
    await gameService.deleteGame(titleId);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: 'Failed to delete game' }, 500);
  }
});

app.post('/api/scraper/run', async (c) => {
  // 这里可以触发爬虫脚本
  return c.json({ message: '爬虫任务已加入队列，请查看控制台日志' });
});

const port = parseInt(process.env.PORT || '3000');
console.log(`🚀 Nintendo Switch 游戏数据库管理系统启动`);
console.log(`🌐 Web 界面: http://localhost:${port}`);
console.log(`📊 API 文档: http://localhost:${port}/api/games`);

serve({
  fetch: app.fetch,
  port,
});

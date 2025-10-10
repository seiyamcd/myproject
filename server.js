import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import 'dotenv/config'
import mysql from 'mysql2/promise'  // ← 追加

// MySQL 接続プール
const pool = mysql.createPool({
  host: process.env.DB_HOST ?? 'localhost',
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'myapp',
  namedPlaceholders: true,
  connectionLimit: 5,
})

const app = new Hono()

// ヘルスチェック
app.get('/health', (c) => c.json({ ok: true }))

// 一覧：DBから取得
//  GET/categoriesが来たら非同期関数実行。アクセス時間かかるため。
app.get('/categories', async (c) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, created_at FROM categories ORDER BY id ASC'
    )
    return c.json({ ok: true, items: rows, total: rows.length })
  } catch (e) {
    console.error('[GET /categories]', e)
    return c.json({ ok: false, error: 'database error' }, 500)
  }
})

// 1件：DBから取得
app.get('/categories/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) {
    return c.json({ ok: false, error: { code: 'BAD_REQUEST', message: 'id must be a number' } }, 400)
  }
  try {
    const [rows] = await pool.query(
      'SELECT id, name, created_at FROM categories WHERE id = :id',
      { id }
    )
    if (rows.length === 0) {
      return c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'category not found' } }, 404)
    }
    return c.json({ ok: true, item: rows[0] })
  } catch (e) {
    console.error('[GET /categories/:id]', e)
    return c.json({ ok: false, error: 'database error' }, 500)
  }
})

//カテゴリ追加API
app.post('/admin/categories',async(c)) =>{
  //クライアントから送られたjsのボディを取得
  const body =await c.req.json()
  const name =body.name

  //DBにinsert
  const [result]=await pool.query(
   'INSERT INTO categories(name)VALUES(:name)'
   {name} 
  )
  //レスポンスを返す
  rettuen c.json({ok:true,id:result.insertId},201)
}

serve({ fetch: app.fetch, port: 3000 }, (info) => {
  console.log(`🚀 Hono API running at http://localhost:${info.port}`)
})


import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import 'dotenv/config'
import mysql from 'mysql2/promise'

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

app.use('/*', cors({
  origin: ['http://localhost:5173'], // フロントエンドのURL
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['POST', 'GET', 'OPTIONS', 'DELETE', 'PUT'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}));

// ヘルスチェック
app.get('/health', (c) => c.json({ ok: true }))

// カテゴリ一覧：DBから取得
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

// カテゴリ1件：DBから取得
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

// カテゴリ追加API
app.post('/admin/categories', async (c) => {
  const body = await c.req.json()
  const name = body.name
  const [result] = await pool.query(
    'INSERT INTO categories(name) VALUES(:name)',
    { name }
  )
  return c.json({ ok: true, id: result.insertId }, 201)
})

// X APIからPost取得してDBに保存
app.post('/admin/fetch-posts', async (c) => {
  try {
    const bearerToken = process.env.X_BEARER_TOKEN
    
    if (!bearerToken) {
      return c.json({ ok: false, error: 'X_BEARER_TOKEN not found' }, 500)
    }

    // X APIを叩く（例: 特定ユーザーのツイート取得）
    const username = 'elonmusk' // テスト用。後で変更可能
    const url = `https://api.twitter.com/2/tweets/search/recent?query=from:${username}&max_results=10&tweet.fields=created_at`
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${bearerToken}`
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('X API Error:', errorText)
      return c.json({ ok: false, error: 'X API request failed', details: errorText }, response.status)
    }

    const data = await response.json()
    
    // DBに保存
    let savedCount = 0
    if (data.data && data.data.length > 0) {
      for (const tweet of data.data) {
        // ISO日時をMySQLのDATETIME形式に変換
        const mysqlDatetime = tweet.created_at.replace('T', ' ').replace(/\.\d{3}Z$/, '')
        
        await pool.query(
          'INSERT INTO posts (id_str, text, created_at_x) VALUES (:id_str, :text, :created_at_x) ON DUPLICATE KEY UPDATE text = :text',
          {
            id_str: tweet.id,
            text: tweet.text,
            created_at_x: mysqlDatetime
          }
        )
        savedCount++
      }
    }

    return c.json({ 
      ok: true, 
      fetched: data.data?.length || 0,
      saved: savedCount,
      tweets: data.data 
    })

  } catch (e) {
    console.error('[POST /admin/fetch-posts]', e)
    return c.json({ ok: false, error: 'Internal server error' }, 500)
  }
})

// ============ POSTとカテゴリの紐付け ============
app.post('/admin/categories/:id/posts', async (c) => {
  try {
    const categoryId = Number(c.req.param('id'))
    const body = await c.req.json()
    const postIds = body.post_ids
    
    if (Number.isNaN(categoryId)) {
      return c.json({ ok: false, error: 'category id must be a number' }, 400)
    }
    
    if (!Array.isArray(postIds) || postIds.length === 0) {
      return c.json({ ok: false, error: 'post_ids must be a non-empty array' }, 400)
    }
    
    const [categories] = await pool.query(
      'SELECT id FROM categories WHERE id = :id',
      { id: categoryId }
    )
    
    if (categories.length === 0) {
      return c.json({ ok: false, error: 'category not found' }, 404)
    }
    
    let linkedCount = 0
    for (const postId of postIds) {
      const [posts] = await pool.query(
        'SELECT id FROM posts WHERE id = :id',
        { id: postId }
      )
      
      if (posts.length === 0) {
        continue
      }
      
      await pool.query(
        'INSERT IGNORE INTO post_categories (post_id, category_id) VALUES (:post_id, :category_id)',
        { post_id: postId, category_id: categoryId }
      )
      linkedCount++
    }
    
    return c.json({ ok: true, linked: linkedCount })
    
  } catch (e) {
    console.error('[POST /admin/categories/:id/posts]', e)
    return c.json({ ok: false, error: 'database error' }, 500)
  }
})

// ============ POST一覧取得 ============
app.get('/admin/posts', async (c) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, id_str, text, created_at_x, created_at FROM posts ORDER BY created_at_x DESC'
    )
    
    return c.json({ ok: true, items: rows, total: rows.length })
    
  } catch (e) {
    console.error('[GET /admin/posts]', e)
    return c.json({ ok: false, error: 'database error' }, 500)
  }
})

// ============ POST詳細取得 ============
app.get('/admin/posts/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    
    if (Number.isNaN(id)) {
      return c.json({ ok: false, error: 'id must be a number' }, 400)
    }
    
    const [rows] = await pool.query(
      'SELECT id, id_str, text, created_at_x, created_at FROM posts WHERE id = :id',
      { id }
    )
    
    if (rows.length === 0) {
      return c.json({ ok: false, error: 'post not found' }, 404)
    }
    
    return c.json({ ok: true, item: rows[0] })
    
  } catch (e) {
    console.error('[GET /admin/posts/:id]', e)
    return c.json({ ok: false, error: 'database error' }, 500)
  }
})

// ============ カテゴリに紐づくPOST一覧取得 ============
app.get('/categories/:id/posts', async (c) => {
  try {
    const categoryId = Number(c.req.param('id'))
    
    if (Number.isNaN(categoryId)) {
      return c.json({ ok: false, error: 'category id must be a number' }, 400)
    }
    
    const [categories] = await pool.query(
      'SELECT id, name FROM categories WHERE id = :id',
      { id: categoryId }
    )
    
    if (categories.length === 0) {
      return c.json({ ok: false, error: 'category not found' }, 404)
    }
    
    const [posts] = await pool.query(
      `SELECT p.id, p.id_str, p.text, p.created_at_x, p.created_at
       FROM posts p
       INNER JOIN post_categories pc ON p.id = pc.post_id
       WHERE pc.category_id = :category_id
       ORDER BY p.created_at_x DESC`,
      { category_id: categoryId }
    )
    
    return c.json({ 
      ok: true, 
      category: categories[0],
      items: posts, 
      total: posts.length 
    })
    
  } catch (e) {
    console.error('[GET /categories/:id/posts]', e)
    return c.json({ ok: false, error: 'database error' }, 500)
  }
})

serve({ fetch: app.fetch, port: 3000 }, (info) => {
  console.log(`🚀 Hono API running at http://localhost:${info.port}`)
})
-- 既存のテーブルがあれば削除（初期化用）
DROP TABLE IF EXISTS post_categories;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS categories;

-- 1. カテゴリテーブル
CREATE TABLE categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. ツイート（POST）テーブル
CREATE TABLE posts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_str VARCHAR(255) UNIQUE NOT NULL, -- Twitter側のID
  text TEXT,
  created_at_x DATETIME, -- ツイート自体の投稿日時
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- DB保存日時
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. 中間テーブル（紐付け用）
CREATE TABLE post_categories (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  post_id BIGINT NOT NULL,
  category_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  UNIQUE KEY unique_link (post_id, category_id) -- 重複紐付け防止
);
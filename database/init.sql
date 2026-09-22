-- 表结构与后端 TypeORM 实体保持一致，避免 synchronize 启动时重建表
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  nickname VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  bio TEXT,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY IDX_97672ac88f789774dd47f7c8be (email)
);

CREATE TABLE IF NOT EXISTS trips (
  id INT PRIMARY KEY AUTO_INCREMENT,
  owner_id INT NOT NULL,
  destination VARCHAR(255) NOT NULL,
  depart_date DATE NOT NULL,
  days INT NOT NULL,
  budget_min DECIMAL(12,2),
  budget_max DECIMAL(12,2),
  transport VARCHAR(255) NOT NULL,
  companion_count INT NOT NULL,
  gender_preference VARCHAR(255),
  status VARCHAR(255) NOT NULL DEFAULT 'OPEN'
);

CREATE TABLE IF NOT EXISTS trip_days (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  trip_id BIGINT NOT NULL,
  day_no INT NOT NULL,
  title VARCHAR(160),
  lodging VARCHAR(160),
  transport_plan VARCHAR(160)
);

CREATE TABLE IF NOT EXISTS trip_budget_categories (
  id INT PRIMARY KEY AUTO_INCREMENT,
  trip_id INT NOT NULL,
  category VARCHAR(20) NOT NULL,
  quota DECIMAL(12,2) NOT NULL DEFAULT 0,
  used DECIMAL(12,2) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_trip_category (trip_id, category)
);

CREATE TABLE IF NOT EXISTS trip_expenses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  trip_id INT NOT NULL,
  category VARCHAR(20) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  note VARCHAR(255),
  member_id INT,
  member_name VARCHAR(80) NOT NULL,
  idempotency_key VARCHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uk_trip_expense_idem (trip_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS trip_budget_transfers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  trip_id INT NOT NULL,
  from_category VARCHAR(20) NOT NULL,
  to_category VARCHAR(20) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  operator_id INT NOT NULL,
  idempotency_key VARCHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uk_trip_transfer_idem (trip_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS diary_entries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  trip_id BIGINT NOT NULL,
  title VARCHAR(160) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 演示数据：演示账号 demo@tripmatch.cn / demo123456，及其名下的演示行程与分类额度
INSERT IGNORE INTO users (id, email, nickname, bio, password_hash) VALUES
  (1, 'demo@tripmatch.cn', '演示用户', '旅伴匹配平台演示账号', '$2a$10$Ajith7IQhkMzy1zdKyEvj.2bP/CufH1ZRv4hDb4ZdgJ3DNQRGEL6.');

INSERT IGNORE INTO trips (id, owner_id, destination, depart_date, days, budget_min, budget_max, transport, companion_count, gender_preference, status) VALUES
  (1, 1, '大理', '2026-07-12', 5, 3500, 5200, '公共交通', 3, '不限', 'OPEN');

INSERT IGNORE INTO trip_budget_categories (trip_id, category, quota, used) VALUES
  (1, 'TRANSPORT', 1500, 0),
  (1, 'LODGING', 1800, 0),
  (1, 'FOOD', 1200, 0),
  (1, 'TICKET', 500, 0);

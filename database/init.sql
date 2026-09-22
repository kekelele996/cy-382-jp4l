CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(120) UNIQUE NOT NULL,
  nickname VARCHAR(80) NOT NULL,
  bio TEXT,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trips (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  owner_id BIGINT NOT NULL,
  destination VARCHAR(120) NOT NULL,
  depart_date DATE NOT NULL,
  days INT NOT NULL,
  budget_min DECIMAL(10,2),
  budget_max DECIMAL(10,2),
  transport VARCHAR(40),
  companion_count INT,
  gender_preference VARCHAR(40),
  status VARCHAR(30) DEFAULT 'OPEN'
);

CREATE TABLE IF NOT EXISTS trip_days (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  trip_id BIGINT NOT NULL,
  day_no INT NOT NULL,
  title VARCHAR(160),
  lodging VARCHAR(160),
  transport_plan VARCHAR(160)
);

CREATE TABLE IF NOT EXISTS budgets (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  trip_id BIGINT NOT NULL,
  category VARCHAR(40) NOT NULL,
  planned DECIMAL(10,2) NOT NULL,
  spent DECIMAL(10,2) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_budget_trip_category (trip_id, category)
);

CREATE TABLE IF NOT EXISTS budget_expenses (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  request_id VARCHAR(80) NOT NULL,
  trip_id BIGINT NOT NULL,
  category VARCHAR(40) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  note VARCHAR(160),
  member_id BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_budget_expense_request (request_id),
  KEY idx_budget_expense_trip (trip_id)
);

CREATE TABLE IF NOT EXISTS budget_transfers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  request_id VARCHAR(80) NOT NULL,
  trip_id BIGINT NOT NULL,
  from_category VARCHAR(40) NOT NULL,
  to_category VARCHAR(40) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  operator_id BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_budget_transfer_request (request_id),
  KEY idx_budget_transfer_trip (trip_id)
);

CREATE TABLE IF NOT EXISTS diary_entries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  trip_id BIGINT NOT NULL,
  title VARCHAR(160) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

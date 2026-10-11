-- DAYMARK local workspace database
-- Run this file in MySQL Workbench using your local MySQL Server connection.
-- MySQL 8.0+ is recommended because workspace_json uses the native JSON type.

CREATE DATABASE IF NOT EXISTS daymark_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE daymark_db;

CREATE TABLE IF NOT EXISTS workspace_state (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  workspace_json JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_workspace_state_singleton CHECK (id = 1)
);

-- DAYMARK stores the complete single-user workspace as one validated JSON document.
-- This keeps the React state model and import/export backups lossless while still
-- persisting it in your local MySQL database, visible in MySQL Workbench.

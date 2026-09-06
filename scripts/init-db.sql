-- scripts/init-db.sql
-- This runs when PostgreSQL container first starts

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create indexes for better performance
-- (Tables will be created by migrations)
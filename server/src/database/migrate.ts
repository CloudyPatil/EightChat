// server/src/database/migrate.ts
import { pgPool } from '../config/database';
import { logger } from '../utils/logger';

const migrations = [
  {
    id: 1,
    name: 'create_extensions',
    sql: `
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    `,
  },
  {
    id: 2,
    name: 'create_users_table',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone           VARCHAR(20) UNIQUE,
        phone_hash      VARCHAR(64) UNIQUE,
        email           VARCHAR(255) UNIQUE,
        username        VARCHAR(30) UNIQUE,
        display_name    VARCHAR(50) NOT NULL,
        avatar_url      VARCHAR(500),
        bio             VARCHAR(200),

        -- Signal Protocol Keys
        identity_public_key   TEXT,
        signed_prekey_id      INTEGER,
        signed_prekey_public  TEXT,
        signed_prekey_sig     TEXT,
        registration_id       INTEGER,

        -- Status
        is_online       BOOLEAN DEFAULT FALSE,
        last_seen       TIMESTAMP,
        status_text     VARCHAR(200),
        mood            VARCHAR(50),

        -- Privacy
        ghost_mode      BOOLEAN DEFAULT FALSE,
        show_online     BOOLEAN DEFAULT TRUE,
        show_last_seen  BOOLEAN DEFAULT TRUE,
        show_read_recpt BOOLEAN DEFAULT TRUE,

        -- App
        settings        JSONB DEFAULT '{}',
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW(),
        deleted_at      TIMESTAMP
      );

      CREATE INDEX idx_users_phone_hash ON users(phone_hash);
      CREATE INDEX idx_users_username ON users(username);
      CREATE INDEX idx_users_email ON users(email);
    `,
  },
  {
    id: 3,
    name: 'create_prekeys_table',
    sql: `
      CREATE TABLE IF NOT EXISTS prekeys (
        id          SERIAL PRIMARY KEY,
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        prekey_id   INTEGER NOT NULL,
        public_key  TEXT NOT NULL,
        used        BOOLEAN DEFAULT FALSE,
        created_at  TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, prekey_id)
      );

      CREATE INDEX idx_prekeys_user_id ON prekeys(user_id);
      CREATE INDEX idx_prekeys_unused ON prekeys(user_id, used) WHERE used = FALSE;
    `,
  },
  {
    id: 4,
    name: 'create_conversations_table',
    sql: `
      CREATE TABLE IF NOT EXISTS conversations (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type            VARCHAR(10) NOT NULL CHECK (type IN ('direct', 'group')),
        name            VARCHAR(100),
        description     VARCHAR(500),
        avatar_url      VARCHAR(500),
        created_by      UUID REFERENCES users(id),

        -- Group settings
        is_anonymous    BOOLEAN DEFAULT FALSE,
        max_members     INTEGER DEFAULT 256,

        -- Media settings
        disappear_after INTEGER, -- seconds, null = off

        settings        JSONB DEFAULT '{}',
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX idx_conversations_type ON conversations(type);
      CREATE INDEX idx_conversations_created_by ON conversations(created_by);
    `,
  },
  {
    id: 5,
    name: 'create_conversation_members_table',
    sql: `
      CREATE TABLE IF NOT EXISTS conversation_members (
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role            VARCHAR(10) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
        anonymous_name  VARCHAR(30),
        anonymous_avatar VARCHAR(100),

        -- Settings
        is_muted        BOOLEAN DEFAULT FALSE,
        muted_until     TIMESTAMP,
        is_pinned       BOOLEAN DEFAULT FALSE,
        is_archived     BOOLEAN DEFAULT FALSE,
        custom_name     VARCHAR(50),

        -- Tracking
        last_read_at    TIMESTAMP DEFAULT NOW(),
        joined_at       TIMESTAMP DEFAULT NOW(),
        left_at         TIMESTAMP,

        PRIMARY KEY (conversation_id, user_id)
      );

      CREATE INDEX idx_conv_members_user ON conversation_members(user_id);
      CREATE INDEX idx_conv_members_conv ON conversation_members(conversation_id);
    `,
  },
  {
    id: 6,
    name: 'create_messages_table',
    sql: `
      CREATE TABLE IF NOT EXISTS messages (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id       UUID NOT NULL REFERENCES users(id),

        -- Encrypted content (server cannot read this)
        encrypted_body  BYTEA NOT NULL,
        iv              VARCHAR(64),    -- Initialization vector
        message_type    VARCHAR(20) DEFAULT 'text'
                        CHECK (message_type IN (
                          'text', 'image', 'video', 'audio',
                          'file', 'wave', 'location', 'sticker',
                          'poll', 'system'
                        )),

        -- Relationships
        reply_to        UUID REFERENCES messages(id),
        forwarded_from  UUID REFERENCES messages(id),

        -- Expiry
        expires_at      TIMESTAMP,

        -- Scheduling
        is_scheduled    BOOLEAN DEFAULT FALSE,
        scheduled_at    TIMESTAMP,
        schedule_type   VARCHAR(20),

        -- Meta
        is_edited       BOOLEAN DEFAULT FALSE,
        edited_at       TIMESTAMP,
        is_deleted      BOOLEAN DEFAULT FALSE,
        deleted_at      TIMESTAMP,

        created_at      TIMESTAMP DEFAULT NOW(),
        server_ts       BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
      );

      CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at DESC);
      CREATE INDEX idx_messages_sender ON messages(sender_id);
      CREATE INDEX idx_messages_scheduled ON messages(scheduled_at) WHERE is_scheduled = TRUE;
      CREATE INDEX idx_messages_expires ON messages(expires_at) WHERE expires_at IS NOT NULL;
    `,
  },
  {
    id: 7,
    name: 'create_message_status_table',
    sql: `
      CREATE TABLE IF NOT EXISTS message_status (
        message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status          VARCHAR(15) DEFAULT 'sent'
                        CHECK (status IN ('sent', 'delivered', 'read', 'acknowledged')),
        custom_receipt  VARCHAR(150),
        updated_at      TIMESTAMP DEFAULT NOW(),

        PRIMARY KEY (message_id, user_id)
      );

      CREATE INDEX idx_msg_status_message ON message_status(message_id);
      CREATE INDEX idx_msg_status_user ON message_status(user_id);
    `,
  },
  {
    id: 8,
    name: 'create_calls_table',
    sql: `
      CREATE TABLE IF NOT EXISTS calls (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES conversations(id),
        initiated_by    UUID NOT NULL REFERENCES users(id),
        call_type       VARCHAR(10) NOT NULL CHECK (call_type IN ('voice', 'video')),
        status          VARCHAR(15) DEFAULT 'ringing'
                        CHECK (status IN ('ringing', 'active', 'ended', 'missed', 'rejected', 'busy')),
        started_at      TIMESTAMP,
        ended_at        TIMESTAMP,
        duration_secs   INTEGER,
        participants    JSONB DEFAULT '[]',
        created_at      TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX idx_calls_conv ON calls(conversation_id);
      CREATE INDEX idx_calls_user ON calls(initiated_by);
    `,
  },
  {
    id: 9,
    name: 'create_ghost_settings_table',
    sql: `
      CREATE TABLE IF NOT EXISTS ghost_settings (
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_user_id  UUID REFERENCES users(id) ON DELETE CASCADE,
        is_ghosted      BOOLEAN DEFAULT FALSE,
        schedule_start  TIME,
        schedule_end    TIME,
        created_at      TIMESTAMP DEFAULT NOW(),

        PRIMARY KEY (user_id, target_user_id)
      );
    `,
  },
  {
    id: 10,
    name: 'create_vault_table',
    sql: `
      CREATE TABLE IF NOT EXISTS vault_settings (
        user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        vault_pin_hash  VARCHAR(256),
        decoy_pin_hash  VARCHAR(256),
        biometric_enabled BOOLEAN DEFAULT FALSE,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      );
    `,
  },
  {
    id: 11,
    name: 'create_migrations_table',
    sql: `
      CREATE TABLE IF NOT EXISTS _migrations (
        id          INTEGER PRIMARY KEY,
        name        VARCHAR(100) NOT NULL,
        run_at      TIMESTAMP DEFAULT NOW()
      );
    `,
  },
  {
    id: 12,
    name: 'add_password_hash_to_users',
    sql: `
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_hash VARCHAR(256);
    `,
  },
];

export async function runMigrations() {
  const client = await pgPool.connect();

  try {
    // Create migrations tracking table first
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id      INTEGER PRIMARY KEY,
        name    VARCHAR(100) NOT NULL,
        run_at  TIMESTAMP DEFAULT NOW()
      );
    `);

    // Get already run migrations
    const { rows: completedMigrations } = await client.query(
      'SELECT id FROM _migrations ORDER BY id'
    );
    const completedIds = new Set(completedMigrations.map(r => r.id));

    // Run pending migrations
    for (const migration of migrations) {
      if (completedIds.has(migration.id)) {
        logger.debug(`Skipping migration ${migration.id}: ${migration.name}`);
        continue;
      }

      logger.info(`Running migration ${migration.id}: ${migration.name}`);

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO _migrations (id, name) VALUES ($1, $2)',
          [migration.id, migration.name]
        );
        await client.query('COMMIT');
        logger.info(`✅ Migration ${migration.id} completed`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    logger.info('✅ All migrations completed');
  } finally {
    client.release();
  }
}

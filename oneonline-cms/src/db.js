const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set. Add it to .env before starting the app.");
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS categories (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS articles (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      cover_image TEXT NOT NULL DEFAULT '',
      category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
      author_id BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
      seo_title TEXT NOT NULL DEFAULT '',
      seo_description TEXT NOT NULL DEFAULT '',
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS articles_status_published_idx ON articles(status, published_at DESC);
    CREATE INDEX IF NOT EXISTS articles_category_idx ON articles(category_id);
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);
  const defaults = [
    ["ޚަބަރު", "news"], ["ރާއްޖެ", "maldives"], ["ދުނިޔެ", "world"],
    ["ކުޅިވަރު", "sports"], ["ވިޔަފާރި", "business"], ["ރިޕޯޓް", "reports"]
  ];
  for (const [name, slug] of defaults) {
    await pool.query("INSERT INTO categories(name, slug) VALUES($1,$2) ON CONFLICT (slug) DO NOTHING", [name, slug]);
  }
}
module.exports = { pool, initDb };

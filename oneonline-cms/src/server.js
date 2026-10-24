require("dotenv").config();
const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const slugify = require("slugify");
const { pool, initDb } = require("./db");
const { cloudinary, configured: cloudinaryConfigured } = require("./cloudinary");
const { requireAdmin, validateArticle } = require("./middleware");

const app = express();
const isProduction = process.env.NODE_ENV === "production";
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

const allowedOrigins = (process.env.CORS_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(session({
  store: new PgSession({ pool, tableName: "session", createTableIfMissing: false }),
  name: "oneonline.sid",
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 8
  }
}));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const valid = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype);
    cb(valid ? null : new Error("Only JPEG, PNG, WebP or GIF images are allowed."), valid);
  }
});

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const publicArticleSelect = `
  SELECT a.id, a.title, a.slug, a.excerpt, a.cover_image, a.status, a.published_at,
         a.created_at, a.updated_at, a.seo_title, a.seo_description,
         c.name AS category_name, c.slug AS category_slug
  FROM articles a LEFT JOIN categories c ON c.id = a.category_id
`;
const articleSlug = title => slugify(title, { lower: true, strict: true, trim: true }) || `article-${Date.now()}`;

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "oneonline-cms" }));

app.get("/api/categories", asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT c.id, c.name, c.slug, COUNT(a.id)::int AS article_count
    FROM categories c LEFT JOIN articles a ON a.category_id=c.id AND a.status='published'
    GROUP BY c.id ORDER BY c.name
  `);
  res.json({ categories: rows });
}));

app.get("/api/articles", asyncRoute(async (req, res) => {
  const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));
  const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const values = [];
  let where = "WHERE a.status='published'";
  if (req.query.category) {
    values.push(String(req.query.category));
    where += ` AND c.slug=$${values.length}`;
  }
  if (req.query.q) {
    values.push(`%${String(req.query.q).slice(0, 100)}%`);
    where += ` AND (a.title ILIKE $${values.length} OR a.excerpt ILIKE $${values.length} OR a.body ILIKE $${values.length})`;
  }
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM articles a LEFT JOIN categories c ON c.id=a.category_id ${where}`, values
  );
  const listValues = [...values, limit, offset];
  const { rows } = await pool.query(
    `${publicArticleSelect} ${where} ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    listValues
  );
  res.json({ articles: rows, page, limit, total: countResult.rows[0].total, pages: Math.ceil(countResult.rows[0].total / limit) });
}));

app.get("/api/articles/:slug", asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    `${publicArticleSelect} WHERE a.slug=$1 AND a.status='published' LIMIT 1`, [req.params.slug]
  );
  if (!rows[0]) return res.status(404).json({ error: "Article not found." });
  const article = rows[0];
  const body = await pool.query("SELECT body FROM articles WHERE id=$1", [article.id]);
  res.json({ article: { ...article, body: body.rows[0].body } });
}));

app.post("/api/auth/login", loginLimiter, asyncRoute(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
  const { rows } = await pool.query("SELECT id, email, password_hash FROM admins WHERE email=$1", [email]);
  if (!rows[0] || !(await bcrypt.compare(password, rows[0].password_hash))) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  req.session.admin = { id: rows[0].id, email: rows[0].email };
  res.json({ admin: req.session.admin });
}));

app.post("/api/auth/logout", (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie("oneonline.sid", { httpOnly: true, secure: isProduction, sameSite: "lax" });
    res.json({ ok: true });
  });
});

app.get("/api/auth/me", (req, res) => res.json({ admin: req.session?.admin || null }));

app.get("/api/admin/articles", requireAdmin, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT a.id, a.title, a.slug, a.excerpt, a.cover_image, a.status, a.published_at,
           a.created_at, a.updated_at, a.seo_title, a.seo_description, a.body,
           c.id AS category_id, c.name AS category_name, c.slug AS category_slug
    FROM articles a LEFT JOIN categories c ON c.id=a.category_id
    ORDER BY a.updated_at DESC LIMIT 300
  `);
  res.json({ articles: rows });
}));

app.post("/api/admin/articles", requireAdmin, validateArticle, asyncRoute(async (req, res) => {
  const { title, excerpt = "", body, cover_image = "", category_id = null, status = "draft", seo_title = "", seo_description = "" } = req.body;
  let slug = articleSlug(title);
  const collision = await pool.query("SELECT id FROM articles WHERE slug=$1", [slug]);
  if (collision.rowCount) slug = `${slug}-${Date.now().toString(36)}`;
  const publishedAt = status === "published" ? new Date() : null;
  const { rows } = await pool.query(`
    INSERT INTO articles(title,slug,excerpt,body,cover_image,category_id,author_id,status,seo_title,seo_description,published_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
  `, [title.trim(), slug, excerpt, body, cover_image, category_id || null, req.session.admin.id, status, seo_title, seo_description, publishedAt]);
  res.status(201).json({ article: rows[0] });
}));

app.put("/api/admin/articles/:id", requireAdmin, validateArticle, asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid article ID." });
  const { title, excerpt = "", body, cover_image = "", category_id = null, status = "draft", seo_title = "", seo_description = "" } = req.body;
  const existing = await pool.query("SELECT id, slug, status, published_at FROM articles WHERE id=$1", [id]);
  if (!existing.rows[0]) return res.status(404).json({ error: "Article not found." });
  const wasPublished = existing.rows[0].status === "published";
  const publishedAt = status === "published" ? (wasPublished ? existing.rows[0].published_at : new Date()) : null;
  const { rows } = await pool.query(`
    UPDATE articles SET title=$1, excerpt=$2, body=$3, cover_image=$4, category_id=$5, status=$6,
      seo_title=$7, seo_description=$8, published_at=$9, updated_at=NOW()
    WHERE id=$10 RETURNING *
  `, [title.trim(), excerpt, body, cover_image, category_id || null, status, seo_title, seo_description, publishedAt, id]);
  res.json({ article: rows[0] });
}));

app.delete("/api/admin/articles/:id", requireAdmin, asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid article ID." });
  const result = await pool.query("DELETE FROM articles WHERE id=$1", [id]);
  if (!result.rowCount) return res.status(404).json({ error: "Article not found." });
  res.json({ ok: true });
}));

app.post("/api/admin/upload", requireAdmin, upload.single("image"), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose an image to upload." });
  if (!cloudinaryConfigured) return res.status(503).json({ error: "Image uploads are not configured. Add Cloudinary credentials in environment variables." });
  const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: "oneonline",
    resource_type: "image",
    transformation: [{ width: 1800, height: 1200, crop: "limit", quality: "auto", fetch_format: "auto" }]
  });
  res.status(201).json({ url: result.secure_url, public_id: result.public_id, width: result.width, height: result.height });
}));

app.use(express.static(path.join(__dirname, "..", "public"), { extensions: ["html"] }));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "..", "public", "admin.html")));

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err instanceof multer.MulterError ? 400 : (err.status || 500);
  res.status(status).json({ error: status === 500 ? "Unexpected server error." : err.message });
});

const port = Number(process.env.PORT || 3000);
initDb().then(() => {
  app.listen(port, () => console.log(`One Online CMS listening on ${port}`));
}).catch(err => {
  console.error("Unable to initialize database:", err);
  process.exit(1);
});

process.on("SIGTERM", async () => { await pool.end(); process.exit(0); });

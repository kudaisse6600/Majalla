# One Online CMS — Express + PostgreSQL + Render

A deployable starter CMS with:
- Public news API and public article pages
- Admin login with bcrypt password hashes and server-side PostgreSQL sessions
- Create, edit, publish/unpublish and delete articles
- Categories, slugs, excerpts, body content, SEO title/description
- Image upload to Cloudinary (recommended for Render)
- Admin dashboard at `/admin`
- Basic rate limiting, Helmet security headers, validation and CSRF-resistant same-site session cookies

> This is a new backend and sample front end. It does not automatically import or preserve the current oneonline.mv database/content. Import/verification of existing articles and integration with the current site must be done separately.

## Requirements
- Node.js 20+
- PostgreSQL database
- Cloudinary account for persistent image uploads
- Render account for deployment

## Run locally
1. Copy `.env.example` to `.env`.
2. Fill in `DATABASE_URL`, `SESSION_SECRET`, and Cloudinary credentials.
3. Install dependencies: `npm install`
4. Create tables: `npm run db:init`
5. Create the first administrator: `npm run admin:create`
6. Start: `npm run dev`
7. Open `http://localhost:3000/admin`

The admin creation script prompts for email and password and stores only a bcrypt hash. Do not commit `.env`.

## Render deployment
1. Push this folder to a new private GitHub repository.
2. In Render, choose **New → Blueprint** and select the repository; Render reads `render.yaml`.
3. Set the `APP_URL` environment variable to the deployed service URL, e.g. `https://oneonline-cms.onrender.com`.
4. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the Render service environment.
5. Deploy and open `https://YOUR-SERVICE.onrender.com/admin`.
6. Create the initial admin using Render Shell: `npm run admin:create`. If Shell is unavailable on your plan, run the script locally using the production `DATABASE_URL` in a temporary environment, then remove it immediately. Prefer Render Shell when available.
7. Visit `/api/health` to check the app.

### Database initialization
The server automatically runs idempotent table creation on startup. `npm run db:init` is also available. Keep a database backup before production migrations.

### Image uploads
Cloudinary credentials are required for uploads. Uploads are limited to 5 MB and JPEG, PNG, WebP or GIF. Render's local filesystem is ephemeral, so this project intentionally does not save uploaded files locally.

## Useful endpoints
- `GET /api/health`
- `GET /api/categories`
- `GET /api/articles?limit=20&page=1&category=...&q=...`
- `GET /api/articles/:slug`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/admin/articles`
- `PUT /api/admin/articles/:id`
- `DELETE /api/admin/articles/:id`
- `POST /api/admin/upload`

All `/api/admin/*` endpoints require an authenticated admin session.

## Integrating the existing One Online front end
Use `GET /api/articles` to populate cards, and `GET /api/articles/:slug` for article pages. Update your HTML to fetch from the deployed API. If the front end is hosted on another domain, set `CORS_ORIGINS` to its exact origin and review cookie/CORS settings before deployment. For simplest secure session handling, serve the front end from this same Express app.

## Production checklist
- Set a strong unique `SESSION_SECRET`.
- Use a production database and configure automated backups.
- Use HTTPS (Render provides it).
- Use a separate admin account per editor; do not share passwords.
- Add a privacy policy, retention policy, audit logging and editorial workflow before handling sensitive user data.
- Test backups, login/logout, uploads, search and article publishing before launch.
- Do not expose database credentials or Cloudinary secrets in browser JavaScript.

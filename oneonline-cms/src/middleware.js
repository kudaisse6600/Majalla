function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ error: "Please sign in as an administrator." });
}

function validateArticle(req, res, next) {
  const { title, body, status } = req.body || {};
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Article title is required." });
  }
  if (title.trim().length > 220) return res.status(400).json({ error: "Title must be 220 characters or fewer." });
  if (typeof body !== "string") return res.status(400).json({ error: "Article body is required." });
  if (status && !["draft", "published"].includes(status)) {
    return res.status(400).json({ error: "Status must be draft or published." });
  }
  next();
}

module.exports = { requireAdmin, validateArticle };

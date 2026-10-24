require("dotenv").config();
const { pool, initDb } = require("../src/db");

initDb()
  .then(() => console.log("Database tables are ready."))
  .catch((err) => { console.error("Database initialization failed:", err); process.exitCode = 1; })
  .finally(() => pool.end());

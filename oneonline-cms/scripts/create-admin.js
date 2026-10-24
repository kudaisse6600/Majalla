require("dotenv").config();
const readline = require("node:readline");
const bcrypt = require("bcryptjs");
const { pool, initDb } = require("../src/db");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

(async () => {
  try {
    await initDb();
    const email = (await ask("Admin email: ")).trim().toLowerCase();
    const password = await ask("Password (12+ characters recommended): ");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Please enter a valid email address.");
    if (password.length < 12) throw new Error("Password must be at least 12 characters.");
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO admins (email, password_hash) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [email, hash]
    );
    console.log(`Admin account ready: ${email}`);
  } catch (err) {
    console.error(err.message || err);
    process.exitCode = 1;
  } finally {
    rl.close();
    await pool.end();
  }
})();

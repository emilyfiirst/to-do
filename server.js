const path = require("path");
const express = require("express");
const Database = require("better-sqlite3");

const db = new Database(path.join(__dirname, "db.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    segment_id INTEGER NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'iniciado', 'concluido')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`);

const itemColumns = db.prepare("PRAGMA table_info(items)").all();
if (!itemColumns.some((c) => c.name === "status")) {
  db.exec("ALTER TABLE items ADD COLUMN status TEXT NOT NULL DEFAULT 'novo'");
  if (itemColumns.some((c) => c.name === "done")) {
    db.exec("UPDATE items SET status = CASE WHEN done = 1 THEN 'concluido' ELSE 'novo' END");
  }
}

const STATUSES = ["novo", "iniciado", "concluido"];

const seedCount = db.prepare("SELECT COUNT(*) AS n FROM segments").get().n;
if (seedCount === 0) {
  const insertSegment = db.prepare("INSERT INTO segments (name) VALUES (?)");
  for (const name of ["Livros", "Cursos", "Jogos", "Filmes"]) {
    insertSegment.run(name);
  }
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Segments

app.get("/api/segments", (req, res) => {
  const segments = db
    .prepare(
      `SELECT s.id, s.name, s.created_at,
              COUNT(i.id) AS item_count
       FROM segments s
       LEFT JOIN items i ON i.segment_id = s.id
       GROUP BY s.id
       ORDER BY s.name COLLATE NOCASE`
    )
    .all();
  res.json(segments);
});

app.post("/api/segments", (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) {
    return res.status(400).json({ error: "Nome do segmento é obrigatório." });
  }
  try {
    const result = db.prepare("INSERT INTO segments (name) VALUES (?)").run(name);
    const segment = db.prepare("SELECT * FROM segments WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json(segment);
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "Já existe um segmento com esse nome." });
    }
    res.status(500).json({ error: "Erro ao criar segmento." });
  }
});

app.delete("/api/segments/:id", (req, res) => {
  db.prepare("DELETE FROM segments WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// Items

app.get("/api/segments/:id/items", (req, res) => {
  const items = db
    .prepare("SELECT * FROM items WHERE segment_id = ? ORDER BY created_at DESC, id DESC")
    .all(req.params.id);
  res.json(items);
});

app.post("/api/segments/:id/items", (req, res) => {
  const title = (req.body.title || "").trim();
  if (!title) {
    return res.status(400).json({ error: "Título do item é obrigatório." });
  }
  const segment = db.prepare("SELECT id FROM segments WHERE id = ?").get(req.params.id);
  if (!segment) {
    return res.status(404).json({ error: "Segmento não encontrado." });
  }
  const result = db
    .prepare("INSERT INTO items (segment_id, title) VALUES (?, ?)")
    .run(req.params.id, title);
  const item = db.prepare("SELECT * FROM items WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(item);
});

app.patch("/api/items/:id", (req, res) => {
  const item = db.prepare("SELECT * FROM items WHERE id = ?").get(req.params.id);
  if (!item) {
    return res.status(404).json({ error: "Item não encontrado." });
  }
  const status = req.body.status;
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: "Status inválido." });
  }
  db.prepare("UPDATE items SET status = ? WHERE id = ?").run(status, req.params.id);
  res.json({ ...item, status });
});

app.delete("/api/items/:id", (req, res) => {
  db.prepare("DELETE FROM items WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`To-do rodando em http://localhost:${PORT}`);
});

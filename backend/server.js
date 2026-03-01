\
import express from "express";
import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { DateTime } from "luxon";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "1mb" }));

// Static (frontend)
app.use(express.static(path.join(__dirname, "public")));

function getHojeSP() {
  const tz = process.env.TIMEZONE || "America/Sao_Paulo";
  return DateTime.now().setZone(tz).toISODate(); // YYYY-MM-DD
}

function getDbConfig() {
  // Railway MySQL plugin geralmente fornece:
  // MYSQLHOST, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE, MYSQLPORT
  return {
    host: process.env.DB_HOST || process.env.MYSQLHOST,
    user: process.env.DB_USER || process.env.MYSQLUSER,
    password: process.env.DB_PASS || process.env.MYSQLPASSWORD,
    database: process.env.DB_NAME || process.env.MYSQLDATABASE,
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };
}

const pool = mysql.createPool(getDbConfig());

const SITUACOES = [
  "VE",
  "MA",
  "SR",
  "FO*",
  "FOJ",
  "EXP",
  "EXP-SS",
  "FÉRIAS",
  "LP",
  "CURSO",
  "OUTROS",
];

async function ensureSchema() {
  // Cria tabelas se não existirem (suficiente para Railway)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oficiais (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS estado_do_dia (
      id INT AUTO_INCREMENT PRIMARY KEY,
      data_ref DATE NOT NULL,
      oficial_id INT NOT NULL,
      situacao VARCHAR(50) NULL,
      observacao VARCHAR(255) NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_estado_oficial FOREIGN KEY (oficial_id) REFERENCES oficiais(id) ON DELETE CASCADE,
      UNIQUE KEY uniq_data_oficial (data_ref, oficial_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

async function resetSeNovoDia() {
  const hoje = getHojeSP();

  // Se não houver registros do dia atual em estado_do_dia, recria
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM estado_do_dia WHERE data_ref = ?`,
    [hoje]
  );

  if ((rows?.[0]?.c ?? 0) > 0) return;

  // Zera tudo (não guarda histórico) e recria o quadro do dia
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(`DELETE FROM estado_do_dia`);

    const [oficiais] = await conn.query(`SELECT id FROM oficiais ORDER BY id`);
    if (oficiais.length > 0) {
      const values = oficiais.map((o) => [hoje, o.id]);
      await conn.query(
        `INSERT INTO estado_do_dia (data_ref, oficial_id) VALUES ?`,
        [values]
      );
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

function authOk(req) {
  const login = (req.headers["x-login"] || "").toString();
  const senha = (req.headers["x-senha"] || "").toString();
  return (
    login === (process.env.LOGIN_UNIDADE || "4BPMM") &&
    senha === (process.env.SENHA_UNIDADE || "OFICIAL4M")
  );
}

app.get("/health", async (_req, res) => {
  try {
    await ensureSchema();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/config", (_req, res) => {
  res.json({ situacoes: SITUACOES, timezone: process.env.TIMEZONE || "America/Sao_Paulo" });
});

app.post("/api/login", (req, res) => {
  const { login, senha } = req.body || {};
  const ok =
    (login || "") === (process.env.LOGIN_UNIDADE || "4BPMM") &&
    (senha || "") === (process.env.SENHA_UNIDADE || "OFICIAL4M");
  res.json({ ok });
});

app.get("/api/estado", async (req, res) => {
  try {
    if (!authOk(req)) return res.status(401).json({ ok: false, error: "não autorizado" });

    await ensureSchema();
    await resetSeNovoDia();

    const [rows] = await pool.query(
      `
      SELECT o.id AS oficial_id, o.nome, e.data_ref, e.situacao, e.observacao, e.atualizado_em
      FROM oficiais o
      LEFT JOIN estado_do_dia e
        ON o.id = e.oficial_id
      WHERE e.data_ref = ?
      ORDER BY o.id
      `,
      [getHojeSP()]
    );

    res.json({ ok: true, data: rows, hoje: getHojeSP() });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/estado", async (req, res) => {
  try {
    if (!authOk(req)) return res.status(401).json({ ok: false, error: "não autorizado" });

    const { oficial_id, situacao, observacao } = req.body || {};
    const id = Number(oficial_id);

    if (!id) return res.status(400).json({ ok: false, error: "oficial_id inválido" });

    if (situacao != null && situacao !== "" && !SITUACOES.includes(String(situacao))) {
      return res.status(400).json({ ok: false, error: "situação inválida" });
    }

    const obs = (observacao ?? "").toString().trim().slice(0, 255);
    const sit = (situacao ?? "").toString().trim().slice(0, 50) || null;

    await ensureSchema();
    await resetSeNovoDia();

    const hoje = getHojeSP();
    await pool.query(
      `
      UPDATE estado_do_dia
      SET situacao = ?, observacao = ?, atualizado_em = NOW()
      WHERE data_ref = ? AND oficial_id = ?
      `,
      [sit, obs || null, hoje, id]
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Fallback para SPA simples
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`SITUAÇÃO REAL 4º BPM/M rodando na porta ${port}`));

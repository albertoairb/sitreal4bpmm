import express from "express";
import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { DateTime } from "luxon";
import PDFDocument from "pdfkit";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(
  express.static(path.join(__dirname, "public"), {
    etag: false,
    lastModified: false,
    setHeaders: (res, filePath) => {
      // Evita cache agressivo no mobile (Android/iOS) para HTML/CSS/JS
      if (/\.(html|css|js)$/.test(filePath)) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
    },
  })
);

// Evita cache em respostas da API (mobile costuma reaproveitar respostas antigas)
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});


function hojeSP() {
  const tz = process.env.TIMEZONE || "America/Sao_Paulo";
  return DateTime.now().setZone(tz).toISODate();
}

function formatarBR(isoDate) {
  const [y, m, d] = (isoDate || "").split("-");
  if (!y || !m || !d) return isoDate || "";
  return `${d}/${m}/${y}`;
}

function dbConfig() {
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

function missingDbEnv(cfg) {
  return !cfg.host || !cfg.user || !cfg.database;
}

const pool = mysql.createPool(dbConfig());

// Situações (tudo em maiúsculo)
const SITUACOES = [
  "VE",
  "MA",
  "SR",
  "CFP_DIA",
  "CFP_NOITE",
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
  const hoje = hojeSP();
  const [rows] = await pool.query(`SELECT COUNT(*) AS c FROM estado_do_dia WHERE data_ref = ?`, [hoje]);
  if ((rows?.[0]?.c ?? 0) > 0) return;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM estado_do_dia`);

    const [oficiais] = await conn.query(`SELECT id FROM oficiais ORDER BY id`);
    if (oficiais.length > 0) {
      const values = oficiais.map((o) => [hoje, o.id]);
      await conn.query(`INSERT INTO estado_do_dia (data_ref, oficial_id) VALUES ?`, [values]);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function getEstadoDoDia() {
  const cfg = dbConfig();
  if (missingDbEnv(cfg)) throw new Error("db_env_ausente_no_app");

  await ensureSchema();
  await resetSeNovoDia();

  const h = hojeSP();
  const [rows] = await pool.query(
    `
    SELECT o.id AS oficial_id, o.nome, e.data_ref, e.situacao, e.observacao, e.atualizado_em
    FROM oficiais o
    LEFT JOIN estado_do_dia e ON o.id = e.oficial_id
    WHERE e.data_ref = ?
    ORDER BY o.id
    `,
    [h]
  );

  return { hoje: h, data: rows };
}

app.get("/health", async (_req, res) => {
  try {
    const cfg = dbConfig();
    if (missingDbEnv(cfg)) {
      return res.status(200).json({
        ok: true,
        warning: "db_env_ausente",
        dica: "No Railway, adicione MYSQLHOST, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE, MYSQLPORT nas variáveis do serviço do app.",
      });
    }
    await ensureSchema();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/config", (_req, res) => {
  res.json({ situacoes: SITUACOES, timezone: process.env.TIMEZONE || "America/Sao_Paulo" });
});

app.get("/api/estado", async (_req, res) => {
  try {
    const out = await getEstadoDoDia();
    res.json({ ok: true, data: out.data, hoje: out.hoje, hoje_br: formatarBR(out.hoje) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/estado", async (req, res) => {
  try {
    const { oficial_id, situacao, observacao } = req.body || {};
    const id = Number(oficial_id);
    if (!id) return res.status(400).json({ ok: false, error: "oficial_id inválido" });

    if (situacao != null && situacao !== "" && !SITUACOES.includes(String(situacao))) {
      return res.status(400).json({ ok: false, error: "situação inválida" });
    }

    const obs = (observacao ?? "").toString().trim().slice(0, 255);
    const sit = (situacao ?? "").toString().trim().slice(0, 50) || null;

    const out = await getEstadoDoDia();
    await pool.query(
      `UPDATE estado_do_dia SET situacao = ?, observacao = ?, atualizado_em = NOW() WHERE data_ref = ? AND oficial_id = ?`,
      [sit, obs || null, out.hoje, id]
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/pdf", async (_req, res) => {
  try {
    const { hoje, data } = await getEstadoDoDia();
    const hojeBr = formatarBR(hoje);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="SITUACAO_REAL_4BPMM_${hojeBr.replaceAll("/", "-")}.pdf"`);

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.pipe(res);

    doc.fontSize(14).text("SITUAÇÃO REAL DOS OFICIAIS – 4º BPM/M", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(11).text(`DATA: ${hojeBr}`, { align: "center" });
    doc.moveDown(1);

    const startX = 40;
    let y = doc.y;
    const col1 = 280;
    const col2 = 90;
    const col3 = 160;

    const max = (...vals) => vals.reduce((a, b) => (a > b ? a : b), 0);

    const drawRow = (oficial, situacao, obs, isHeader = false) => {
      const fontSize = isHeader ? 10 : 9;
      doc.fontSize(fontSize);
      const topY = y;
      const pad = 4;

      const h1 = doc.heightOfString(oficial, { width: col1 - pad * 2 });
      const h2 = doc.heightOfString(situacao, { width: col2 - pad * 2 });
      const h3 = doc.heightOfString(obs, { width: col3 - pad * 2 });
      const rowH = max(18, h1, h2, h3) + pad * 2;

      if (topY + rowH > doc.page.height - 70) {
        doc.addPage();
        y = 40;
      }

      doc.rect(startX, y, col1, rowH).stroke();
      doc.rect(startX + col1, y, col2, rowH).stroke();
      doc.rect(startX + col1 + col2, y, col3, rowH).stroke();

      doc.text(oficial, startX + pad, y + pad, { width: col1 - pad * 2 });
      doc.text(situacao, startX + col1 + pad, y + pad, { width: col2 - pad * 2 });
      doc.text(obs, startX + col1 + col2 + pad, y + pad, { width: col3 - pad * 2 });

      y += rowH;
    };

    drawRow("OFICIAL", "SITUAÇÃO", "OBSERVAÇÃO", true);

    for (const r of data) {
      drawRow(String(r.nome || "").toUpperCase(), String(r.situacao || "").toUpperCase(), String(r.observacao || ""));
    }

    doc.fontSize(10).text(`SÃO PAULO, ${hojeBr}.`, 40, doc.page.height - 60, { align: "left" });

    doc.end();
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("*", (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log(`SITUAÇÃO REAL 4º BPM/M rodando na porta ${port}`));

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
app.use(express.static(path.join(__dirname, "public")));

/**
 * anti-cache
 */
app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || req.path === "/" || req.path.endsWith(".html")) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
  }
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

const SITUACOES = [
  "",
  "EXP",
  "SR",
  "MA",
  "VE",
  "FOJ",
  "FO*",
  "LP",
  "FÉRIAS",
  "CFP_DIA",
  "CFP_NOITE",
  "OUTROS",
  "SS",
  "EXP_SS",
  "FO",
  "PF",
  "EXP-SS",
  "CURSO",
];

const DESCRICOES = {
  EXP: "expediente",
  SR: "supervisor regional",
  MA: "trabalha manhã",
  VE: "trabalha tarde",
  FOJ: "folga (sem descrição)",
  "FO*": "folga (com descrição)",
  LP: "licença-prêmio",
  "FÉRIAS": "férias",
  CFP_DIA: "CFP (dia)",
  CFP_NOITE: "CFP (noite)",
  OUTROS: "com descrição",
  SS: "superior de sobreaviso",
  EXP_SS: "expediente superior de sobreaviso",
  FO: "folga",
  PF: "ponto facultativo",
  "EXP-SS": "expediente superior de sobreaviso",
  CURSO: "curso",
};

function normalizarSituacao(valor) {
  const s = (valor ?? "").toString().trim();
  if (!s) return "";
  if (s === "EXP-SS") return "EXP_SS";
  return s;
}

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

/**
 * garante as linhas do dia atual sem apagar histórico nem sobrescrever quem já salvou
 */
async function garantirLinhasDoDia() {
  const hoje = hojeSP();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [oficiais] = await conn.query(`SELECT id FROM oficiais ORDER BY id`);

    for (const oficial of oficiais) {
      await conn.query(
        `
        INSERT INTO estado_do_dia (data_ref, oficial_id, situacao, observacao)
        VALUES (?, ?, NULL, NULL)
        ON DUPLICATE KEY UPDATE oficial_id = oficial_id
        `,
        [hoje, oficial.id]
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

async function getEstadoDoDia() {
  const cfg = dbConfig();
  if (missingDbEnv(cfg)) throw new Error("db_env_ausente_no_app");

  await ensureSchema();
  await garantirLinhasDoDia();

  const h = hojeSP();

  const [rows] = await pool.query(
    `
    SELECT
      o.id AS oficial_id,
      o.nome,
      e.data_ref,
      e.situacao,
      e.observacao,
      e.atualizado_em
    FROM oficiais o
    LEFT JOIN estado_do_dia e
      ON o.id = e.oficial_id
     AND e.data_ref = ?
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
  res.json({
    situacoes: SITUACOES.filter((s) => s !== "EXP-SS"),
    descricoes: DESCRICOES,
    timezone: process.env.TIMEZONE || "America/Sao_Paulo",
  });
});

app.get("/api/estado", async (_req, res) => {
  try {
    const out = await getEstadoDoDia();
    const dataNorm = (out.data || []).map((r) => ({
      ...r,
      situacao: normalizarSituacao(r.situacao) || "",
    }));
    res.json({
      ok: true,
      data: dataNorm,
      hoje: out.hoje,
      hoje_br: formatarBR(out.hoje),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/estado", async (req, res) => {
  try {
    const { oficial_id, situacao, observacao } = req.body || {};
    const id = Number(oficial_id);
    if (!id) return res.status(400).json({ ok: false, error: "oficial_id inválido" });

    const situacaoNorm = normalizarSituacao(situacao);
    if (situacaoNorm !== "" && !SITUACOES.includes(situacaoNorm)) {
      return res.status(400).json({ ok: false, error: "situação inválida" });
    }

    const obs = (observacao ?? "").toString().trim().slice(0, 255);
    const sit = situacaoNorm.slice(0, 50) || null;

    const out = await getEstadoDoDia();

    await pool.query(
      `
      UPDATE estado_do_dia
         SET situacao = ?, observacao = ?, atualizado_em = NOW()
       WHERE data_ref = ? AND oficial_id = ?
      `,
      [sit, obs || null, out.hoje, id]
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/estado/bulk", async (req, res) => {
  try {
    const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
    if (itens.length === 0) {
      return res.status(400).json({ ok: false, error: "itens vazio" });
    }

    for (const it of itens) {
      const id = Number(it?.oficial_id);
      if (!id) return res.status(400).json({ ok: false, error: "oficial_id inválido" });

      const situacao = normalizarSituacao(it?.situacao ?? "");
      if (situacao !== "" && !SITUACOES.includes(situacao)) {
        return res.status(400).json({ ok: false, error: `situação inválida: ${situacao}` });
      }

      const obs = (it?.observacao ?? "").toString();
      if (obs.length > 255) {
        return res.status(400).json({ ok: false, error: "observacao > 255" });
      }
    }

    const out = await getEstadoDoDia();

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const it of itens) {
        const id = Number(it.oficial_id);
        const sit = normalizarSituacao(it.situacao ?? "").slice(0, 50) || null;
        const obs = (it.observacao ?? "").toString().trim().slice(0, 255) || null;

        await conn.query(
          `
          UPDATE estado_do_dia
             SET situacao = ?, observacao = ?, atualizado_em = NOW()
           WHERE data_ref = ? AND oficial_id = ?
          `,
          [sit, obs, out.hoje, id]
        );
      }

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    res.json({ ok: true, qtd: itens.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/pdf", async (_req, res) => {
  try {
    const { hoje, data } = await getEstadoDoDia();
    const hojeBr = formatarBR(hoje);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="SITUACAO_REAL_4BPMM_${hojeBr.replaceAll("/", "-")}.pdf"`
    );

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.pipe(res);

    doc.fontSize(14).text("SITUAÇÃO REAL DOS OFICIAIS – 4º BPM/M", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(11).text(`DATA: ${hojeBr}`, { align: "center" });
    doc.moveDown(0.6);

    const legenda = [
      "EXP – expediente",
      "SR – supervisor regional",
      "MA – trabalha manhã",
      "VE – trabalha tarde",
      "FOJ – folga (sem descrição)",
      "FO* – folga (com descrição)",
      "LP – licença-prêmio",
      "FÉRIAS – férias",
      "CFP_DIA – CFP (dia)",
      "CFP_NOITE – CFP (noite)",
      "OUTROS – com descrição",
      "SS – superior de sobreaviso",
      "EXP_SS – expediente superior de sobreaviso",
      "FO – folga",
      "PF – ponto facultativo",
    ];

    doc.fontSize(8).text(legenda.join(" | "), { align: "left" });
    doc.moveDown(0.8);

    const startX = 40;
    let y = doc.y;
    const col1 = 280;
    const col2 = 90;
    const col3 = 160;

    const max = (...vals) => vals.reduce((a, b) => (a > b ? a : b), 0);

    const drawRow = (oficial, situacao, obs) => {
      doc.fontSize(9);

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

    drawRow("OFICIAL", "SITUAÇÃO", "OBSERVAÇÃO");

    for (const r of data) {
      drawRow(
        String(r.nome || "").toUpperCase(),
        normalizarSituacao(r.situacao || "").toUpperCase(),
        String(r.observacao || "")
      );
    }

    doc.fontSize(10).text(`SÃO PAULO, ${hojeBr}.`, 40, doc.page.height - 60, { align: "left" });
    doc.end();
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`SITUAÇÃO REAL 4º BPM/M rodando na porta ${port}`);
});
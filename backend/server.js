const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "sitreal",
  waitForConnections: true,
  connectionLimit: 10,
});

function hoje() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

/* ============================= */
/* LISTAR SITUAÇÃO DO DIA */
/* ============================= */

app.get("/api/situacao", async (req, res) => {
  try {
    const data = hoje();

    const [oficiais] = await pool.query(`
      SELECT id, nome
      FROM oficiais
      ORDER BY nome
    `);

    const [situacoes] = await pool.query(
      `
      SELECT oficial_id, situacao
      FROM situacao_oficial
      WHERE data = ?
    `,
      [data]
    );

    const mapa = {};

    situacoes.forEach((s) => {
      mapa[s.oficial_id] = s.situacao;
    });

    const resultado = oficiais.map((o) => ({
      id: o.id,
      nome: o.nome,
      situacao: mapa[o.id] || "",
    }));

    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).send("erro");
  }
});

/* ============================= */
/* SALVAR SITUAÇÃO */
/* ============================= */

app.post("/api/situacao", async (req, res) => {
  try {
    const { oficial_id, situacao } = req.body;
    const data = hoje();

    const [existe] = await pool.query(
      `
      SELECT id
      FROM situacao_oficial
      WHERE oficial_id = ? AND data = ?
    `,
      [oficial_id, data]
    );

    if (existe.length > 0) {
      await pool.query(
        `
        UPDATE situacao_oficial
        SET situacao = ?
        WHERE oficial_id = ? AND data = ?
      `,
        [situacao, oficial_id, data]
      );
    } else {
      await pool.query(
        `
        INSERT INTO situacao_oficial
        (oficial_id, data, situacao)
        VALUES (?, ?, ?)
      `,
        [oficial_id, data, situacao]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).send("erro");
  }
});

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
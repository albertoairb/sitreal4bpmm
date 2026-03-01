
import express from "express";
import mysql from "mysql2/promise";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT
});

app.get("/", async (req, res) => {
  res.send("SITREAL 4BPMM ONLINE");
});

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});

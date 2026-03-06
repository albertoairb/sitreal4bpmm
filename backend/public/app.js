const $ = (sel) => document.querySelector(sel);

let SITUACOES = [];
let DESCRICOES = {};
let ESTADO = []; // {oficial_id, nome, situacao, observacao}

function toast(msg) {
  const el = $("#toast");
  if (!el) return alert(msg);
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(window.__t);
  window.__t = setTimeout(() => (el.style.opacity = "0"), 2200);
}

async function apiGet(url) {
  const r = await fetch(url, { cache: "no-store" });
  return r.json();
}

async function apiPost(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  return r.json();
}

/**
 * ✅ Correção: atualiza a data mesmo se o HTML tiver id diferente.
 * Troca qualquer "CARREGANDO..." por "DATA: dd/mm/aaaa".
 */
function renderHeader(hojeBr) {
  const txt = hojeBr ? `DATA: ${hojeBr}` : "DATA: -";

  // tenta ids mais comuns
  const ids = ["#hoje", "#dataHoje", "#dataRef", "#lblData"];
  for (const id of ids) {
    const el = document.querySelector(id);
    if (el) el.textContent = txt;
  }

  // tenta classe (caso o HTML use classe)
  document.querySelectorAll(".js-hoje").forEach((el) => {
    el.textContent = txt;
  });

  // fallback extra: se existir um "pill" com CARREGANDO..., troca também
  // (não mexe em botões; só troca se o texto for exatamente "CARREGANDO..." ou começar com isso)
  document.querySelectorAll("body *").forEach((el) => {
    if (!el || !el.textContent) return;
    const t = el.textContent.trim();
    if (t === "CARREGANDO..." || t === "CARREGANDO") {
      el.textContent = txt;
    }
  });
}

function renderTabela() {
  const tbody = $("#tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  for (const row of ESTADO) {
    const tr = document.createElement("tr");

    const tdOf = document.createElement("td");
    tdOf.className = "col-oficial";
    tdOf.textContent = String(row.nome || "").toUpperCase();

    const tdSit = document.createElement("td");
    const sel = document.createElement("select");
    sel.className = "sit";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "";
    sel.appendChild(opt0);

    for (const s of SITUACOES) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = DESCRICOES[s] ? `${s} – ${DESCRICOES[s]}` : s;
      sel.appendChild(opt);
    }

    sel.value = row.situacao || "";
    sel.addEventListener("change", () => {
      row.situacao = sel.value || "";
    });

    tdSit.appendChild(sel);

    const tdObs = document.createElement("td");
    const inp = document.createElement("textarea");
    inp.className = "obs";
    inp.rows = 2;
    inp.placeholder = "livre";
    inp.value = row.observacao || "";
    inp.addEventListener("input", () => {
      row.observacao = inp.value;
    });
    tdObs.appendChild(inp);

    const tdAcao = document.createElement("td");
    const btn = document.createElement("button");
    btn.className = "btn-small";
    btn.textContent = "SALVAR";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "SALVANDO...";
      try {
        const out = await apiPost("/api/estado", {
          oficial_id: row.oficial_id,
          situacao: (row.situacao || "").toString().trim(),
          observacao: (row.observacao || "").toString().trim(),
        });
        if (!out.ok) throw new Error(out.error || "falha ao salvar");
        toast("SALVO");
      } catch (e) {
        toast(`ERRO: ${e.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = "SALVAR";
      }
    });

    tdAcao.appendChild(btn);

    tr.appendChild(tdOf);
    tr.appendChild(tdSit);
    tr.appendChild(tdObs);
    tr.appendChild(tdAcao);

    tbody.appendChild(tr);
  }
}

async function carregar() {
  const cfg = await apiGet("/api/config");
  SITUACOES = Array.isArray(cfg.situacoes) ? cfg.situacoes : [];
  DESCRICOES = cfg && typeof cfg.descricoes === "object" && cfg.descricoes ? cfg.descricoes : {};

  const out = await apiGet("/api/estado");
  if (!out.ok) throw new Error(out.error || "falha ao carregar estado");

  // ✅ aqui é onde atualiza a data
  renderHeader(out.hoje_br);

  ESTADO = Array.isArray(out.data)
    ? out.data.map((r) => ({
        oficial_id: r.oficial_id,
        nome: r.nome,
        situacao: r.situacao || "",
        observacao: r.observacao || "",
      }))
    : [];

  renderTabela();
}

async function salvarTudoBulk() {
  const btn = $("#btnSalvarTudo");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "SALVANDO...";
  }

  try {
    const itens = ESTADO.map((r) => ({
      oficial_id: r.oficial_id,
      situacao: (r.situacao || "").toString().trim(),
      observacao: (r.observacao || "").toString().trim(),
    }));

    const out = await apiPost("/api/estado/bulk", { itens });
    if (!out.ok) throw new Error(out.error || "falha ao salvar tudo");

    toast(`SALVO (${out.qtd})`);

    // confirma no próprio app (recarrega do banco)
    await carregar();
  } catch (e) {
    toast(`ERRO: ${e.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "SALVAR TUDO";
    }
  }
}

function abrirPdf() {
  // cache-busting no link (força PDF novo sempre)
  window.open("/api/pdf?t=" + Date.now(), "_blank");
}

function wire() {
  const b1 = $("#btnRecarregar");
  if (b1) b1.addEventListener("click", async () => {
    try {
      await carregar();
      toast("ATUALIZADO");
    } catch (e) {
      toast(`ERRO: ${e.message}`);
    }
  });

  const b2 = $("#btnPdf");
  if (b2) b2.addEventListener("click", abrirPdf);

  const b3 = $("#btnSalvarTudo");
  if (b3) b3.addEventListener("click", salvarTudoBulk);
}

(async function main() {
  try {
    wire();
    await carregar();
  } catch (e) {
    toast(`ERRO: ${e.message}`);
  }
})();

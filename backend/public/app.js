const FALLBACK_SITUACOES = [
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
  "PF"
];

let SITUACOES = [...FALLBACK_SITUACOES];
let ESTADO_ATUAL = [];

function el(id) {
  return document.getElementById(id);
}

function normalizarSituacao(v) {
  const s = String(v || "").trim();
  return s === "EXP-SS" ? "EXP_SS" : s;
}

function atualizarData(texto) {
  const alvo = el("hoje");
  if (!alvo) return;

  if (texto) {
    alvo.textContent = `DATA: ${texto}`;
    return;
  }

  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, "0");
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const ano = hoje.getFullYear();
  alvo.textContent = `DATA: ${dia}/${mes}/${ano}`;
}

function mostrarToast(msg, erro = false) {
  const toast = el("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.style.background = erro ? "#c0392b" : "#2ed573";
  toast.style.opacity = "1";
  setTimeout(() => {
    toast.style.opacity = "0";
  }, 2000);
}

function criarSelect(valorAtual) {
  const select = document.createElement("select");

  SITUACOES.forEach((sit) => {
    const opt = document.createElement("option");
    opt.value = sit;
    opt.textContent = sit;
    if (sit === normalizarSituacao(valorAtual)) opt.selected = true;
    select.appendChild(opt);
  });

  if (!SITUACOES.includes(normalizarSituacao(valorAtual))) {
    select.value = "";
  }

  return select;
}

function montarLinha(item) {
  const tr = document.createElement("tr");

  const tdNome = document.createElement("td");
  tdNome.className = "col-oficial";
  tdNome.textContent = item.nome || "";

  const tdSituacao = document.createElement("td");
  const select = criarSelect(item.situacao || "");
  tdSituacao.appendChild(select);

  const tdObs = document.createElement("td");
  const textarea = document.createElement("textarea");
  textarea.rows = 2;
  textarea.placeholder = "livre";
  textarea.value = item.observacao || "";
  tdObs.appendChild(textarea);

  const tdAcao = document.createElement("td");
  const btn = document.createElement("button");
  btn.className = "btn-small";
  btn.textContent = "SALVAR";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "SALVANDO...";
    try {
      const resp = await fetch("/api/estado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oficial_id: item.oficial_id,
          situacao: select.value,
          observacao: textarea.value,
        }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.ok) throw new Error(json.error || "erro ao salvar");
      item.situacao = select.value;
      item.observacao = textarea.value;
      mostrarToast("Salvo");
    } catch (e) {
      mostrarToast(String(e.message || e), true);
    } finally {
      btn.disabled = false;
      btn.textContent = "SALVAR";
    }
  });
  tdAcao.appendChild(btn);

  tr.appendChild(tdNome);
  tr.appendChild(tdSituacao);
  tr.appendChild(tdObs);
  tr.appendChild(tdAcao);
  return tr;
}

function renderTabela() {
  const tbody = el("tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  ESTADO_ATUAL.forEach((item) => tbody.appendChild(montarLinha(item)));
}

async function carregarConfiguracao() {
  try {
    const resp = await fetch("/api/config", { cache: "no-store" });
    if (!resp.ok) throw new Error("config indisponível");
    const json = await resp.json();
    if (Array.isArray(json.situacoes) && json.situacoes.length) {
      SITUACOES = ["", ...json.situacoes.map(normalizarSituacao).filter(Boolean)];
    }
  } catch (_e) {
    SITUACOES = [...FALLBACK_SITUACOES];
  }
}

async function carregarEstado() {
  const resp = await fetch("/api/estado", { cache: "no-store" });
  const json = await resp.json();
  if (!resp.ok || !json.ok) throw new Error(json.error || "erro ao carregar dados");

  atualizarData(json.hoje_br);

  ESTADO_ATUAL = Array.isArray(json.data)
    ? json.data.map((r) => ({
        oficial_id: r.oficial_id,
        nome: r.nome || "",
        situacao: normalizarSituacao(r.situacao || ""),
        observacao: r.observacao || "",
      }))
    : [];

  renderTabela();
}

async function salvarTudo() {
  const btn = el("btnSalvarTudo");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "SALVANDO...";
  }

  try {
    const itens = [];
    const linhas = Array.from(document.querySelectorAll("#tbody tr"));

    linhas.forEach((tr, idx) => {
      const select = tr.querySelector("select");
      const textarea = tr.querySelector("textarea");
      const item = ESTADO_ATUAL[idx];
      if (!item) return;

      itens.push({
        oficial_id: item.oficial_id,
        situacao: select ? select.value : item.situacao,
        observacao: textarea ? textarea.value : item.observacao,
      });
    });

    const resp = await fetch("/api/estado/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens }),
    });

    const json = await resp.json();
    if (!resp.ok || !json.ok) throw new Error(json.error || "erro ao salvar tudo");

    mostrarToast("Salvo");
    await carregarEstado();
  } catch (e) {
    mostrarToast(String(e.message || e), true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "SALVAR TUDO";
    }
  }
}

function registrarEventos() {
  el("btnRecarregar")?.addEventListener("click", () => {
    carregarEstado().catch((e) => mostrarToast(String(e.message || e), true));
  });

  el("btnSalvarTudo")?.addEventListener("click", () => {
    salvarTudo();
  });

  el("btnPdf")?.addEventListener("click", () => {
    window.open("/api/pdf", "_blank");
  });
}

async function iniciar() {
  atualizarData();
  registrarEventos();
  await carregarConfiguracao();
  await carregarEstado();
}

iniciar().catch((e) => mostrarToast(String(e.message || e), true));
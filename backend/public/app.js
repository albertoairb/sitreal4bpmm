// ===============================
// SITUAÇÕES DISPONÍVEIS
// ===============================

const SITUACOES = [
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

// ===============================
// CARREGAR DATA
// ===============================

function atualizarData() {
  const el = document.getElementById("hoje");
  if (!el) return;

  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, "0");
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const ano = hoje.getFullYear();

  el.innerText = `DATA: ${dia}/${mes}/${ano}`;
}

atualizarData();

// ===============================
// POPULAR SELECTS
// ===============================

function criarSelect(valorAtual) {
  const select = document.createElement("select");

  SITUACOES.forEach((sit) => {
    const opt = document.createElement("option");
    opt.value = sit;
    opt.textContent = sit;

    if (sit === valorAtual) {
      opt.selected = true;
    }

    select.appendChild(opt);
  });

  return select;
}

// ===============================
// CARREGAR TABELA
// ===============================

async function carregar() {
  const tbody = document.getElementById("tbody");

  const resp = await fetch("/api/oficiais");
  const dados = await resp.json();

  tbody.innerHTML = "";

  dados.forEach((of) => {
    const tr = document.createElement("tr");

    const tdNome = document.createElement("td");
    tdNome.textContent = of.nome;

    const tdSituacao = document.createElement("td");
    const select = criarSelect(of.situacao);
    tdSituacao.appendChild(select);

    const tdObs = document.createElement("td");
    const obs = document.createElement("input");
    obs.type = "text";
    obs.value = of.obs || "";
    obs.placeholder = "livre";
    tdObs.appendChild(obs);

    const tdSalvar = document.createElement("td");
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.innerText = "SALVAR";

    btn.onclick = async () => {
      await fetch("/api/salvar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: of.id,
          situacao: select.value,
          obs: obs.value
        })
      });

      mostrarToast("Salvo");
    };

    tdSalvar.appendChild(btn);

    tr.appendChild(tdNome);
    tr.appendChild(tdSituacao);
    tr.appendChild(tdObs);
    tr.appendChild(tdSalvar);

    tbody.appendChild(tr);
  });
}

// ===============================
// SALVAR TUDO
// ===============================

document.getElementById("btnSalvarTudo")?.addEventListener("click", () => {
  carregar();
});

// ===============================
// RECARREGAR
// ===============================

document.getElementById("btnRecarregar")?.addEventListener("click", () => {
  carregar();
});

// ===============================
// PDF
// ===============================

document.getElementById("btnPdf")?.addEventListener("click", () => {
  window.open("/api/pdf", "_blank");
});

// ===============================
// TOAST
// ===============================

function mostrarToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.innerText = msg;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}

// ===============================
// INICIAR
// ===============================

carregar();
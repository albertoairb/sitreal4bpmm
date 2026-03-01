let AUTH = { login: "", senha: "" };
let SITUACOES = [];

const el = (id) => document.getElementById(id);

function setMsg(target, text, cls) {
  const e = el(target);
  e.className = cls || "";
  e.textContent = text || "";
}

async function api(path, opts = {}) {
  const headers = Object.assign(
    { "Content-Type": "application/json" },
    opts.headers || {}
  );

  if (AUTH.login && AUTH.senha) {
    headers["X-Login"] = AUTH.login;
    headers["X-Senha"] = AUTH.senha;
  }

  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "erro");
  return data;
}

function renderTabela(rows) {
  const tb = el("tbody");
  tb.innerHTML = "";

  for (const r of rows) {
    const tr = document.createElement("tr");

    const tdNome = document.createElement("td");
    tdNome.textContent = (r.nome || "").toUpperCase();
    tr.appendChild(tdNome);

    const tdSit = document.createElement("td");
    const sel = document.createElement("select");
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "";
    sel.appendChild(opt0);

    for (const s of SITUACOES) {
      const o = document.createElement("option");
      o.value = s;
      o.textContent = s;
      sel.appendChild(o);
    }
    sel.value = r.situacao || "";
    tdSit.appendChild(sel);
    tr.appendChild(tdSit);

    const tdObs = document.createElement("td");
    const ta = document.createElement("textarea");
    ta.value = r.observacao || "";
    tdObs.appendChild(ta);
    tr.appendChild(tdObs);

    const tdBtn = document.createElement("td");
    const btn = document.createElement("button");
    btn.textContent = "SALVAR";
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await api("/api/estado", {
          method: "POST",
          body: JSON.stringify({
            oficial_id: r.oficial_id,
            situacao: sel.value,
            observacao: ta.value
          })
        });
        setMsg("msgApp", "salvo.", "ok");
      } catch (e) {
        setMsg("msgApp", String(e.message || e), "err");
      } finally {
        btn.disabled = false;
      }
    };
    tdBtn.appendChild(btn);
    tr.appendChild(tdBtn);

    tb.appendChild(tr);
  }
}

async function carregar() {
  setMsg("msgApp", "carregando...", "muted");
  const conf = await api("/api/config");
  SITUACOES = conf.situacoes || [];
  el("listaSituacoes").textContent = SITUACOES.join(", ");

  const out = await api("/api/estado");
  el("pillData").textContent = `DATA DO DIA: ${out.hoje}`;
  renderTabela(out.data || []);
  setMsg("msgApp", "", "");
}

el("btnEntrar").onclick = async () => {
  const login = (el("login").value || "").trim();
  const senha = (el("senha").value || "").trim();

  try {
    const out = await api("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, senha })
    });

    if (!out.ok) {
      setMsg("msgLogin", "acesso negado.", "err");
      return;
    }

    AUTH = { login, senha };
    setMsg("msgLogin", "acesso liberado.", "ok");
    el("boxLogin").style.display = "none";
    el("boxApp").style.display = "block";
    await carregar();
  } catch (e) {
    setMsg("msgLogin", String(e.message || e), "err");
  }
};

el("btnRecarregar").onclick = () => carregar();

el("btnSalvarTudo").onclick = async () => {
  const rows = Array.from(el("tbody").querySelectorAll("tr"));
  el("btnSalvarTudo").disabled = true;
  try {
    for (const tr of rows) {
      const nome = tr.children[0]?.textContent || "";
      const sel = tr.children[1]?.querySelector("select");
      const ta = tr.children[2]?.querySelector("textarea");
      const btn = tr.children[3]?.querySelector("button");

      // Descobre o oficial_id pelo índice em memória: não temos aqui.
      // Então, fazemos o clique no botão individual para reaproveitar a lógica.
      if (btn) await btn.onclick();
    }
    setMsg("msgApp", "salvar tudo concluído.", "ok");
  } catch (e) {
    setMsg("msgApp", String(e.message || e), "err");
  } finally {
    el("btnSalvarTudo").disabled = false;
  }
};

let SITUACOES = [];

const el = (id) => document.getElementById(id);

function setMsg(text, cls) {
  const e = el("msgApp");
  e.className = cls || "";
  e.textContent = text || "";
}

async function api(path, opts = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
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
        setMsg("salvo.", "ok");
      } catch (e) {
        setMsg(String(e.message || e), "err");
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
  setMsg("carregando...", "muted");
  const conf = await api("/api/config");
  SITUACOES = conf.situacoes || [];
  el("listaSituacoes").textContent = SITUACOES.join(", ");

  const out = await api("/api/estado");
  el("pillData").textContent = `DATA DO DIA: ${out.hoje_br || out.hoje}`;
  renderTabela(out.data || []);
  setMsg("", "");
}

el("btnRecarregar").onclick = () => carregar();

el("btnPdf").onclick = () => window.open("/api/pdf", "_blank");

el("btnSalvarTudo").onclick = async () => {
  const rows = Array.from(el("tbody").querySelectorAll("tr"));
  el("btnSalvarTudo").disabled = true;
  try {
    for (const tr of rows) {
      const btn = tr.children[3]?.querySelector("button");
      if (btn) await btn.onclick();
    }
    setMsg("salvar tudo concluído.", "ok");
  } catch (e) {
    setMsg(String(e.message || e), "err");
  } finally {
    el("btnSalvarTudo").disabled = false;
  }
};

carregar();

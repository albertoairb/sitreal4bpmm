async function carregar() {
  const res = await fetch("/api/situacao");
  const dados = await res.json();

  const tabela = document.getElementById("tabela");
  tabela.innerHTML = "";

  dados.forEach((of) => {
    const tr = document.createElement("tr");

    const tdNome = document.createElement("td");
    tdNome.innerText = of.nome;

    const tdSit = document.createElement("td");

    const select = document.createElement("select");

    const opVazio = document.createElement("option");
    opVazio.value = "";
    opVazio.text = "";
    select.appendChild(opVazio);

    const opcoes = [
      "MA",
      "VE",
      "EXP",
      "FO",
      "FO*",
      "CURSO",
      "ATESTADO",
    ];

    opcoes.forEach((o) => {
      const op = document.createElement("option");
      op.value = o;
      op.text = o;
      select.appendChild(op);
    });

    select.value = of.situacao || "";

    select.onchange = async () => {
      await fetch("/api/situacao", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          oficial_id: of.id,
          situacao: select.value,
        }),
      });
    };

    tdSit.appendChild(select);

    tr.appendChild(tdNome);
    tr.appendChild(tdSit);

    tabela.appendChild(tr);
  });
}

carregar();
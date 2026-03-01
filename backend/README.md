SITUAÇÃO REAL DOS OFICIAIS – 4º BPM/M
Data: 01 MAR 2026 (São Paulo)

1) O que é
- quadro do dia (apenas 1 dia por vez)
- vira o dia: zera automaticamente (sem histórico)
- situações: VE, MA, SR, FO*, FOJ, EXP, EXP-SS, FÉRIAS, LP, CURSO, OUTROS
- descrição (observação) liberada em qualquer situação

2) Rodar local (MySQL)
2.1) criar banco e tabelas
- rode o arquivo backend/schema.sql no seu MySQL

2.2) configurar .env
- copie .env.example para backend/.env e ajuste DB_* (ou use MYSQL* do Railway)

2.3) iniciar
- cd backend
- npm install
- npm start
- abra: http://localhost:3000

3) Railway (recomendado)
3.1) GitHub
- suba este projeto no GitHub

3.2) Railway
- New Project -> Deploy from GitHub Repo
- Add Plugin -> MySQL
- Settings -> Variables:
  - LOGIN_UNIDADE=4BPMM
  - SENHA_UNIDADE=OFICIAL4M
  - TIMEZONE=America/Sao_Paulo

3.3) Inicializar dados
- No MySQL do Railway, execute backend/schema.sql (inclui a lista inicial de oficiais)
- Observação: se já tiver oficiais, comente o INSERT no schema.sql antes de rodar.

Pronto.

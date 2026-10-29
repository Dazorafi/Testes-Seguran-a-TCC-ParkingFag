# Parking FAG — Totem e Mobile

React / TypeScript / Vite. Dados oficiais do Java, atualizações WebSocket, reservas
persistentes de 90 segundos e confirmação privada. Landing page removida.

- `/` e `/totem`: painel com contagens e estados.
- `/mobile`: reserva, tempo restante, confirmação e alternativa.
- `/painel`: alias legado do totem.

```powershell
npm ci
npm run dev
```

Copie `.env.example` na primeira preparação. Mantenha VITE_API_BASE_URL vazio para
usar `/api` pela mesma origem. No desenvolvimento, Vite encaminha ao Java.

Para acesso externo, use build e o servidor com lista de APIs permitidas:

```powershell
npm run build
npm run serve
# Em outro terminal:
cloudflared tunnel --url http://127.0.0.1:4173
```

`serve` lê JAVA_PROXY_URL, PUBLIC_BIND e PUBLIC_PORT do processo. A execução integrada
é feita pelo `scripts/run-stack.ps1` no repositório Java, que prepara os três serviços.
Não exponha o servidor Vite ou o Java diretamente à internet.

[Detalhes dos fluxos](docs/RESERVATIONS.md). Guia completo de preparação, túnel,
variáveis e encerramento: `orchestrador-parking-fag/docs/EXECUCAO_RESERVAS.md`.

```powershell
npm run lint
npm test
npm run build
```

HTTP de segurança: 15s; retry de falha: 30s. Token fica em cookie HttpOnly, nunca no
localStorage. Horários explicitamente em America/Sao_Paulo. PCD monitorada, sem reserva
online até definir elegibilidade. Alternativas usam proximidade visual estimada.

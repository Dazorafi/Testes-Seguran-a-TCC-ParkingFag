# Interfaces operacionais

`/` e `/totem`: painel informativo, contagens, estados e legenda. `/painel` é alias legado.
`/mobile`: painel de vagas sem mapa ou seletor de visualização, reserva comum por 90s,
cancelamento, confirmação privada e alternativa.
Landing page e estilos institucionais foram removidos. Não há nova dependência de UI.

`npm run dev` é somente desenvolvimento. Para acesso externo use `npm run build` e
`npm run serve`, com JAVA_PROXY_URL=http://127.0.0.1:8080 no ambiente do processo.
O servidor lê PUBLIC_BIND (padrão 127.0.0.1) e PUBLIC_PORT (4173), não arquivos .env.
O launcher no Java configura esses valores e inicia os três projetos.

WebSocket público `/api/v1/events`: snapshots versionados sem dados privados. Versões
antigas não sobrepõem estados mais novos. Consulta de segurança 15s; falha HTTP 30s;
reconexão WebSocket 3s. Cache permite leitura durante falhas, mas desabilita novas reservas.
Reservas são consultadas por cookie HttpOnly: nenhum token vai para localStorage/URL.
O temporizador usa serverTime/expiresAt e tempo monotônico decorrido; sua exibição
não encerra reservas no navegador. Voltar à aba refaz a consulta privada.

Guia integrado: `orchestrador-parking-fag/docs/EXECUCAO_RESERVAS.md` no workspace.
Distância entre vagas: estimativa visual autorizada pelo usuário, sem valores em metros.
PCD não pode ser reservada até definir elegibilidade. Horários: America/Sao_Paulo.

Validações: `npm run lint`, `npm test` (componentes + servidor público), `npm run build`.
Os testes cobrem reserva, prazo exibido, confirmação/rejeição, alternativa, conflitos,
privacidade, ordenação/reconexão e bloqueio das APIs internas na fronteira pública.

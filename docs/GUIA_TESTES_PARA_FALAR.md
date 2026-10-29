# Guia para explicar os testes de seguranca

## Abertura

"Criamos testes automatizados nos fontes reais do Parking FAG. Usamos sessoes e dados sinteticos. Na API, os controllers e servicos reais trabalham com H2 em memoria, sem alterar o MySQL operacional. Os componentes React usam um DOM de teste, e o proxy e exercitado por requisicoes HTTP locais."

Os quatro grupos pedidos foram IDOR, criptografia/senhas, injecao e bots. A primeira execucao teve 43 casos de seguranca: 41 aprovados e dois reprovados. Corrigimos essas duas falhas e adicionamos dois testes de regressao. Na versao corrigida, os 45 casos de seguranca passaram localmente. Um desses casos registra que as leituras do proxy nao tem limite, em vez de afirmar que bots de leitura sao bloqueados.

## IDOR — trocar o identificador para tentar alterar algo de outro usuario

"Criamos as sessoes A e B. A reservou uma vaga. Com B, tentamos cancelar, confirmar e rejeitar a reserva de A usando seu identificador verdadeiro. Antes, preparamos a ocupacao para que confirmar e rejeitar fossem operacoes validas; depois repetimos com A como controle positivo."

Rotas reais:

```http
POST /api/v1/reservations/ID_DA_RESERVA_DE_A/cancel
POST /api/v1/reservations/ID_DA_RESERVA_DE_A/confirm
POST /api/v1/reservations/ID_DA_RESERVA_DE_A/reject
Cookie: parking_session=SESSAO_DE_B
X-Parking-Client: mobile
```

"B recebeu 404 e nao alterou a reserva. A conseguiu executar a operacao. Tambem testamos a consulta privada de outra sessao e uma alteracao sem sessao, que recebeu 401."

Mostre `SecurityIntegrationTest.java`, especialmente `idorBlocksOtherSessionEvenWithValidKnownId` e `idorCurrentReservationIsPrivateAndAnonymousMutationIsRejected`.

## Criptografia e senhas — proteger a credencial da sessao

"Nao ha login por senha de usuario no projeto. Por isso, testamos os tokens de sessao, o cookie e a chave de ingestao. Verificamos SHA-256 do token no banco, ausencia do token nos snapshots publicos/logs exercitados, formato das sessoes e cookies HttpOnly, SameSite e Secure."

Hash nao e criptografia reversivel, e SHA-256 de token aleatorio nao substitui um algoritmo apropriado para senhas humanas. Nao afirmamos ter testado login por senha, certificados externos ou criptografia do disco.

"Encontramos uma falha: sem chave configurada, POST /api/v1/logs aceitou um log anonimo com 200. Mantivemos o teste esperando 401 e corrigimos o interceptor para negar tambem quando a chave esta vazia. Agora ele passa."

Mostre `SecurityFailClosedTest.java` e o trecho corrigido de `WebConfiguration.java`. Os arquivos de evidencia da primeira versao sao historicos; nao confunda os resultados antigos com os atuais.

## Injecao — enviar instrucoes em campos de dados

"Enviamos identificadores de vaga contendo SQL, script, expressao, comando e caminho de arquivo. A API rejeitou os identificadores invalidos com 400 e verificamos que o banco continuava operacional."

Exemplo:

```http
POST /api/v1/reservations
Content-Type: application/json

{"spotCode":"' OR '1'='1"}
```

Outras cargas: `SEC-A; DROP TABLE parking_spots;--`, `<script>alert(1)</script>`, `$(echo SECURITY_PROBE)` e `../../etc/passwd`.

"No React, verificamos que textos maliciosos nao criavam tags de script no DOM. No Python, a configuracao rejeitou identificadores maliciosos e uma expressao de comando permaneceu texto, sem executar o comando canario. Mensagens de log foram armazenadas literalmente como dados."

Mostre `injectionInReservationIsRejectedWithoutDatabaseMutation`, `security.test.tsx` e `tests/test_security.py`. Nao afirme que houve execucao de comando no sistema operacional: o objetivo foi verificar bloqueio ou tratamento literal.

## Bots — automatizar tentativas e contornar limites

"Enviamos 61 tentativas com o mesmo endereco de conexao. O limitador retornou 429 em parte delas. Depois variamos X-Forwarded-For e cookies: a API direta nao bloqueou nenhuma, revelando que a identidade usada no limite podia ser influenciada pelo cabecalho."

"Corrigimos capturando o endereco da conexao antes de interpretar os cabecalhos. Repetimos a tentativa com X-Forwarded-For e Forwarded, mantendo o controle positivo com endereco estavel. Os testes passaram. Tambem preservamos um teste de cookie Secure com HTTPS encaminhado."

O proxy publico ja removia o cabecalho forjado. A exploracao inicial foi demonstrada no acesso direto ao Java, nao atraves desse proxy. O limite visto pelo Java continua compartilhado quando todos os clientes chegam pelo mesmo proxy; nao e uma solucao completa de gestao de bots.

"Testamos ainda corpo de requisicao acima do limite, limite do handler WebSocket, fila de logs e espera progressiva do monitor. O caso do WebSocket usa sessoes simuladas; nao e um teste de carga com 101 conexoes TCP. Nao realizamos um ataque de negacao de servico."

Mostre os casos `botsAreRateLimitedEvenWhenRotatingCookiesAndSpoofingForwardedIp`, `rfcForwardedAddressAlsoCannotEvadeRateLimit`, `websocketConnectionCapRejectsClient101` e o arquivo `scripts/security.test.mjs` do frontend.

## Transicao para CI/CD

"Depois de executar localmente, colocamos esses testes no GitHub Actions. Cada PR para main executa os checks. Apos merge, o CI de main gera o JAR e o frontend. Outro workflow entrega esses builds ao computador servidor e so conclui quando a aplicacao responde com monitoramento ativo e o commit correto."

Mostre os YAMLs na raiz, os checks reais do PR e o deploy. Os logs locais e os arquivos YAML sao preparacao; a execucao da aba Actions e o acesso ao commit servido comprovam a demonstracao remota.

## Encerramento

"Os testes aprovados cobrem os cenarios exercitados; nao certificam ausencia de todas as vulnerabilidades. As duas falhas foram encontradas por testes que permaneceram ativos depois da correcao."

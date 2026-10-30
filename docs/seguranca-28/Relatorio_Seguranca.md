# Testes de segurança do Parking FAG

Execução em 28 de outubro de 2026, no ambiente local de desenvolvimento Windows.

Foram desenvolvidos e executados testes sobre os fontes dos três repositórios em `C:\Users\Ti\Desktop\GPT\TCC`. A suíte de segurança executou **43 casos, com 41 aprovados e 2 reprovados**. Os dois testes reprovados reproduzem falhas da API Java. Não foram alteradas as regras de produção para fazer os testes passarem.

## Resultado da execução

| Suíte | Executados | Aprovados | Reprovados | Evidência |
|---|---:|---:|---:|---|
| API Java e configuração sem chave | 24 | 22 | 2 | `evidencias/java-security.log` e `evidencias/java-reports/TEST-junit-jupiter.xml` |
| Proxy público Node | 7 | 7 | 0 | `evidencias/node-security.log` |
| Componentes React | 3 | 3 | 0 | `evidencias/react-security.log` |
| Monitor Python | 9 | 9 | 0 | `evidencias/python-security.log` e XML |
| **Total da suíte de segurança** | **43** | **41** | **2** | |

Um dos sete casos do proxy é uma observação que confirma a ausência de limite em leituras. Ele passa ao reproduzir essa condição; sua aprovação não representa bloqueio de bots nessa rota. Os números contam casos parametrizados individualmente e não incluem a auditoria de dependências.

Também foram executados 15 testes Java existentes, todos aprovados; a suíte existente de frontend com os novos testes React, com 26 casos Vitest e 1 teste de servidor aprovados; e os 19 testes Python, incluindo os novos, aprovados. Esses totais de regressão têm sobreposição com os casos de segurança e não devem ser somados ao total de 43. Lint e build do frontend passaram.

## IDOR

Foram criadas duas sessões independentes. A primeira reservou uma vaga; a segunda tentou cancelar, confirmar e rejeitar essa mesma reserva utilizando seu identificador verdadeiro. A ocupação foi preparada antes das tentativas, para que a operação fosse válida e o teste realmente verificasse a propriedade da reserva.

Nas três tentativas, a sessão indevida recebeu **HTTP 404**, sem alteração da reserva. Em seguida, a sessão proprietária conseguiu executar a mesma operação com **HTTP 200**, como controle positivo. A consulta de reserva atual por outra sessão não revelou a reserva, e uma alteração sem sessão recebeu **HTTP 401**. Também foi tentada a inclusão de campos de proprietário e identificador no JSON; o backend manteve o proprietário derivado do cookie e gerou seu próprio identificador.

**Resultado:** controle de acesso aprovado para os cenários exercitados. Isso não equivale a uma certificação de todas as rotas ou de todas as formas de IDOR.

## Criptografia e senhas

O projeto não possui cadastro ou autenticação de usuários por senha. A reserva depende de um token de sessão anônimo. Por isso, testes de senha de usuário, recuperação de senha, complexidade e bloqueio de login foram classificados como **não aplicáveis ao fluxo atual**.

Os testes executados verificaram:

- cookie com `HttpOnly`, `SameSite=Strict`, caminho limitado à API e `Secure` quando a requisição é HTTPS;
- resposta privada com `Cache-Control: no-store`;
- formato do token e ausência de repetição em uma amostra de 64 sessões; essa amostra não prova matematicamente sua entropia;
- substituição de cookie malformado;
- persistência do SHA-256 do token, sem guardar o valor bruto no campo de hash;
- ausência do token e do hash nos snapshots públicos e nos logs de reserva exercitados;
- rejeição de chaves de ingestão ausentes e incorretas quando a chave está configurada.

O hash de um token aleatório não deve ser confundido com armazenamento de senhas humanas. Se login por senha for acrescentado, será necessário um teste específico para um algoritmo de derivação de senha apropriado. Criptografia em disco, certificados externos e negociação TLS não foram testados.

### Falha 1 — Ingestão aceita gravação sem chave configurada

**Teste:** `SecurityFailClosedTest.missingConfiguredIngestionSecretMustNotPermitAnonymousWrites`.

Em um contexto isolado com `parking.api-key` vazia, foi enviado um `POST /api/v1/logs` válido, sem cabeçalho de autenticação, contendo somente um log sintético.

| Critério de segurança | Observado |
|---|---|
| Negar a gravação sem segredo configurado, retornando HTTP 401 | A API retornou **HTTP 200** e aceitou a gravação |

O teste ficou reprovado: `Status expected:<401> but was:<200>`. Em `WebConfiguration`, a comparação da chave só ocorre quando a configuração não está vazia.

**Condição de exposição:** o backend precisa estar acessível ao agente que faz a requisição. A configuração padrão prende o Java ao loopback; o launcher integrado fornece uma chave temporária e o proxy público bloqueia a ingestão. Esses controles reduzem a exposição externa, mas o backend isolado continua aceitando a gravação nessa configuração.

**Correção proposta:** rejeitar ingestão quando a chave estiver ausente, ou impedir a inicialização do serviço de ingestão sem uma chave definida. Depois, repetir o mesmo teste até obter a rejeição esperada. A correção não foi aplicada nesta entrega de testes.

Na revisão de configuração também foi identificado o fallback local `root` para a senha do MySQL em `application.yml`. Isso é um achado de inspeção, não um teste de acesso ao banco: não foi feita tentativa de login no MySQL operacional. Para implantação, exigir credenciais próprias e retirar o fallback local.

## Injeção de código

Foram enviadas cargas de SQL, HTML/script, expressão e comando em campos de identificação de vaga. O Java retornou **HTTP 400**, sem criar reserva ou destruir o catálogo. A consulta de alternativa com metacaracteres SQL retornou **HTTP 404**, e uma consulta válida posterior confirmou que o repositório continuava operacional.

Uma carga de injeção enviada como mensagem de log foi armazenada literalmente. No React, três cargas foram renderizadas como texto pelo componente real `ParkingMap`, sem criação de elementos `script`, `img` ou atributos `onerror` no DOM.

No Python, identificadores maliciosos de configuração foram rejeitados. O carregador `.env` manteve uma expressão como texto e não executou o comando canário; também preservou um segredo já definido no ambiente. Um servidor HTTP local recebeu o corpo JSON literal do cliente real, com a chave sintética no cabeçalho e ausente do corpo e da URL. Não foi feito envio de segredos reais.

O proxy foi exercitado por HTTP para confirmar bloqueio de rotas internas, tentativas de travessia de diretório, requisições de outra origem e políticas de navegador contra script externo e enquadramento da página.

**Resultado:** as cargas testadas foram bloqueadas ou tratadas como dados. A suíte não cobre todas as técnicas de injeção e não faz afirmações sobre bibliotecas fora dos caminhos exercitados.

## Bots e abuso automatizado

Com endereço de origem estável, uma sequência de 61 tentativas recebeu **HTTP 429**, confirmando a atuação do limitador. O número 61 permite que haja uma única mudança de minuto durante a execução sem invalidar o controle. Requisições sem o cabeçalho de cliente foram bloqueadas, mas esse cabeçalho é conhecido e não deve ser tratado como prova de que o solicitante é humano.

O teste de WebSocket verificou o limite do handler: os primeiros 100 clientes foram aceitos e o 101º foi encerrado com `SERVICE_OVERLOAD`. Esse caso usa sessões WebSocket simuladas e o handler real; não representa um ensaio de carga com 101 conexões TCP. O proxy rejeitou corpo de 4.097 bytes com **HTTP 413**, sem encaminhá-lo ao backend.

No monitor Python, mil tentativas de envio dentro de um segundo de falha produziram somente uma chamada graças à espera progressiva. A fila de logs permaneceu limitada a mil eventos. Esses controles limitam o consumo do monitor; não substituem proteção antibot do servidor.

### Falha 2 — Limite contornado por cabeçalho de endereço no acesso direto ao Java

**Teste:** `SecurityIntegrationTest.botsAreRateLimitedEvenWhenRotatingCookiesAndSpoofingForwardedIp`.

Foram enviadas 61 requisições com o mesmo endereço de conexão de teste, alternando cookies sintéticos e o cabeçalho `X-Forwarded-For`. O cenário exige que a API não confie em endereços encaminhados por uma origem não confiável.

| Critério de segurança | Observado |
|---|---|
| Algumas requisições devem receber HTTP 429, como no controle com endereço estável | **Nenhuma** recebeu HTTP 429 |

O teste ficou reprovado por encontrar zero bloqueios. A estratégia de cabeçalhos encaminhados está em `framework`, enquanto o limitador usa `request.getRemoteAddr()`. O resultado é compatível com o cabeçalho influenciando a identidade usada pelo limitador.

**Condição de exposição:** o cenário reproduz acesso direto à API com cabeçalhos encaminhados controlados pelo cliente. O proxy oficial remove esse cabeçalho antes do encaminhamento, e esse comportamento foi confirmado por teste separado. Assim, a mesma exploração não foi demonstrada através da fronteira pública atual. Não foi realizado ataque de negação de serviço.

**Correção proposta:** definir quais proxies são confiáveis e normalizar os cabeçalhos na fronteira; revisar o endereço que alimenta o limitador e considerar limite combinado por origem e sessão. Preservar o funcionamento correto do HTTPS ao revisar a estratégia de encaminhamento. Repetir o teste de contorno e o controle positivo após a alteração.

### Observação — Consultas de leitura sem limite no proxy

Quarenta consultas consecutivas a `/api/v1/reservations/current` foram encaminhadas sem HTTP 429. Isso confirma a ausência de limite nessa rota do proxy, não a capacidade de derrubar a aplicação. Avaliar limite de leituras e de criação de sessões conforme o volume esperado.

## Auditoria complementar de dependências

`npm audit --json` identificou uma dependência transitiva com severidade máxima alta: `undici@8.11.2`, trazida por `jsdom@30.1.2`, ferramenta de desenvolvimento/teste. O JSON completo foi preservado. `npm audit --omit=dev --json` terminou sem vulnerabilidades reportadas. Isso é o resultado da auditoria de pacotes na data da execução; não é demonstração de exploração dessas vulnerabilidades nem garantia sobre toda a cadeia de dependências Java e Python.

As versões do projeto não foram atualizadas automaticamente nesta entrega.

## Ambiente e alcance

| Item | Execução |
|---|---|
| Java | Temurin 17.0.19; Spring Boot 3.5.16; dependências do `pom.xml` |
| Compilação efetivamente concluída | Eclipse ECJ 3.42.0 com alvo Java 17 |
| Execução Java | JUnit Console 1.12.2, Spring Boot, MockMvc e H2 em memória |
| Node | 24.16.0; Vitest 5.0.3; testes HTTP nativos do Node |
| Python | 3.12; pytest 9.1.1; requests 2.34.2; OpenCV 4.12.0.88; NumPy 2.2.6 |

O `javac` do Maven recebeu `AccessDeniedException` ao resolver caminhos no ambiente restrito Windows. Para concluir a execução, os fontes reais foram compilados com ECJ, utilizando o classpath resolvido do projeto, e os testes foram executados pelo JUnit Console. As falhas iniciais de preparação não foram contadas como vulnerabilidades. Os logs finais de teste são distintos dos logs de preparação.

A suíte Java usa os controllers, validação, serviços, transações e repositórios reais com H2; ela não conecta ao MySQL operacional. Os testes React usam DOM simulado. O proxy recebe requisições HTTP reais e encaminha para um servidor local de observação. O cliente Python também foi exercitado contra HTTP local, além dos testes com comunicação simulada. Os testes Java existentes incluíram uma integração WebSocket com servidor local e dois clientes reais.

Não foram testados uma câmera ao vivo, infraestrutura pública, túnel externo, certificados de produção, ataques distribuídos ou o banco MySQL real. Não foram lidos arquivos `.env`, alteradas credenciais, feitas publicações ou modificados os fontes de produção.

## Reprodução e arquivos da entrega

Os testes estão nas pastas usuais de teste dos três repositórios. O frontend possui o novo comando `npm run test:security`. A raiz `TCC` contém `TESTES_SEGURANCA.md` e `executar-testes-seguranca.ps1` para o fluxo usual com Maven, Node e Python. O script PowerShell foi validado sintaticamente; a execução Java comprovada nesta entrega é a alternativa ECJ/JUnit descrita acima, e não uma execução Maven concluída com sucesso.

O pacote inclui os fontes dos testes, instruções, logs finais, relatórios XML, resultado da auditoria e manifestos SHA-256. O manifesto registra o commit de cada repositório e hashes dos fontes avaliados. Arquivos de produção completos, dependências instaladas e segredos não integram o pacote.

Os dois casos reprovados permanecem ativos e não foram marcados como ignorados ou convertidos em testes de sucesso. O código de saída da suíte Java é 1 justamente por essas duas reprovações; as outras suítes de segurança terminaram com código 0.

## Referências

- [OWASP API1 — Broken Object Level Authorization](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/): referência para tentativas de acesso ao objeto de outra sessão.
- [OWASP API4 — Unrestricted Resource Consumption](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/): referência para limites de requisição e consumo de recursos.
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): referência para distinguir proteção de tokens de armazenamento de senhas humanas.

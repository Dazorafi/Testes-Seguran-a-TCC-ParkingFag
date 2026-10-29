# Testes de segurança do Parking FAG

Os testes executam os fontes reais dos três repositórios. O banco dos testes Java é H2 em memória, isolado do MySQL operacional. As sessões, chaves e dados inseridos são sintéticos. Nenhum teste precisa ler o arquivo `.env`.

## Arquivos

| Componente | Arquivo |
|---|---|
| API Java | `orchestrador-parking-fag/src/test/java/br/edu/fag/parking/SecurityIntegrationTest.java` |
| Configuração sem chave | `orchestrador-parking-fag/src/test/java/br/edu/fag/parking/SecurityFailClosedTest.java` |
| Proxy HTTP | `view-parking-fag/scripts/security.test.mjs` |
| React e XSS | `view-parking-fag/src/test/security.test.tsx` |
| Monitor Python | `monitoramento-vagas/tests/test_security.py` |

## Executar

Pré-requisitos: JDK 17, Node compatível com o projeto, Python 3.12 ou 3.13, dependências Java resolvidas pelo Maven, `npm ci` no frontend e dependências de desenvolvimento do monitor instaladas no ambiente Python escolhido.

Na pasta `TCC`, execute o script com os caminhos do seu ambiente:

```powershell
.\executar-testes-seguranca.ps1 -JavaHome 'D:\Eclipse Adoptium\jdk-17.0.19.10-hotspot' -PythonExe 'CAMINHO_DO_AMBIENTE_PYTHON\Scripts\python.exe'
```

O parâmetro `-MavenExe` permite usar um Maven já instalado em vez de `mvnw.cmd`. `-ReportDir` escolhe a pasta dos logs. `-MavenRepository` permite um cache Maven específico. A preparação das dependências requer rede; os testes de segurança usam somente o processo local ou servidores em `127.0.0.1`.

Comandos individuais, nas respectivas pastas:

```powershell
# API Java
.\mvnw.cmd '-Dtest=SecurityIntegrationTest,SecurityFailClosedTest' test
# Frontend
npm run test:security
# Monitor Python, com o ambiente de desenvolvimento ativo
python -m pytest tests/test_security.py -v
```

## Interpretar a execução de 28 de outubro de 2026

Foram executados 43 casos de segurança: 41 aprovados e 2 reprovados. A aprovação do caso de observação de bots de leitura significa que a ausência de limite foi reproduzida; não significa proteção dessa rota.

Os testes que devem permanecer vermelhos até as correções são:

1. `SecurityFailClosedTest.missingConfiguredIngestionSecretMustNotPermitAnonymousWrites`: esperava HTTP 401 e recebeu 200 quando `parking.api-key` está vazia. A gravação anônima de um log sintético foi aceita.
2. `SecurityIntegrationTest.botsAreRateLimitedEvenWhenRotatingCookiesAndSpoofingForwardedIp`: nenhuma das 61 requisições recebeu HTTP 429 ao variar `X-Forwarded-For` no acesso direto à API. O controle positivo com endereço estável recebeu 429.

O proxy público remove `X-Forwarded-For` enviado pelo navegador e bloqueia ingestão. A exposição das falhas depende da topologia: o Java está configurado para loopback e o launcher integrado fornece chave de ingestão. Isso reduz a exposição externa, mas não faz os testes da API passarem.

Não há login de usuários por senha. Foram testados os tokens de sessão, cookies, hash armazenado e chave de ingestão. SHA-256 sobre token aleatório não é um teste de hashing seguro de senhas humanas. Certificados HTTPS, criptografia de disco e MySQL real não foram validados.

Neste ambiente, o `javac` encontrou `AccessDeniedException` ao resolver caminhos no Windows. A execução Java foi concluída com Eclipse ECJ 3.42.0, mantendo Java 17 e as dependências resolvidas do `pom.xml`, seguida de JUnit Console 1.12.2. Os fontes de produção não foram alterados. O script acima oferece o fluxo Maven usual para execução fora dessa limitação do ambiente.

Consulte o relatório e os logs da entrega para os resultados por categoria, evidências e limitações. Testes aprovados cobrem somente as entradas e condições exercitadas, não certificam ausência de vulnerabilidades.

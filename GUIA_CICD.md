# CI e deploy local do Parking FAG

## O que esta atualizacao acrescenta

Os dois workflows ficam na raiz do repositorio, em `.github/workflows/`:

| Arquivo | Quando executa | O que faz |
|---|---|---|
| `testes-pr.yml` | PR destinado a `main`, push em `main` e execucao manual | Executa testes Java, Python, React e proxy; valida scripts de operacao; gera JAR e frontend |
| `deploy.yml` | Conclusao com sucesso do CI de um push em `main` deste mesmo repositorio | Baixa os builds daquele CI e atualiza a instalacao no computador configurado como runner |

O CI usa maquinas do GitHub. O deploy usa um runner Windows local com o rotulo `parking-fag`. PRs e forks nao acionam o job de deploy definido neste workflow. O commit tambem precisa continuar sendo o atual de `main`, evitando publicar um CI antigo que terminou depois.

Os workflows que ja existiam dentro de `TCC/*/.github/workflows/` permanecem como historico dos repositorios originais. Eles nao sao os workflows ativos deste repositorio unificado.

## Correcoes que permitem aprovar os testes

Os dois testes que reprovavam em 28 de outubro continuam ativos:

1. A ingestao agora rejeita POST quando a chave esta vazia, ausente ou incorreta.
2. O limitador utiliza o endereco da conexao capturado antes da interpretacao de cabecalhos de proxy. Variar `X-Forwarded-For` ou `Forwarded` nao altera mais essa identidade.

A interpretacao de HTTPS encaminhado foi mantida por um filtro com ordem explicita, e um novo teste verifica que o cookie continua recebendo `Secure`. Ha um teste adicional para o formato RFC `Forwarded`.

Resultados locais em 29 de outubro de 2026: 41 testes Java aprovados, incluindo 26 casos de seguranca; 19 testes Python aprovados, incluindo 9 de seguranca; 26 testes React aprovados, incluindo 3 de seguranca; 2 testes do servidor e 7 testes do proxy aprovados. Os 45 casos de seguranca estao aprovados. O caso de observacao do proxy continua registrando a ausencia de limite de leituras; nao representa bloqueio de bots nessa rota. Lint e build do frontend e lint Python tambem passaram.

Os workflows foram validados com actionlint 1.7.12. Os scripts PowerShell passaram na analise de sintaxe e em cinco casos de validacao do plano de deploy, sem iniciar ou encerrar servicos. O Java foi compilado e testado com ECJ/JUnit neste ambiente restrito, como na entrega anterior. Nao foi executado um job no GitHub nem um deploy real nesta preparacao. A ativacao abaixo e necessaria para demonstrar o ciclo completo.

## Publicar os arquivos e demonstrar o Pull Request

Aplique o patch da entrega no repositorio clonado, conforme `LEIA_PRIMEIRO.md`. A partir da pasta `Testes-Seguran-a-TCC-ParkingFag`, crie uma branch:

```cmd
git switch -c codex/cicd-parking-fag
```

```cmd
git add .github scripts GUIA_CICD.md TCC
```

```cmd
git commit -m "Configura testes em PR e deploy local apos CI"
```

```cmd
git push -u origin codex/cicd-parking-fag
```

No GitHub, abra um Pull Request dessa branch para `main`. Os checks devem aparecer no PR. Para a apresentacao, mostre o arquivo `testes-pr.yml`, a aba Checks e a execucao em Actions. Depois da aprovacao, o merge dispara novamente o CI de `main`; o deploy depende dessa execucao aprovada.

Para impedir merge sem CI, configure em Settings > Rules > Rulesets ou protecao de branch uma regra para `main` exigindo o check `Todos os testes aprovados`. O workflow mostra a falha no PR por si so; bloquear o botao de merge exige essa configuracao do repositorio.

## Preparar o computador de destino uma vez

O projeto roda local e o Cloudflare Tunnel encaminha o acesso externo para `http://127.0.0.1:4173`. O deploy nao contrata hospedagem nem cria um endereco permanente.

1. No repositorio GitHub, abra **Settings > Actions > Runners > New self-hosted runner**.
2. Escolha Windows e x64. Execute os comandos de download e configuracao mostrados pelo proprio GitHub, em uma pasta separada do projeto. O token de cadastro e temporario: use o fornecido nessa tela e nao o grave no Git.
3. Na configuracao do runner, acrescente o rotulo **`parking-fag`**, mantendo os rotulos padrao `self-hosted`, `Windows` e `X64`.
4. Mantenha o runner atualizado. Os actions utilizados exigem uma versao atual do runner. Execute `run.cmd` na pasta dele para deixa-lo online. Opcionalmente, configure o servico usando as instrucoes do GitHub.
5. O computador precisa ter MySQL 8 preparado e em execucao. Java 17, Node 24 e Python 3.12 sao selecionados pelos actions de setup; o ambiente Windows deve permitir a instalacao desses runtimes no cache do runner e a execucao de scripts PowerShell da aplicacao.

Use uma conta/maquina ou VM dedicada ao runner. O GitHub recomenda runners proprios em repositorios privados; em repositorio publico, nao aprove execucoes de contribuicoes desconhecidas nesse computador. Os testes de PR deste pacote estao em runners hospedados pelo GitHub, nao no runner de deploy.

### Pasta persistente e banco

Por padrao, o deploy utiliza `%LOCALAPPDATA%\ParkingFagDeploy` da conta que executa o runner. Ela fica fora do checkout, para uma limpeza do Git nao apagar a instalacao. Para escolher outra pasta, crie a variavel de Actions **`PARKING_DEPLOY_ROOT`** em Settings > Secrets and variables > Actions > Variables, por exemplo `C:\ParkingFagDeploy`. Nao coloque senhas nessa variavel.

Crie a subpasta `shared` nesse destino. Dentro dela, crie **`backend.env`** com os dados do banco local:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=parking_fag
DB_USER=CHANGE_ME
DB_PASSWORD=CHANGE_ME
```

Substitua os valores `CHANGE_ME` pelo usuario e pela senha locais. O usuario precisa das permissoes de banco requeridas pela aplicacao e pelas migrations Flyway. Use o banco operacional escolhido; os testes do CI usam outro banco, H2 em memoria. O deploy nao cria um servidor MySQL.

Esse arquivo fica somente no computador e nunca deve ser commitado. Nao e necessario colocar credenciais de banco em secrets do GitHub para este modelo local. A chave de ingestao e gerada pelo launcher e compartilhada com Java/Python, sem ser impressa. Se precisar de configuracao propria do monitor, crie `shared/monitor.env`; caso contrario, sera utilizado o video incluido no projeto.

Se o runner executar como servico, lembre que `%LOCALAPPDATA%` e as permissoes pertencem a conta desse servico. Uma pasta definida em `PARKING_DEPLOY_ROOT` torna o destino explicito.

Antes do primeiro deploy, encerre a execucao manual do aplicativo que ocupa 8080/4173. O script nao encerra processos arbitrarios nessas portas. Voce pode manter o tunel Cloudflare existente apontando para 4173.

## Como ocorre o deploy

1. O CI testa e gera `build-java` e `build-frontend`.
2. Depois de um push aprovado em `main`, `deploy.yml` agenda o job no runner `parking-fag`.
3. O job confere a revisao de `main` e baixa os dois artefatos daquela mesma execucao.
4. `scripts/deploy-local.ps1` prepara uma pasta em `releases/COMMIT-EXECUCAO-TENTATIVA`, copia o JAR e o frontend aprovados, prepara o Python e valida a configuracao das vagas.
5. Somente apos a preparacao, encerra a release anterior registrada e inicia Java, Python e frontend sem janelas de video.
6. Verifica saude Java, resposta da pagina, `monitoringActive` pela API publica e o commit servido em `deploy-info.json`. So depois grava `current.json` com a release ativa.

O launcher precisa continuar funcionando depois que o job termina. Por isso o processo persistente e iniciado sem a identificacao de limpeza do runner e sem os tokens do job. Os processos da aplicacao ficam registrados por PID e horario de inicio. Em falha apos a troca, o script tenta reiniciar a release anterior e mantem o job reprovado. Isso restaura processos e arquivos, nao desfaz migrations ou dados do banco.

Os logs ficam na propria release, em `orchestrador-parking-fag/runtime/deploy/` e `runtime/stack/`. Releases anteriores sao preservadas; nao ha remocao automatica de pastas ou do banco neste script.

## Acesso por outra rede

Se o tunel atual estiver aberto, ele pode continuar utilizando a mesma porta depois da atualizacao. Caso precise inicia-lo novamente, use o procedimento existente do projeto:

```cmd
cloudflared tunnel --url http://127.0.0.1:4173
```

Abra o HTTPS informado com `/mobile` ou `/totem`. Um Quick Tunnel pode mudar de endereco quando reiniciado. O deploy deste pacote nao inicia nem altera o tunel, e nao publica o MySQL ou a API de ingestao. Computador, MySQL, aplicacao e tunel precisam permanecer ligados para acesso externo.

## Demonstracao para a atividade

- Primeiro ponto: abra/atualize um PR e mostre os testes executando automaticamente, os relatorios e o check final.
- Segundo ponto: depois do merge, mostre o CI de `main`, a execucao `Deploy local aprovado`, o commit em `current.json` e a aplicacao atualizada no computador/celular.
- Se aparecer **Queued**, confira se o runner esta online e possui o rotulo `parking-fag`. Sem runner cadastrado, o deploy nao acontece.
- Se o CI reprovar, o deploy nao deve executar. Nao foi usado `continue-on-error` para ocultar testes reprovados.

O destino e uma instalacao local automatizada, acessivel pelo tunel existente. Se a atividade exigir explicitamente hospedagem em nuvem, confirme esse criterio com o professor: este workflow nao provisiona um servidor em nuvem.

## Referencias

- [Cadastro de runner proprio](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners)
- [Evento workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
- [Seguranca de runners](https://docs.github.com/en/actions/reference/security/secure-use#hardening-for-self-hosted-runners)
- [Guia original do projeto](TCC/orchestrador-parking-fag/docs/EXECUCAO_RESERVAS.md)

## Roteiro para a apresentacao

Veja [APRESENTACAO.md](APRESENTACAO.md) para preparar o computador hoje e demonstrar pelo notebook. A pagina publica `/versao.html`, gerada pelo deploy, mostra o commit e horario em execucao, sem credenciais.

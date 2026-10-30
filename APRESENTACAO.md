# Preparacao e demonstracao do Parking FAG

Apresentacao prevista para **30 de outubro de 2026**. Prepare e ensaie em 29 de outubro, deixando o computador de destino ligado e com acesso a internet.

## Quem faz o que

| Equipamento | Funcao | Precisa ficar ligado? |
|---|---|---|
| Computadores hospedados pelo GitHub | Executar testes e gerar builds | O GitHub gerencia |
| Computador Windows de destino | Runner, MySQL, aplicacao e tunel | Sim, durante o deploy e o acesso ao sistema |
| Notebook da apresentacao | Navegador para mostrar GitHub e aplicacao | Sim, durante a apresentacao; nao precisa instalar o projeto |

O GitHub recebe as alteracoes. O CI testa o projeto. Apos um push aprovado em `main`, o runner no computador Windows baixa os builds aprovados e atualiza a aplicacao. O notebook acessa o HTTPS do tunel para mostrar o resultado.

## Hoje — 1. Publicar e abrir o PR

O repositorio e `https://github.com/Dazorafi/Testes-Seguran-a-TCC-ParkingFag`. A atualizacao deve entrar por uma branch e um Pull Request para `main`, para registrar os testes executando no proprio PR.

Se a branch ainda estiver aberta, use-a para ensaiar os checks antes do merge. Nao e necessario preparar MySQL para os testes de PR: o Java utiliza H2 em memoria no CI. Java, Python e React sao instalados nas maquinas do GitHub pelos respectivos actions.

Abra **Pull requests > PR da atualizacao > Checks**. Aguarde o check `Todos os testes aprovados`. O workflow tambem gera os artefatos `build-java` e `build-frontend`.

## Hoje — 2. Preparar o computador Windows que ficara ligado

Instale Git e **MySQL Community Server 8**, guardando a senha criada para o banco. O Workbench e uma interface opcional; o servico MySQL precisa estar funcionando. Java 17, Node 24 e Python 3.12 sao selecionados pelo workflow no runner; o computador precisa permitir esse setup e a instalacao das dependencias.

Clone o repositorio nesse computador. Se a atualizacao ainda nao foi mesclada, clone a branch da atualizacao informada no PR:

```cmd
git clone --branch codex/cicd-apresentacao https://github.com/Dazorafi/Testes-Seguran-a-TCC-ParkingFag.git
```

Se o PR ja foi mesclado, clone normalmente, sem `--branch`. Se o nome da branch do PR for outro, use o nome mostrado no GitHub.

Abra PowerShell dentro da pasta clonada e execute:

```powershell
.\scripts\preparar-apresentacao.ps1
```

O script cria, sem sobrescrever, `%LOCALAPPDATA%\ParkingFagDeploy\shared\backend.env`, verifica se a porta do banco responde e indica o que falta. Nao instala programas, nao cadastra o runner e nao mostra a senha.

Edite esse arquivo local para corresponder ao seu MySQL:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=parking_fag
DB_USER=root
DB_PASSWORD=CHANGE_ME
```

Use o usuario que foi configurado nesse computador. A senha fica **somente nesse arquivo local**, fora do repositorio. Nao a coloque no commit, em prints ou no chat. O deploy rejeita `CHANGE_ME` e campos vazios.

Se preferir criar o arquivo manualmente, crie a pasta `ParkingFagDeploy\shared` em `%LOCALAPPDATA%` e salve `backend.env` com o conteudo acima. Isso substitui a criacao feita pelo script.

## Hoje — 3. Cadastrar e ligar o runner

No GitHub desse mesmo repositorio:

1. Abra **Settings > Actions > Runners > New self-hosted runner**.
2. Escolha Windows/x64. Siga os comandos de download e configuracao apresentados pelo GitHub, em uma pasta separada, por exemplo `C:\actions-runner`.
3. Adicione o rotulo **`parking-fag`**. Mantenha os rotulos padrao `self-hosted`, `Windows` e `X64`.
4. Para esta demonstracao, execute `run.cmd` com o mesmo usuario Windows que criou `backend.env`. Deixe esse terminal aberto.
5. Confira que o runner aparece **Online/Idle** no GitHub.

Nao copie tokens de cadastro para o Git. O GitHub mostra um token temporario na propria tela de configuracao. Use uma maquina/conta dedicada e nao aprove execucoes de contribuicoes desconhecidas no runner local de um repositorio publico; os testes de PR deste projeto usam maquinas hospedadas pelo GitHub.

Se usar outra conta ou instalar o runner como servico, configure a variavel de Actions `PARKING_DEPLOY_ROOT` com a pasta onde esta `shared/backend.env`, e garanta que a conta do runner tenha acesso a ela. Para a demonstracao, manter `run.cmd` no mesmo usuario reduz essa diferenca.

## Hoje — 4. Ensaiar o primeiro deploy

Com o runner online, o MySQL ativo e o arquivo local configurado, faca o merge do PR aprovado em `main`.

Na aba **Actions**, acompanhe:

1. `Testes e build`, do push em `main`.
2. `Deploy local aprovado`, iniciado depois do sucesso do CI.

O deploy prepara uma release, instala as dependencias Python, inicia os tres componentes em segundo plano e verifica banco/API, frontend, monitoramento e identificacao do commit. Na primeira vez, esse preparo pode demorar; faca hoje, antes da apresentacao.

Ao concluir, abra no proprio computador:

- `http://127.0.0.1:4173/totem`
- `http://127.0.0.1:4173/mobile`
- `http://127.0.0.1:4173/versao.html`

`versao.html` mostra o commit e o horario publicados. O arquivo `deploy-info.json` contem os mesmos metadados publicos, sem senha ou caminhos locais. O deploy so conclui se o commit servido corresponder ao aprovado.

O deploy nao encerra uma aplicacao manual desconhecida usando as portas. Se houver uma execucao manual antiga, encerre-a antes de tentar o primeiro deploy automatico. Nao inicie outra copia manual depois que o deploy estiver funcionando.

## Hoje — 5. Abrir o tunel e testar fora da rede

Instale `cloudflared` pela distribuicao oficial, caso ainda nao exista. Em outro Prompt no computador de destino, execute:

```cmd
cloudflared tunnel --url http://127.0.0.1:4173
```

Copie o HTTPS informado. No celular, desligue o Wi-Fi e abra esse endereco com:

- `/totem` para o painel;
- `/mobile` para reservas;
- `/versao.html` para comprovar o commit publicado.

Guarde o endereco para o notebook. Deixe o terminal do tunel aberto. Se ele reiniciar, um Quick Tunnel pode fornecer outro endereco. O deploy nao inicia nem recria o tunel; ele continua apontando para a mesma porta 4173.

Deixe computador, MySQL, runner, aplicacao e tunel ativos. Confira a politica de energia do computador para que ele nao suspenda durante a demonstracao; nao e necessario alterar configuracoes do notebook de apresentacao para executar o projeto.

## Hoje — 6. Deixar um PR de demonstracao pronto

Depois que a primeira atualizacao estiver mesclada e o sistema funcionando, prepare uma alteracao pequena de documentacao para demonstrar o ciclo sem regredir as correcoes.

Pelo proprio GitHub, edite uma frase do `README.md`, por exemplo acrescente a data do ensaio. Escolha **criar uma nova branch e abrir um Pull Request**, em vez de gravar diretamente em `main`.

Deixe esse PR aberto. Os testes executarao automaticamente. Voce pode mostrar essa execucao concluida e atualizar outra frase durante a apresentacao para disparar uma nova execucao. Essa alteracao de documentacao tambem gera um novo commit e um deploy identificavel, embora nao mude a interface do aplicativo.

## Amanha — roteiro de 8 a 12 minutos no notebook

1. **Apresente a arquitetura.** Python observa as vagas; Java controla API/reservas/banco; React apresenta as interfaces.
2. **Mostre os testes de seguranca.** Use [docs/GUIA_TESTES_PARA_FALAR.md](docs/GUIA_TESTES_PARA_FALAR.md), os arquivos de teste e os resultados. Explique que duas falhas foram encontradas e corrigidas mantendo os testes.
3. **Mostre o PR de demonstracao.** Abra Checks e o workflow `Testes e build`. Se atualizar uma frase, aguarde os checks novamente.
4. **Mostre os testes automaticos.** Abra os logs de Java, Python, React/proxy e o check final. Fale que os testes rodam nas maquinas do GitHub, sem depender do notebook ou do banco operacional.
5. **Faca o merge do PR aprovado.** Isso dispara o CI de `main`; depois o workflow de deploy.
6. **Mostre a publicacao.** Abra `Deploy local aprovado`, o runner em uso e o log `Deploy aprovado: COMMIT`.
7. **Comprove pelo endereco publico.** Abra `HTTPS_DO_TUNEL/versao.html` e compare o commit com o exibido no GitHub. Depois mostre `/totem` e `/mobile`.

Enquanto o pipeline executa, explique os testes e a arquitetura. Nao prometa um tempo fixo: a fila do GitHub e a primeira instalacao de dependencias podem variar.

## Falas curtas para o professor

> CI e a integracao continua: cada Pull Request executa testes automaticamente e mostra se a alteracao passou.

> Deploy e colocar a versao aprovada em funcionamento. Nosso workflow baixa o build do mesmo commit aprovado e atualiza um computador Windows que funciona como servidor.

> O notebook e apenas a tela da apresentacao. O sistema roda no computador que ficou ligado, e o tunel permite acesso pela internet.

> Essa pagina tecnica mostra o commit realmente servido. Assim conseguimos comparar o codigo aprovado com a versao que esta em execucao.

## Se algo falhar

| Sintoma | Confira |
|---|---|
| Deploy aparece `Queued` | Runner online e com os quatro rotulos, especialmente `parking-fag` |
| Nao apareceu deploy depois de testar manualmente | O deploy automatico depende do CI aprovado de um **push em main**, nao de um PR ou execucao manual do CI |
| Falha de banco | MySQL ativo e `shared/backend.env` correto; nunca publicar a senha para diagnosticar |
| Porta 8080/4173 ocupada | Execucao manual anterior ainda ligada; o script nao mata processos desconhecidos |
| Local funciona, publico nao | Terminal do tunel, HTTPS atual e conexao da maquina |
| Monitoramento indisponivel | Logs `runtime/stack/python-error.log`, video e dependencias OpenCV da release |
| Cookie/reserva nao funciona em outro dispositivo | O controle da reserva pertence ao cookie da sessao daquele navegador; outro aparelho nao deve alterar a reserva |
| Falha de teste | Abra o log/relatorio do job. Nao oculte a falha com `continue-on-error` |

Se o primeiro deploy falhar e voce precisar repetir **o mesmo workflow de deploy**, use **Re-run failed jobs/Re-run all jobs** nessa execucao. Isso preserva o evento de origem e cria outra tentativa. Se `main` tiver avancado, aguarde o CI do commit atual; o workflow recusa publicar um commit antigo.

Antes da aula, guarde os links dos workflows aprovados e uma gravacao curta do ensaio como contingencia. Se precisar usar a gravacao, identifique-a como ensaio, sem apresenta-la como execucao ao vivo.

## Fontes e detalhes

- [Guia completo de CI/CD](GUIA_CICD.md)
- [Cadastro oficial de runner](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners)
- [Download oficial do cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)
- [MySQL Community Downloads](https://dev.mysql.com/downloads/)

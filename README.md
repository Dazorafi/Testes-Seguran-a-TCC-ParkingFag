# Parking FAG — testes de seguranca e demonstracao CI/CD
TESTETESTETESTE

Este repositorio reune os tres componentes do Parking FAG, os testes de seguranca e os workflows para demonstrar testes em Pull Request e deploy automatico em um computador Windows.

**Comece por [APRESENTACAO.md](APRESENTACAO.md).** O guia organiza a preparacao do computador que ficara ligado e a demonstracao pelo notebook.

| Conteudo | Onde encontrar |
|---|---|
| Preparacao de hoje e roteiro para 30/10/2026 | [APRESENTACAO.md](APRESENTACAO.md) |
| Explicacao dos testes para falar ao professor | [docs/GUIA_TESTES_PARA_FALAR.md](docs/GUIA_TESTES_PARA_FALAR.md) |
| Detalhes dos dois workflows e do runner | [GUIA_CICD.md](GUIA_CICD.md) |
| Workflow de testes em PR | [.github/workflows/testes-pr.yml](.github/workflows/testes-pr.yml) |
| Workflow de deploy apos CI aprovado | [.github/workflows/deploy.yml](.github/workflows/deploy.yml) |
| Script do deploy local | [scripts/deploy-local.ps1](scripts/deploy-local.ps1) |
| Preparar configuracao local sem sobrescrever a existente | [scripts/preparar-apresentacao.ps1](scripts/preparar-apresentacao.ps1) |
| Como executar os testes manualmente | [TCC/TESTES_SEGURANCA.md](TCC/TESTES_SEGURANCA.md) |
| Evidencias historicas das duas falhas e validacao corrigida | [docs/EVIDENCIAS.md](docs/EVIDENCIAS.md) |

## Componentes

- `TCC/monitoramento-vagas`: Python/OpenCV, observacao das vagas a partir do video de teste.
- `TCC/orchestrador-parking-fag`: Java/Spring Boot, API, reservas e persistencia MySQL.
- `TCC/view-parking-fag`: React/TypeScript, interfaces e servidor publico Node.

Os testes de PR rodam em computadores do GitHub. O deploy roda somente no runner Windows cadastrado com o rotulo `parking-fag`. A aplicacao fica no computador de destino e o Cloudflare Tunnel permite acesso de outra rede. O notebook de apresentacao pode usar somente o navegador.

Os dois testes que identificaram falhas continuam ativos e agora aprovam: ingestao sem chave configurada e contorno do limitador por cabecalho de endereco. Os checks do GitHub e o primeiro deploy real devem ser conferidos apos publicar esta branch e cadastrar o runner; arquivos de workflow sozinhos nao comprovam essa execucao.

# Evidencias e resultados

## Primeira execucao — 28/10/2026

Foram executados 43 casos de seguranca, com 41 aprovados e dois reprovados. Os dois casos reproduziram ingestao sem chave configurada e contorno do limite no acesso direto ao Java por cabecalho de endereco.

- [Relatorio historico](seguranca-28/Relatorio_Seguranca.md)
- [Log Java da primeira execucao](seguranca-28/evidencias/java-security.log)
- [Resultados estruturados da primeira execucao](seguranca-28/resultados.json)

## Versao corrigida e preparacao do CI/CD — 29/10/2026

As duas falhas foram corrigidas sem desativar os testes. Acrescentamos os casos de cookie Secure com HTTPS encaminhado e de cabecalho RFC Forwarded. Os 45 casos de seguranca aprovaram localmente.

| Suite | Resultado local |
|---|---|
| Java, incluindo seguranca e regressao | 41 aprovados, incluindo 26 de seguranca |
| Python, incluindo video | 19 aprovados, incluindo 9 de seguranca |
| React | 26 aprovados, incluindo 3 de seguranca |
| Seguranca do proxy | 7 aprovados; inclui um caso que registra a ausencia de limite nas leituras |

As evidencias de preparacao em [validacao-cicd](validacao-cicd/) registram os testes, lint/build, verificacao dos workflows e validacao do plano de deploy. O Java local foi compilado com ECJ e executado com JUnit/Spring Boot/H2 por causa da restricao do javac neste ambiente Windows. O CI usa Maven normalmente em Ubuntu.

O deploy real no outro computador e a execucao do GitHub Actions dependem do cadastro do runner e do envio/merge do codigo. Depois da ativacao, a aba Actions e a pagina `/versao.html` sao as evidencias da execucao remota, alem destes logs locais. A pagina de versao nao revela credenciais nem caminhos do computador.

# Monitoramento de vagas Parking FAG

> Atualização de 15/10/2026: [correção da sombra na A-01 e seus limites](docs/PCD.md).
> A execução integrada atual está em `orchestrador-parking-fag/docs/EXECUCAO_RESERVAS.md`.
> O launcher Java compartilha uma chave temporária de ingestão e usa sync 15s/retry 30s;
> a reserva pertence ao Java e não modifica a classificação física do Python.

Monitor Python do MP4 fornecido, em loop permanente, com OpenCV. Envia somente ao backend Java; não acessa MySQL.
Configuração inicial: 21 regiões com limites identificáveis, 13 no setor A e 8 no B; 4 vagas possuem sinalização de acessibilidade.
Os códigos são identificadores desta configuração, não uma numeração oficial inferida do estacionamento.

## Execução

Pré-requisito: Python 3.12 ou 3.13. Validação local feita em Python 3.12.14.
O vídeo fornecido está incluído neste repositório em `video/estacionamento.mp4` e roda em loop.
O caminho padrão e o exemplo `.env` usam esse arquivo; configure `VIDEO_PATH` para outra fonte.

```powershell
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt
.venv/Scripts/python -m pip install -e . --no-deps
Copy-Item .env.example .env
.venv/Scripts/python -m parking_monitor.main --validate-config
.venv/Scripts/python -m parking_monitor.main
```

No Linux/macOS use `.venv/bin/python`. A execução abre o vídeo com contornos, códigos e estados das vagas por padrão; `q` ou fechar a janela encerra o monitor.
O vídeo é exibido na cadência original, enquanto a detecção segue `PROCESS_FPS`. Use `--preview` para forçar a janela ou `--headless` para executar sem janela.
`--max-seconds 75` limita uma execução de validação; sem essa opção o processamento continua até interrupção.
`Ctrl+C` encerra. O MP4 reinicia automaticamente no EOF. Falhas reais de captura tentam reabrir a fonte, preservando o estado anterior.

Inicie o Java antes do monitor. `JAVA_API_URL`, `MONITOR_SOURCE` e a chave opcional devem corresponder ao backend.
`.env` é carregado pelo monitor sem substituir variáveis já definidas no ambiente.

## Detecção e calibração

O método usa densidade de bordas na região interna de cada vaga (65% do polígono), após suavização e Canny.
Faixa baixa significa `FREE`; faixa alta, `OCCUPIED`; o intervalo intermediário produz `UNKNOWN`.
Mudanças exigem 3 amostras consecutivas. Padrão: 2 amostras por segundo, respeitando a capacidade da máquina.
São calculadas informações a partir dos pixels atuais: nenhum estado de produção é predefinido.

`config/spots.json` contém polígonos normalizados, acessibilidade, ordem física e limiares por setor/vaga.
Os limites vêm das faixas brancas visíveis; vagas distantes ou cortadas foram excluídas conforme escolha do usuário.
Limiar específico em A-01 considera a sombra/textura da árvore; vagas acessíveis exigem calibração que considere os símbolos pintados.
Esta calibração atende à câmera, resolução 1920×1080 e iluminação do vídeo fornecido. Outra câmera ou condições de luz exigem nova calibração e validação.
Um detector genérico YOLOX foi avaliado e rejeitado porque confundiu veículos da fileira inferior; o fluxo final não depende de pesos, Torch ou GPU.

Para conferir regiões e medidas em um frame real:

```powershell
.venv/Scripts/python tools/calibrate.py "video/estacionamento.mp4" --second 10 --output runtime/calibration.png
```

Revise o resultado visual ao alterar polígonos/limiares. Não presuma que qualquer densidade de borda seja um carro: sombras e objetos também podem aumentar a textura.

## Comunicação e logs

Thread separada consolida alterações por vaga e verifica envios a cada 250 ms. `SYNC_SECONDS` controla a sincronização completa para confirmar atividade sem exigir mudanças.
O `.env.example` atual configura `SYNC_SECONDS=0.1` e retry exponencial limitado a 3 segundos por `RETRY_MAX_SECONDS`.
O envio respeita a cadência da thread e a chegada de novas amostras; o valor 0.1 não garante dez observações novas por segundo.
Após indisponibilidade, envia o último estado observado e a configuração completa.
O monitor não preserva todas as transições intermediárias, conforme decisão do usuário.
Durante falha de captura, não inventa novas observações nem converte os últimos estados em `UNKNOWN`.
Logs JSON operacionais são enviados ao Java e gravados em `runtime/monitor.log`, com rotação de 2 MB e três backups.
Fila de logs limitada a 1000 eventos; excesso permanece apenas no log local durante indisponibilidade prolongada.

## Validação e CI

```powershell
.venv/Scripts/python -m ruff check .
.venv/Scripts/python -m pytest -q
.venv/Scripts/python -m compileall -q src
```

CI usa Python 3.12 e as dependências pinadas. Testes usam frames e comunicação simulados somente em ambiente de testes.
A configuração real também é validada na pipeline, sem exigir serviços externos.

[Contrato compartilhado](docs/API.md) · [Validação](docs/VALIDATION.md)

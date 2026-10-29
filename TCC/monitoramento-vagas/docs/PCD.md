# A-01: sombra da árvore — 15/10/2026

O usuário esclareceu que a vaga PCD está livre; o defeito é a classificação UNKNOWN
quando a sombra da árvore avança. O carro preto ao fundo pertence à fileira oposta.
O polígono corresponde à vaga com o símbolo PCD e não deve ser ampliado até esse carro.

O detector usa densidade de bordas, não reconhecimento semântico. Nas 121 amostras
do vídeo a 2 FPS, A-01 livre apresentou densidade entre 0.088219 e 0.154016.
De 43.5s em diante a sombra aumenta a textura, ultrapassando freeMax=0.12;
em algumas amostras ultrapassa inclusive occupiedMin=0.15, sem três confirmações.
A estabilização explica UNKNOWN persistente, mas não resolve a calibração incorreta.

Correção: freeMax=0.16 (máximo livre observado arredondado para cima ao centésimo),
occupiedMin=0.19 (preserva a faixa de incerteza original de 0.03).
Não houve mudança nas outras 20 regiões ou na estabilização. O teste compara todos
os estados dessas regiões com a configuração anterior e cobre os 60 segundos do vídeo.

Limite: não há veículo ocupando A-01 neste vídeo. O teste positivo com alta textura é
sintético; sensibilidade a um veículo real nessa vaga não está validada. Antes de trocar
a câmera/vídeo, coletar exemplos livres/ocupados com sombras e recalibrar; não assumir
que a calibração serve para outras condições. Uma câmera com sombras mais intensas
pode exigir detector de objetos ou subtração de fundo com dados rotulados adicionais.

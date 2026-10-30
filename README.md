# UFCI Simulator

Simulador de sistemas de controle e sistemas físicos para estudantes de engenharia. Roda no navegador: o cálculo acontece no seu computador, sem enviar dados a servidor.

## Estado atual

Fases 0 a 5 do plano (Documento Mestre): controle, processos industriais e empresariais, e os domínios físicos mecânico, elétrico e eletromecânico:

- **Páginas separadas**: Montagem (quadro com o máximo de espaço), Dashboard, Gráficos, Tabelas e Indicadores. A biblioteca e o painel da direita (Propriedades e Simulação) recolhem e expandem.
- Editor visual de diagrama de blocos com símbolos no estilo dos livros de controle. Atalhos: Ctrl+Z/Y, Ctrl+C/V, Ctrl+D (duplicar), Ctrl+A, Delete; anotações de texto no quadro; duplo clique abre as propriedades.
- Fontes, operadores (somador, ganho, produto, raiz, módulo, integrador, derivador filtrado), controle (função de transferência, espaço de estados, PID com anti-windup, atraso de 1ª ordem, tempo morto), não linearidades (saturação, zona morta, integrador limitado) e Scope.
- **Processos industriais**: tanque (nível), válvula, bomba, resistência, tanque aquecido (temperatura) e caldeira (nível, temperatura e vapor).
- **Empresarial**: estoque, fila de atendimento e caixa.
- **Situações prontas** (aba Situações): controle de nível, temperatura em tanque aquecido, caldeira, dois tanques, bomba com vazamento, estoque com atraso de produção, fila de atendimento, além de 1ª ordem e malha com PID.
- **Mecânico (translação e rotação)**: massa, mola, amortecedor, força, fonte de velocidade, parede; inércia, mola torcional, amortecedor rotacional, torque, fonte de velocidade angular, engrenagem e pinhão com cremalheira.
- **Elétrico**: fonte de tensão e de corrente, resistor, capacitor, indutor, terra e voltímetro.
- **Eletromecânico**: motor CC (armadura com indutância, torque e força contra-eletromotriz) e servo de posição com PID.
- Os componentes físicos se ligam por fios de cor própria (verde: translação, roxo: rotação, laranja: elétrico) e as grandezas viram sinais pelas saídas dos componentes. O montador usa a analogia força-corrente e a análise nodal modificada, com os estados de cada massa, mola, capacitor e indutor.
- Situações físicas: massa-mola-amortecedor, suspensão de um quarto de carro, eixo flexível com dois volantes, circuito RLC, filtros RC, motor CC com carga, servo de posição e motor com redutor.
- **Animação ao vivo**: os tanques sobem e descem conforme o nível, a água muda de azul para vermelho com a temperatura (tanque aquecido, caldeira e, no tanque simples, pela entrada "Temperatura da água", só visual), bolhas e vapor perto da fervura, bomba girando, válvula enchendo conforme a abertura, resistência brilhando, eixos girando e fios com a água correndo nas vazões em L/min. Os tanques crescem de leve com a altura e a área.
- Unidade de tempo selecionável (s, min, h, dias) para os rótulos; os blocos de processo usam segundos nas equações.
- Motor numérico próprio: Euler, RK4 e RK45 (Dormand-Prince adaptativo), com tratamento exato de descontinuidades e detecção de laço algébrico.
- Edição ao vivo: mudar um parâmetro com a simulação rodando continua do estado atual e marca o instante no gráfico.
- Gráficos agrupados por unidade, instrumentos, tabelas, indicadores de resposta ao degrau, exportação CSV, salvar e abrir projeto em arquivo JSON.

Limitações conhecidas: o tempo morto usa aproximação de Padé (resposta inversa inicial esperada); ainda não há controlador liga/desliga com histerese; nos domínios físicos toda massa ou capacitor precisa de caminho até a referência (parede ou terra), uma mola ou indutor em série sem massa ou capacitor entre eles não é aceito, e uma fonte de velocidade ou de tensão não pode ficar ligada direto a uma massa ou capacitor (o programa avisa). Os valores das situações são ilustrativos.

## Estrutura

```
apps/web            interface (Vite, React, @xyflow/react, uPlot)
packages/engine     motor: tipos do projeto, componentes, compilador, solvers, simulação
tools/reference-python   gera dados de referência com SciPy para os testes
```

## Comandos

```
pnpm install
pnpm dev         # servidor de desenvolvimento
pnpm test        # testes do motor
pnpm typecheck
pnpm build       # gera apps/web/dist
```

## Validação

Os testes comparam o motor com soluções analíticas (1ª e 2ª ordem), com a ordem de convergência teórica do RK4 e do Euler, e com o SciPy (DOP853, tolerâncias de 1e-12) em uma malha fechada com PID. Para regenerar a referência:

```
python3 tools/reference-python/pid_loop.py
```

## Valores de exemplo

Os valores padrão dos componentes são ilustrativos e aparecem marcados assim no painel de propriedades. Cada parâmetro pode ser marcado como estimado ou documentado.

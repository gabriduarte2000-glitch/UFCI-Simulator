# UFCI Simulator

Simulador de sistemas de controle e sistemas físicos para estudantes de engenharia. Roda no navegador: o cálculo acontece no seu computador, sem enviar dados a servidor.

## Estado atual

Fases 0 a 6 do plano (Documento Mestre): controle, processos industriais e empresariais, domínios físicos, eletrônica analógica e digital, e a visão matemática:

- **Páginas separadas**: Montagem (quadro com o máximo de espaço), Dashboard, Gráficos, Tabelas, Indicadores e Matemática. A biblioteca e o painel da direita (Propriedades e Simulação) recolhem e expandem.
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
- **Celular e tablet**: em telas estreitas a navegação vai para a barra de baixo, a biblioteca e os painéis viram folhas que sobem da parte de baixo, há botões flutuantes (adicionar componente e simulação) e uma barra de ações ao tocar num componente (propriedades, duplicar, excluir). Um dedo move a vista, dois dedos dão zoom, e as portas têm área de toque maior. Funciona deitado e pode ser instalado na tela inicial (PWA).
- **Semicondutores e amplificadores**: diodo, Zener, LED, transistor BJT (NPN e PNP, Ebers-Moll), MOSFET (canal N e P, nível 1) e amplificador operacional com saturação suave. As junções são resolvidas por Newton-Raphson dentro da análise nodal.
- **Digital e CIs**: portas (AND, OR, NOT, NAND, NOR, XOR, XNOR), flip-flops D, JK e T, latches SR e D, contador binário, registrador de deslocamento, multiplexador, decodificador, somador, comparador com histerese, ADC, DAC, clock, chave digital, LED e display de 7 segmentos. O CI 555 e a chave analógica ficam no grupo de semicondutores. As chaves e LEDs reagem ao vivo no quadro.
- **Situações de eletrônica e digital**: retificador, regulador Zener, amplificador emissor comum, LED com MOSFET, amplificador inversor, 555 astável, contador com display, somador completo, latch SR, contador com DAC e termostato liga-desliga com histerese.
- **Visão Matemática** (aba Matemática): a partir do circuito montado, mostra as leis de cada elemento, a lei dos nós por nó, a matriz de admitâncias simbólica, as equações de estado com as matrizes A, B, C e D, os autovalores e polos, a função de transferência e o resumo do comportamento (frequência natural, amortecimento, tempo de acomodação). A redução final é numérica e linearizada no ponto de operação.
- **Equação para circuito** (aba Matemática, segunda guia): digite uma EDO linear (`x'' + 2x' + 100x = 5F`), uma função de transferência (`H(s) = 3s/(s^2+2s+25)`) ou as matrizes A, B, C e D. O programa mostra a equação lida, G(s), a forma canônica em espaço de estados e os polos, e monta no quadro um bloco G(s), um bloco de espaço de estados, um diagrama com integradores, um filtro RC, um circuito RLC ou um sistema massa-mola-amortecedor, conforme a equação permita. Cada montagem é conferida: G(s) do projeto montado é calculada pela visão Matemática e comparada com a digitada.
- **Projetos na nuvem** (botão Nuvem): conta com e-mail e senha pelo Supabase, salvar, atualizar, abrir e excluir projetos de qualquer aparelho. Cada usuário vê só os próprios projetos (regras de linha no banco). A primeira vez exige rodar `supabase/schema.sql` no SQL Editor do projeto. O endereço e a chave publishable ficam em `apps/web/src/cloud.ts` e podem ser trocados por `VITE_SUPABASE_URL` e `VITE_SUPABASE_KEY`. A chave `service_role` nunca entra no código.
- **Ganho e fase** (aba Matemática, terceira guia): diagrama de Bode do circuito montado para a entrada e a saída escolhidas, ganho e fase em qualquer frequência digitada (rad/s ou Hz), pico, queda de 3 dB e margens de ganho e de fase. Parte do modelo linearizado.
- **Assistente** (botão com faíscas): chat que tira dúvidas de montagem, aponta ligações erradas ou ilógicas, diz como medir e onde ver o resultado. O botão Verificar montagem roda no navegador, sem conta. As perguntas livres passam por uma função de servidor do Supabase (`supabase/functions/assistente`) que consulta o Gemini; a chave fica só como segredo no servidor, exige login e limita 60 perguntas por dia por usuário (`supabase/assistente.sql`). O modelo muda pelo segredo `GEMINI_MODEL`.
- Unidade de tempo selecionável (s, min, h, dias) para os rótulos; os blocos de processo usam segundos nas equações.
- Motor numérico próprio: Euler, RK4 e RK45 (Dormand-Prince adaptativo), com tratamento exato de descontinuidades e detecção de laço algébrico.
- Edição ao vivo: mudar um parâmetro com a simulação rodando continua do estado atual e marca o instante no gráfico.
- Gráficos agrupados por unidade, instrumentos, tabelas, indicadores de resposta ao degrau, exportação CSV, salvar e abrir projeto em arquivo JSON.

Limitações conhecidas: a leitura de equações aceita só coeficientes numéricos (sem símbolos), um sistema linear com uma entrada e uma saída e G(s) própria; ainda não lê foto nem PDF (isso depende de um serviço de visão, planejado com o Supabase); o tempo morto usa aproximação de Padé (resposta inversa inicial esperada); os componentes digitais não têm atraso de propagação e o amplificador operacional não tem produto ganho-banda nem slew rate; o 555 recebe Vcc como parâmetro e os transistores não têm capacitâncias; nos domínios físicos toda massa ou capacitor precisa de caminho até a referência (parede ou terra), uma mola ou indutor em série sem massa ou capacitor entre eles não é aceito, e uma fonte de velocidade ou de tensão não pode ficar ligada direto a uma massa ou capacitor (o programa avisa). Os valores das situações são ilustrativos.

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

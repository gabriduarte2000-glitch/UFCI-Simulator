# UFCI Simulator

Simulador de sistemas de controle e sistemas físicos para estudantes de engenharia. Roda no navegador: o cálculo acontece no seu computador, sem enviar dados a servidor.

## Estado atual

Fases 0 a 2 do plano (Documento Mestre), mais uma biblioteca de processos industriais e empresariais:

- **Páginas separadas**: Montagem (quadro com o máximo de espaço), Dashboard, Gráficos, Tabelas e Indicadores. A biblioteca e o painel da direita (Propriedades e Simulação) recolhem e expandem.
- Editor visual de diagrama de blocos com símbolos no estilo dos livros de controle. Atalhos: Ctrl+Z/Y, Ctrl+C/V, Ctrl+D (duplicar), Ctrl+A, Delete; anotações de texto no quadro; duplo clique abre as propriedades.
- Fontes, operadores (somador, ganho, produto, raiz, módulo, integrador, derivador filtrado), controle (função de transferência, espaço de estados, PID com anti-windup, atraso de 1ª ordem, tempo morto), não linearidades (saturação, zona morta, integrador limitado) e Scope.
- **Processos industriais**: tanque (nível), válvula, bomba, resistência, tanque aquecido (temperatura) e caldeira (nível, temperatura e vapor).
- **Empresarial**: estoque, fila de atendimento e caixa.
- **Situações prontas** (aba Situações): controle de nível, temperatura em tanque aquecido, caldeira, dois tanques, bomba com vazamento, estoque com atraso de produção, fila de atendimento, além de 1ª ordem e malha com PID.
- Unidade de tempo selecionável (s, min, h, dias) para os rótulos; os blocos de processo usam segundos nas equações.
- Motor numérico próprio: Euler, RK4 e RK45 (Dormand-Prince adaptativo), com tratamento exato de descontinuidades e detecção de laço algébrico.
- Edição ao vivo: mudar um parâmetro com a simulação rodando continua do estado atual e marca o instante no gráfico.
- Gráficos agrupados por unidade, instrumentos, tabelas, indicadores de resposta ao degrau, exportação CSV, salvar e abrir projeto em arquivo JSON.

Limitações conhecidas: o tempo morto usa aproximação de Padé (resposta inversa inicial esperada); ainda não há controlador liga/desliga com histerese; os valores das situações são ilustrativos.

Mecânico, elétrico e eletromecânico entram nas fases seguintes.

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

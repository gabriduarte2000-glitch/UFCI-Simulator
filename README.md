# UFCI Simulator

Simulador de sistemas de controle e sistemas físicos para estudantes de engenharia. Roda no navegador: o cálculo acontece no seu computador, sem enviar dados a servidor.

## Estado atual

Fases 0 a 2 do plano (Documento Mestre):

- Editor visual de diagrama de blocos com símbolos no estilo dos livros de controle.
- Fontes (constante, entrada manual, degrau, rampa, senoide, onda quadrada), operadores (somador, ganho, integrador, derivador filtrado), controle (função de transferência, espaço de estados, PID com anti-windup), não linearidades (saturação, zona morta) e Scope.
- Motor numérico próprio: Euler, RK4 e RK45 (Dormand-Prince adaptativo), com tratamento exato de descontinuidades e detecção de laço algébrico.
- Edição ao vivo: mudar um parâmetro com a simulação rodando continua do estado atual e marca o instante no gráfico.
- Gráficos, instrumentos, tabelas, indicadores de resposta ao degrau (ultrapassagem, subida, acomodação), exportação CSV, salvar e abrir projeto em arquivo JSON.

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

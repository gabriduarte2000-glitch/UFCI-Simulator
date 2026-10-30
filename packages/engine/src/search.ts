// Busca da biblioteca de componentes: ignora acentos e maiúsculas, aceita várias palavras,
// entende sinônimos (inglês, siglas, usos) e tolera um erro de digitação.
// Quando a busca bate num componente que ainda não existe, ela diz isso (lista "Ainda não disponível").

import { allDefs, CATEGORIES, type ComponentDef } from "./components/registry";

/** Sinônimos dos componentes das primeiras versões. Os componentes novos trazem as próprias palavras. */
export const KEYWORDS: Record<string, string> = {
  "signal.constant": "constante dc valor fixo nivel",
  "signal.manual": "entrada manual slider cursor ajustavel interativo knob",
  "signal.step": "degrau step unitario",
  "signal.ramp": "rampa ramp",
  "signal.sine": "senoide seno senoidal sine ca ac onda",
  "signal.pulse": "pulso quadrada square clock pwm trem de pulsos",
  "math.sum": "somador subtrator soma subtracao erro comparador realimentacao feedback junção",
  "math.gain": "ganho amplificador k escala multiplicador constante",
  "math.integrator": "integrador integral 1/s acumulador",
  "math.derivative": "derivador derivada s diferenciador",
  "math.product": "produto divisao multiplicador divisor",
  "math.sqrt": "raiz quadrada sqrt",
  "math.abs": "modulo absoluto retificador",
  "control.tf": "funcao de transferencia laplace g(s) transfer function polos zeros",
  "control.ss": "espaco de estados state space matrizes abcd moderno",
  "control.pid": "pid proporcional integral derivativo controlador antiwindup",
  "control.lag": "atraso primeira ordem filtro passa baixa lowpass sensor atuador",
  "control.deadtime": "tempo morto atraso puro transporte pade delay",
  "nonlinear.saturation": "saturacao limitador clamp limite",
  "nonlinear.deadzone": "zona morta folga dead zone banda morta",
  "nonlinear.integrator_lim": "integrador limitado anti windup reservatorio",
  "sink.scope": "osciloscopio scope grafico medidor visualizar ver resultado probe",
  "process.tank": "tanque nivel reservatorio vaso",
  "process.valve": "valvula controle vazao atuador",
  "process.pump": "bomba vazao fluido",
  "process.heater": "resistencia aquecedor aquecimento potencia",
  "process.heated_tank": "tanque aquecido temperatura termico",
  "process.boiler": "caldeira vapor pressao boiler",
  "business.stock": "estoque inventario armazem",
  "business.queue": "fila atendimento espera",
  "business.cash": "caixa saldo financeiro dinheiro fluxo",
  "mech.mass": "massa inercia translacao corpo",
  "mech.spring": "mola elastica rigidez k hooke",
  "mech.damper": "amortecedor atrito viscoso c",
  "mech.force": "forca fonte de forca",
  "mech.velocity": "velocidade fonte de velocidade",
  "mech.ground": "parede referencia terra mecanico engastamento fixo",
  "mech.rack": "cremalheira pinhao rack conversao rotacao translacao",
  "rot.inertia": "inercia rotacional volante momento de inercia j",
  "rot.spring": "mola torcional torsao eixo flexivel",
  "rot.damper": "amortecedor rotacional atrito mancal",
  "rot.torque": "torque fonte de torque conjugado",
  "rot.speed": "velocidade angular fonte rpm",
  "rot.ground": "referencia rotacao fixo",
  "rot.gear": "engrenagem redutor caixa de reducao relacao de transmissao",
  "elec.resistor": "resistor resistencia ohm r",
  "elec.capacitor": "capacitor capacitancia farad c",
  "elec.inductor": "indutor bobina indutancia henry l",
  "elec.vsource": "fonte de tensao bateria vcc vdc gerador ca fonte senoidal",
  "elec.isource": "fonte de corrente",
  "elec.ground": "terra gnd referencia zero volt",
  "elec.voltmeter": "voltimetro medidor de tensao multimetro probe",
  "electromech.motor": "motor cc dc armadura servo eletromecanico",
  "elec.diode": "diodo retificador junção pn",
  "elec.led": "led diodo emissor de luz",
  "elec.zener": "zener regulador de tensao referencia",
  "elec.npn": "transistor bjt npn bipolar amplificador chave",
  "elec.pnp": "transistor bjt pnp bipolar",
  "elec.nmos": "mosfet transistor canal n chave fet",
  "elec.pmos": "mosfet transistor canal p fet",
  "elec.opamp": "amplificador operacional ampop opamp 741 lm358 inversor nao inversor",
  "elec.switch": "chave analogica switch interruptor",
  "elec.timer555": "555 ne555 temporizador timer astavel monoestavel oscilador",
  "dig.clock": "clock relogio oscilador sequenciador",
  "dig.switch": "chave digital botao entrada logica interruptor",
  "dig.led": "led digital indicador",
  "dig.display7": "display 7 segmentos sete segmentos numerico",
  "dig.dff": "flip flop d registrador memoria 1 bit",
  "dig.jkff": "flip flop jk",
  "dig.tff": "flip flop t toggle divisor de frequencia",
  "dig.srlatch": "latch sr trava set reset biestavel",
  "dig.dlatch": "latch d trava transparente",
  "dig.counter": "contador binario counter",
  "dig.shiftreg": "registrador de deslocamento shift register serial paralelo",
  "dig.mux2": "multiplexador mux seletor",
  "dig.decoder": "decodificador demux decoder",
  "dig.adder": "somador meio somador completo adder soma binaria aritmetica",
  "dig.comparator": "comparador histerese schmitt trigger magnitude",
  "dig.adc": "conversor analogico digital adc ad",
  "dig.dac": "conversor digital analogico dac da",
  "note.text": "anotacao nota texto comentario legenda",
};

/** Itens que a plataforma ainda não tem. A busca mostra "ainda não disponível" em vez de resultado vazio. */
export interface Upcoming {
  label: string;
  group: string;
  keywords: string;
  hint?: string;
}

export const UPCOMING: Upcoming[] = [
  { label: "Transformador", group: "Elétrico", keywords: "transformador trafo indutancia mutua primario secundario" },
  { label: "Fonte CA trifásica", group: "Elétrico", keywords: "trifasica trifasico fonte ca 3 fases" },
  { label: "Fusível e disjuntor", group: "Elétrico", keywords: "fusivel disjuntor protecao" },
  { label: "Potenciômetro", group: "Elétrico", keywords: "potenciometro resistor variavel trimpot" },
  { label: "Bateria com resistência interna", group: "Elétrico", keywords: "bateria pilha celula resistencia interna soc" },
  { label: "Regulador linear (7805, LM317)", group: "Eletrônica", keywords: "regulador linear 7805 lm317 7812 fonte" },
  { label: "Tiristor e TRIAC", group: "Eletrônica", keywords: "tiristor scr triac dimmer" },
  { label: "IGBT", group: "Eletrônica", keywords: "igbt chave de potencia" },
  { label: "Ponte H", group: "Eletrônica", keywords: "ponte h h-bridge driver de motor" },
  { label: "Conversor buck, boost e buck-boost", group: "Eletrônica de potência", keywords: "buck boost conversor chaveado dc dc smps fonte chaveada pwm" },
  { label: "Inversor monofásico e trifásico", group: "Eletrônica de potência", keywords: "inversor frequencia vfd spwm trifasico" },
  { label: "Retificador controlado", group: "Eletrônica de potência", keywords: "retificador controlado ponte tiristores" },
  { label: "Motor de indução", group: "Máquinas elétricas", keywords: "motor inducao assincrono trifasico gaiola" },
  { label: "Motor síncrono e gerador", group: "Máquinas elétricas", keywords: "motor sincrono gerador alternador" },
  { label: "Motor de passo", group: "Máquinas elétricas", keywords: "motor de passo stepper" },
  { label: "Motor BLDC", group: "Máquinas elétricas", keywords: "bldc sem escovas brushless pmsm" },
  { label: "Atrito seco (Coulomb) e folga", group: "Mecânico", keywords: "atrito coulomb seco estatico folga backlash stick slip" },
  { label: "Alavanca, polia e correia", group: "Mecânico", keywords: "alavanca polia correia roldana came" },
  { label: "Pêndulo e pêndulo invertido", group: "Mecânico", keywords: "pendulo invertido carro pendulo" },
  { label: "Contato e impacto", group: "Mecânico", keywords: "contato impacto colisao batida quicar" },
  { label: "Cilindro e bomba hidráulica", group: "Hidráulico", keywords: "hidraulico pistao cilindro atuador bomba hidraulica acumulador" },
  { label: "Tubulação com perda de carga", group: "Hidráulico", keywords: "tubulacao tubo perda de carga duto" },
  { label: "Reservatório e compressor de ar", group: "Pneumático", keywords: "pneumatico compressor ar comprimido reservatorio de ar" },
  { label: "Condução, convecção e radiação", group: "Térmico", keywords: "termico conducao conveccao radiacao calor massa termica" },
  { label: "Trocador de calor", group: "Térmico", keywords: "trocador de calor heat exchanger" },
  { label: "Reator CSTR", group: "Processos", keywords: "reator cstr reacao quimica" },
  { label: "Coluna de destilação", group: "Processos", keywords: "destilacao coluna" },
  { label: "Controle em cascata e razão (ratio)", group: "Processos", keywords: "cascata ratio razao override seletor" },
  { label: "Preditor de Smith", group: "Controle", keywords: "smith preditor tempo morto compensador" },
  { label: "Observador de estados e LQR", group: "Controle", keywords: "observador luenberger lqr realimentacao de estados alocacao de polos" },
  { label: "Filtro de Kalman", group: "Controle", keywords: "kalman estimador filtro estimacao" },
  { label: "Controle preditivo (MPC)", group: "Controle", keywords: "mpc preditivo model predictive" },
  { label: "Controle fuzzy", group: "Controle", keywords: "fuzzy nebuloso logica difusa" },
  { label: "Lugar das raízes", group: "Análise", keywords: "lugar das raizes root locus" },
  { label: "Diagrama de Nyquist e Nichols", group: "Análise", keywords: "nyquist nichols estabilidade" },
  { label: "Varredura de parâmetros e Monte Carlo", group: "Análise", keywords: "varredura parametrica monte carlo sweep sensibilidade" },
  { label: "Sintonia automática de PID", group: "Análise", keywords: "sintonia autotune ziegler nichols otimizacao" },
  { label: "Espectro (FFT)", group: "Análise", keywords: "fft espectro fourier thd distorcao harmonica" },
  { label: "Subsistema (agrupar blocos)", group: "Plataforma", keywords: "subsistema subsystem hierarquia agrupar biblioteca propria" },
  { label: "Máquina de estados", group: "Lógica", keywords: "maquina de estados stateflow fsm" },
  { label: "Vetores e matrizes (mux, demux)", group: "Sinais", keywords: "vetor matriz mux demux barramento bus" },
];

export const norm = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    let rowMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
      rowMin = Math.min(rowMin, prev[j]);
    }
    if (rowMin > max) return max + 1;
  }
  return prev[b.length];
}

const words = (s: string): string[] => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

interface Indexed {
  def: ComponentDef;
  label: string;
  type: string;
  kw: string[];
  desc: string;
  cat: string;
}

let index: Indexed[] | null = null;
let indexSize = -1;

function getIndex(): Indexed[] {
  const defs = allDefs();
  if (index && indexSize === defs.length) return index;
  indexSize = defs.length;
  index = defs.map((def) => ({
    def,
    label: norm(def.label),
    type: norm(def.type),
    kw: words(`${def.keywords ?? ""} ${KEYWORDS[def.type] ?? ""} ${def.labelPrefix}`),
    desc: norm(def.description),
    cat: norm(CATEGORIES.find((c) => c.id === def.category)?.label ?? ""),
  }));
  return index;
}

/** Nota de um componente para uma palavra da busca. 0 = não bate. */
function tokenScore(it: Indexed, tok: string, fuzzy: boolean): number {
  const lw = it.label.split(/[^a-z0-9]+/).filter(Boolean);
  if (it.label === tok) return 100;
  if (lw.some((w) => w === tok)) return 60;
  if (lw.some((w) => w.startsWith(tok))) return 50;
  if (it.kw.some((w) => w === tok)) return 45;
  if (it.kw.some((w) => w.startsWith(tok))) return 35;
  if (it.label.includes(tok)) return 30;
  if (it.type.includes(tok)) return 25;
  if (it.cat.includes(tok)) return 15;
  if (tok.length >= 3 && it.desc.includes(tok)) return 8;
  if (fuzzy && tok.length >= 4) {
    const max = tok.length >= 7 ? 2 : 1;
    if (lw.some((w) => editDistance(w, tok, max) <= max) || it.kw.some((w) => editDistance(w, tok, max) <= max)) return 20;
  }
  return 0;
}

export interface SearchResult {
  hits: ComponentDef[];
  /** Itens relacionados à busca que ainda não existem. */
  upcoming: Upcoming[];
  /** Verdadeiro quando só achou com tolerância a erro de digitação. */
  approximate: boolean;
}

/** Procura componentes. Todas as palavras precisam bater. Resultado ordenado por relevância. */
export function searchComponents(query: string): SearchResult {
  const toks = words(query);
  if (!toks.length) return { hits: [], upcoming: [], approximate: false };
  const idx = getIndex();
  const run = (fuzzy: boolean) => {
    const out: { def: ComponentDef; score: number }[] = [];
    for (const it of idx) {
      let total = 0;
      let ok = true;
      for (const t of toks) {
        const s = tokenScore(it, t, fuzzy);
        if (s === 0) {
          ok = false;
          break;
        }
        total += s;
      }
      if (ok) out.push({ def: it.def, score: total });
    }
    return out.sort((a, b) => b.score - a.score || a.def.label.localeCompare(b.def.label, "pt-BR"));
  };
  let hits = run(false);
  let approximate = false;
  if (!hits.length) {
    hits = run(true);
    approximate = hits.length > 0;
  }
  const upcoming = UPCOMING.filter((u) => {
    const hay = words(`${u.label} ${u.keywords}`);
    return toks.every((t) => hay.some((w) => w.startsWith(t) || (t.length >= 4 && editDistance(w, t, 1) <= 1)));
  });
  return { hits: hits.map((h) => h.def), upcoming, approximate };
}

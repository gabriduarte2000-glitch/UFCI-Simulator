import { describe, expect, it } from "vitest";
import { Simulation, detectLanguage, languageWarning, ladderDiagram, ladderEquations, parseLadder, parseLogic, parseEquation, projectFor, recognize } from "../src/index";

const sims = (code: string, lang: any) => recognize(code, lang);
describe("detecção de linguagem", () => {
  it("reconhece as principais", () => {
    expect(detectLanguage("import numpy as np\ndef f(x):\n    return x\n").lang).toBe("python");
    expect(detectLanguage("void setup() {\n pinMode(13, OUTPUT);\n}\nvoid loop() { digitalWrite(13, HIGH); }").lang).toBe("arduino");
    expect(detectLanguage("#include <stdio.h>\nint main() { printf(\"oi\"); return 0; }").lang).toBe("c");
    expect(detectLanguage("LD A\nAND B\nST Y\n").lang).toBe("ladder");
    expect(detectLanguage("x <- c(1,2)\nlibrary(pracma)").lang).toBe("r");
    expect(detectLanguage("% comentario\nA = [0 1; -2 -3];\ndisp(A)\n").lang).toBe("matlab");
  });
  it("avisa quando C aparece com Python escolhido", () => {
    const w = languageWarning("python", "#include <stdio.h>\nint main() {\n printf(\"a\");\n}\n");
    expect(w?.suggest).toBe("c");
    expect(languageWarning("c", "#include <iostream>\nint main(){ std::cout << 1; }")).toBeNull();
    expect(languageWarning("python", "import control\nG = control.tf([1],[1,2])\n")).toBeNull();
  });
});

describe("reconhecimento", () => {
  it("tf em Python e MATLAB", () => {
    for (const [code, lang] of [["import control\nG = control.tf([10], [1, 3, 2])\nKp = 2\nKi = 1\n", "python"], ["G = tf([10], [1 3 2]);\n", "matlab"]] as const) {
      const c = sims(code, lang);
      expect(c.map((x) => x.id)).toContain("tf-step");
      const a: any = c.find((x) => x.id === "tf-synth")!.action;
      expect(parseEquation(a.text).ok).toBe(true);
      const p = projectFor(c.find((x) => x.id === "tf-loop")!.action)!;
      const sim = new Simulation(p);
      expect(sim.diagnostics.filter((d: any) => d.severity === "error")).toEqual([]);
      sim.runToEnd();
    }
  });
  it("espaço de estados", () => {
    const c = sims("A = np.array([[0,1],[-2,-3]])\nB = np.array([[0],[1]])\nC = np.array([[1,0]])\nD = 0\n", "python");
    const a: any = c.find((x) => x.id === "ss")!.action;
    expect(a.A).toBe("0 1; -2 -3");
    const m = sims("A = [0 1; -2 -3];\nB = [0; 1];\nC = [1 0];\n", "matlab").find((x) => x.id === "ss")!.action as any;
    expect(m.B).toBe("0; 1");
  });
  it("lógica", () => {
    const c = sims("y = (a and not b) or c\n", "python");
    expect(c[0].action.kind).toBe("logic");
    expect(parseLogic((c[0].action as any).eq).ok).toBe(true);
    const k = sims("int y = (a && !b) || c;\n", "c");
    expect(parseLogic((k.find((x) => x.action.kind === "logic")!.action as any).eq).ok).toBe(true);
  });
  it("ladder", () => {
    const r = parseLadder("LD A\nANDN B\nOR C\nST Y\n");
    expect(r.ok).toBe(true);
    expect(ladderEquations(r.lines)[0]).toBe("Y = A * !B + C");
    expect(ladderDiagram(r.lines)).toContain("( Y )");
    const p = parseLadder("LD A\nAND( B\nOR C\n)\nST Y\n");
    expect(ladderEquations(p.lines)[0]).toBe("Y = A * (B + C)");
    const c = sims("LD A\nAND B\nST Y\n", "ladder");
    expect(parseLogic((c[0].action as any).eq).ok).toBe(true);
  });
  it("arduino", () => {
    const blink = "void setup(){pinMode(13,OUTPUT);}\nvoid loop(){\n digitalWrite(13, HIGH);\n delay(500);\n digitalWrite(13, LOW);\n delay(500);\n}";
    const c = sims(blink, "arduino");
    expect(c[0].id).toBe("ard-blink");
    expect((c[0].action as any).params.T).toBe(1);
    for (const code of [blink, "void loop(){ int v = analogRead(A0); analogWrite(9, v/4); }", "void loop(){ if (analogRead(A0) > 512) digitalWrite(12, HIGH); else digitalWrite(12, LOW); }"]) {
      const cc = sims(code, "arduino")[0];
      const sim = new Simulation(projectFor(cc.action)!);
      expect(sim.diagnostics.filter((d: any) => d.severity === "error")).toEqual([]);
      sim.runToEnd();
    }
  });
  it("liga-desliga", () => {
    const c = sims("if temp > 55:\n    heater = 0\nelif temp < 45:\n    heater = 1\n", "python").find((x) => x.id === "onoff")!;
    expect((c.action as any).th).toBe(50);
    const sim = new Simulation(projectFor(c.action)!);
    sim.runToEnd();
  });
});

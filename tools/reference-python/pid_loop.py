"""Referência SciPy para o exemplo de malha fechada com PID.
Equações escritas de forma independente do motor TypeScript.
Gera packages/engine/tests/data/pid_loop.json.
"""
import json
import numpy as np
from scipy.integrate import solve_ivp

Kp, Ki, Kd, N = 8.0, 6.0, 1.5, 50.0
t_step, tf = 1.0, 10.0

def f(t, s):
    y, yd, I, xd = s
    e = 1.0 - y
    v = Kp * e + I + Kd * N * (e - xd)
    return [yd, -3 * yd - 2 * y + v, Ki * e, N * (e - xd)]

ts = np.linspace(t_step, tf, 91)
sol = solve_ivp(f, (t_step, tf), [0, 0, 0, 0], method="DOP853", rtol=1e-12, atol=1e-14, t_eval=ts)
out = {"t": (sol.t).tolist(), "y": sol.y[0].tolist(),
       "params": dict(Kp=Kp, Ki=Ki, Kd=Kd, N=N, t_step=t_step)}
with open("packages/engine/tests/data/pid_loop.json", "w") as fh:
    json.dump(out, fh)
print("ok", len(ts), sol.y[0][-1])

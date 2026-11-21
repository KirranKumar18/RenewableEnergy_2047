"""
LSTM and Transformer forecasters for state capacity, scored with the same fresh-only backtest as the v2 model.

Each sample is one (state, technology) seen from an origin year T:
    input sequence   the last L = 8 years up to T, one step per year:
                     log1p(MW) (carried forward), was it a fresh report, yearly change in log1p(MW),
                     GSDP log-growth, log GSDP, national log-growth of that technology, catch-up gap
                     (log zone intensity / state intensity); plus zone and technology one-hots on every step
    future input     GSDP log-growth from T to T+h for h = 1..8 (the backtest gives every model this path)
    target           log1p(MW[T+h]) - log1p(MW[T]) for h = 1..8, only where T+h is a fresh report (masked loss)

Models (PyTorch, CPU):
    LSTM         1 layer, 32 hidden units -> last state + future GSDP -> 2-layer head -> 8 horizons
    Transformer  2 encoder layers, model width 32, 4 heads, learned positions -> last token + future GSDP -> head
Training: Adam, weight decay, early stopping on a 15% validation split, 5 seeds averaged.

    .venv/bin/python model/experiments/sequence_models.py
"""
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch import nn

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from re_model import TECH, fresh_mask, load_data  # noqa: E402
from convergence_model import ConvergenceModel  # noqa: E402
from train import CUTOFFS, RECENT_CUTOFFS, score  # noqa: E402

warnings.filterwarnings("ignore")
torch.set_num_threads(4)
L, H = 8, 8


def build(df, fr, origins, with_target, max_target_year=None):
    years = np.arange(df.Year.min(), df.Year.max() + 1)
    states = sorted(df.State.unique())
    zone = df.groupby("State").Zone.first().reindex(states)
    zones = sorted(zone.unique())
    G = df.pivot(index="Year", columns="State", values="GSDP").reindex(index=years, columns=states).interpolate(limit_direction="both")
    lg = np.log(G)
    seqs, futs, ys, masks, meta = [], [], [], [], []
    for ti, t in enumerate(TECH):
        raw = df.pivot(index="Year", columns="State", values=t).reindex(index=years, columns=states)
        X = raw.ffill().fillna(0.0)
        Fm = fr.assign(Year=df.Year, State=df.State).pivot(index="Year", columns="State", values=t) \
            .reindex(index=years, columns=states).fillna(False).astype(float)
        lx = np.log1p(X)
        dlx = lx.diff().fillna(0.0)
        nat = np.log1p(X.sum(1)).diff().fillna(0.0)
        zint = {z: (X[zone.index[zone == z]].sum(1) / G[zone.index[zone == z]].sum(1)) for z in zones}
        for T in origins:
            if T - L + 1 < years[0]:
                continue
            win = list(range(T - L + 1, T + 1))
            for s in states:
                gap = np.clip(np.log((zint[zone[s]].loc[win].values * 1e5 + 1) / (X.loc[win, s].values / G.loc[win, s].values * 1e5 + 1)), -4, 4)
                stat = [float(zone[s] == z) for z in zones] + [float(i == ti) for i in range(len(TECH))]
                step = np.c_[lx.loc[win, s].values, Fm.loc[win, s].values, dlx.loc[win, s].values,
                             lg.loc[win, s].diff().fillna(0.0).values, lg.loc[win, s].values - 12, nat.loc[win].values, gap,
                             np.tile(stat, (L, 1))]
                fut = np.zeros(H); y = np.zeros(H); mk = np.zeros(H)
                for h in range(1, H + 1):
                    D = T + h
                    if D > years[-1]:
                        continue
                    fut[h - 1] = (lg.loc[D, s] - lg.loc[T, s]) / h
                    if with_target and (max_target_year is None or D <= max_target_year) and Fm.loc[D, s] > 0 and np.isfinite(raw.loc[D, s]):
                        y[h - 1] = np.log1p(raw.loc[D, s]) - lx.loc[T, s]
                        mk[h - 1] = 1.0
                if with_target and mk.sum() == 0:
                    continue
                seqs.append(step); futs.append(fut); ys.append(y); masks.append(mk)
                meta.append((t, s, T, float(X.loc[T, s])))
    return (np.array(seqs, np.float32), np.array(futs, np.float32), np.array(ys, np.float32),
            np.array(masks, np.float32), meta)


class LSTMNet(nn.Module):
    def __init__(self, d_in, hid=32):
        super().__init__()
        self.rnn = nn.LSTM(d_in, hid, batch_first=True)
        self.head = nn.Sequential(nn.Linear(hid + H, 32), nn.ReLU(), nn.Linear(32, H))

    def forward(self, x, f):
        o, _ = self.rnn(x)
        return self.head(torch.cat([o[:, -1], f], 1))


class TransformerNet(nn.Module):
    def __init__(self, d_in, d=32, heads=4, layers=2):
        super().__init__()
        self.inp = nn.Linear(d_in, d)
        self.pos = nn.Parameter(torch.zeros(1, L, d))
        enc = nn.TransformerEncoderLayer(d, heads, dim_feedforward=64, dropout=0.1, batch_first=True)
        self.enc = nn.TransformerEncoder(enc, layers)
        self.head = nn.Sequential(nn.Linear(d + H, 32), nn.ReLU(), nn.Linear(32, H))

    def forward(self, x, f):
        z = self.enc(self.inp(x) + self.pos)
        return self.head(torch.cat([z[:, -1], f], 1))


def train_predict(kind, Xtr, Ftr, Ytr, Mtr, Xte, Fte, seed):
    torch.manual_seed(seed); rng = np.random.default_rng(seed)
    mu, sd = Xtr.reshape(-1, Xtr.shape[-1]).mean(0), Xtr.reshape(-1, Xtr.shape[-1]).std(0) + 1e-6
    fmu, fsd = Ftr.mean(), Ftr.std() + 1e-6
    nx = lambda a: torch.tensor((a - mu) / sd)  # noqa: E731
    nf = lambda a: torch.tensor((a - fmu) / fsd)  # noqa: E731
    idx = rng.permutation(len(Xtr)); nv = max(1, int(0.15 * len(idx)))
    va, tr = idx[:nv], idx[nv:]
    net = (LSTMNet if kind == "lstm" else TransformerNet)(Xtr.shape[-1])
    opt = torch.optim.Adam(net.parameters(), lr=3e-3, weight_decay=1e-3)
    X, F, Y, M = nx(Xtr), nf(Ftr), torch.tensor(Ytr), torch.tensor(Mtr)
    loss_fn = lambda p, y, m: ((p - y) ** 2 * m).sum() / m.sum().clamp(min=1)  # noqa: E731
    best, best_state, wait = np.inf, None, 0
    for ep in range(400):
        net.train()
        for b in np.array_split(rng.permutation(tr), max(1, len(tr) // 64)):
            opt.zero_grad(); loss = loss_fn(net(X[b], F[b]), Y[b], M[b]); loss.backward(); opt.step()
        net.eval()
        with torch.no_grad():
            v = loss_fn(net(X[va], F[va]), Y[va], M[va]).item()
        if v < best - 1e-5:
            best, best_state, wait = v, {k: t.clone() for k, t in net.state_dict().items()}, 0
        else:
            wait += 1
            if wait > 30:
                break
    net.load_state_dict(best_state); net.eval()
    with torch.no_grad():
        return net(nx(Xte), nf(Fte)).numpy()


def forecast(kind, df, fr, cut, te, seeds=5):
    tr = df[df.Year <= cut]
    Xtr, Ftr, Ytr, Mtr, _ = build(tr, fr.loc[tr.index], range(tr.Year.min() + L - 1, cut), True, max_target_year=cut)
    full = df[df.State.isin(tr.State.unique())]
    Xte, Fte, _, _, meta = build(full, fr.loc[full.index], [cut], False)
    P = np.mean([train_predict(kind, Xtr, Ftr, Ytr, Mtr, Xte, Fte, s) for s in range(seeds)], 0)
    rows = {}
    for (t, s, T, cap0), p in zip(meta, P):
        for h in range(1, H + 1):
            rows[(s, T + h, t)] = max(cap0, float(np.expm1(np.log1p(cap0) + p[h - 1])))
    out = pd.DataFrame(0.0, index=te.index, columns=TECH)
    for i, r in te.iterrows():
        for t in TECH:
            out.at[i, t] = rows.get((r.State, int(r.Year), t), 0.0)
    return out


if __name__ == "__main__":
    pd.set_option("display.width", 220)
    df = load_data(); fr = fresh_mask(df)
    res = {}
    for label, cuts in [("standard", CUTOFFS), ("recent", RECENT_CUTOFFS)]:
        for cut in cuts:
            tr, te = df[df.Year <= cut], df[df.Year > cut]
            te = te[te.State.isin(tr.State)]
            f = fr.loc[te.index]
            prod = ConvergenceModel().fit(tr).predict_frame(te)
            lstm = forecast("lstm", df, fr, cut, te)
            trf = forecast("transformer", df, fr, cut, te)
            for name, p in [("production (v2)", prod), ("LSTM", lstm), ("Transformer", trf),
                            ("blend: 75% v2 + 25% LSTM", 0.75 * prod + 0.25 * lstm),
                            ("blend: 75% v2 + 25% Transformer", 0.75 * prod + 0.25 * trf)]:
                res[(label, cut, name)] = score(p, te, f)
            print(f"{label} {cut}: " + ", ".join(f"{k} {v['Total WAPE (fresh)']:.1f}" for (l2, c2, k), v in res.items() if c2 == cut and l2 == label), flush=True)
    R = pd.DataFrame(res).T
    R.index.names = ["set", "cutoff", "model"]
    print("\n" + R["Total WAPE (fresh)"].unstack("model").round(1).to_string())
    print("\nMean over cutoffs:")
    print(R.groupby(level=["set", "model"])[["Solar Power", "Wind Power", "Total WAPE (fresh)"]].mean().round(1).to_string())
    print("\nBoth sets combined (total WAPE %):")
    print(R.groupby(level="model")["Total WAPE (fresh)"].mean().sort_values().round(2).to_string())

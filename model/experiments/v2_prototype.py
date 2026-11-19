"""Prototype: stale-aware evaluation + convergence model (v2) vs elasticity model (v1)."""
import sys, warnings
from pathlib import Path
warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np, pandas as pd
from re_model import TECH, ElasticityModel, load_data

EPS = 1.0  # MW per lakh-crore GSDP floor for intensity logs


def fresh_mask(df):
    """True where a state's value for a tech is a genuine new report: first observation, or changed vs prior year."""
    df = df.sort_values(["State", "Year"])
    m = pd.DataFrame(index=df.index)
    for t in TECH:
        prev = df.groupby("State")[t].shift(1)
        m[t] = prev.isna() | (df[t] != prev)
    return m


def score_fresh(pred, act, fresh):
    out = {}
    tot_e = tot_a = 0
    for t in TECH:
        f = fresh[t]
        e = np.abs(pred.loc[f, t] - act.loc[f, t]).sum(); a = act.loc[f, t].sum()
        out[t] = e / max(a, 1e-9) * 100; tot_e += e; tot_a += a
    out["Total WAPE (fresh)"] = tot_e / tot_a * 100
    out["n fresh"] = int(fresh.values.sum())
    return out


# ---------------- v1 with stale-aware anchors ----------------
def v1_stale_aware(tr, te):
    m = ElasticityModel().fit(tr)
    fr = fresh_mask(tr)
    out = []
    for r in te.itertuples():
        row = {}
        g = tr[tr.State == r.State]
        for t in TECH:
            if g.empty: row[t] = 0; continue
            gf = g[fr.loc[g.index, t]]
            a = gf.iloc[-1] if len(gf) else g.iloc[-1]
            row[t] = a[t] * m.multiplier(t, int(a.Year), int(r.Year), a.GSDP, r.GSDP)
        out.append(row)
    return pd.DataFrame(out, index=te.index)[TECH]


# ---------------- v2 convergence model ----------------
class ConvergenceModel:
    def __init__(s, min_mw=10, decay_years=3, max_gap=4.0, trend="damped", half_life=5.0):
        s.min_mw, s.decay_years, s.max_gap, s.trend, s.hl = min_mw, decay_years, max_gap, trend, half_life

    def _pairs(s, df, fr, t):
        rows = []
        zone_int = {}
        for y, g in df.groupby("Year"):
            z = g.groupby("Zone")[[t, "GSDP"]].sum(); zone_int[y] = (z[t] / z.GSDP * 1e5).to_dict()
        for st, g in df.groupby("State"):
            g = g[fr.loc[g.index, t]].sort_values("Year")
            for a, b in zip(g.iloc[:-1].itertuples(), g.iloc[1:].itertuples()):
                c0 = getattr(a, t.replace(" ", "_").replace("-", "_"), None)
            # use dict access (column names have spaces)
            recs = g.to_dict("records")
            for a, b in zip(recs[:-1], recs[1:]):
                if a[t] < s.min_mw: continue
                k = b["Year"] - a["Year"]
                i_s = a[t] / a["GSDP"] * 1e5; i_z = zone_int[a["Year"]].get(a["Zone"], 0)
                rows.append({"y0": a["Year"], "y1": b["Year"], "k": k,
                             "r": (np.log1p(b[t]) - np.log1p(a[t])) / k,
                             "dg": (np.log(b["GSDP"]) - np.log(a["GSDP"])) / k,
                             "gap": np.clip(np.log((i_z + EPS) / (i_s + EPS)), -s.max_gap, s.max_gap)})
        return pd.DataFrame(rows), zone_int

    def fit(s, df):
        fr = fresh_mask(df)
        s.last_year = int(df.Year.max()); s.params = {}
        for t in TECH:
            P, zone_int = s._pairs(df, fr, t)
            years = list(range(int(df.Year.min()) + 1, s.last_year + 1))
            if len(P) < 15:
                s.params[t] = {"alpha": {}, "beta": 0.0, "kappa": 0.0, "a_ref": 0.0, "lam": 0.0, "gz": (0.0, 0.0)}; continue
            # fractional year dummies over the interval (y0, y1]
            D = np.zeros((len(P), len(years)))
            for i, (y0, y1, k) in enumerate(P[["y0", "y1", "k"]].values):
                for y in range(int(y0) + 1, int(y1) + 1):
                    D[i, years.index(y)] = 1 / k
            X = np.c_[D, P.dg.values, P.gap.values]
            w = np.sqrt(P.k.values)  # longer intervals = more reliable rates
            # ridge to stabilise year effects
            lam_r = 0.05
            A = (X * w[:, None]); bvec = P.r.values * w
            R = np.eye(X.shape[1]) * lam_r; R[-2:, -2:] = 0
            coef = np.linalg.solve(A.T @ A + R, A.T @ bvec)
            alpha = dict(zip(years, coef[:len(years)])); beta = max(coef[-2], 0.0); kappa = max(coef[-1], 0.0)
            have = [y for y in years if D[:, years.index(y)].sum() > 0.5]
            al = pd.Series({y: alpha[y] for y in have})
            recent = al.loc[al.index > s.last_year - s.decay_years]
            a_ref = float(recent.mean())
            # decay of the national trend: log-linear fit over the last ~8 years where positive
            seg = al.loc[al.index > s.last_year - 9]; seg = seg[seg > 0.005]
            lam = float(np.clip(-np.polyfit(seg.index, np.log(seg.values), 1)[0], 0, 0.3)) if len(seg) >= 4 else 0.0
            if s.trend == "damped":
                lam = np.log(2) / s.hl
            N = df.groupby("Year")[t].sum()
            gz = (0.0, 0.0)
            xs = [np.log1p(N.loc[y - 1]) for y in al.index if y - 1 in N.index]
            ys_ = [al[y] for y in al.index if y - 1 in N.index]
            if len(xs) >= 4:
                ww = 0.5 ** ((max(al.index) - np.array([y for y in al.index if y - 1 in N.index])) / 6)
                b1, b0 = np.polyfit(xs, ys_, 1, w=np.sqrt(ww))
                gz = (float(b0), float(min(b1, 0.0)))
            s.params[t] = {"alpha": {int(k): float(v) for k, v in al.items()}, "beta": float(beta),
                           "kappa": float(kappa), "a_ref": a_ref, "lam": lam, "gz": gz}
        # anchors + zone intensity at last year (using latest fresh values)
        s.anchor = {}
        for st, g in df.groupby("State"):
            s.anchor[st] = {}
            for t in TECH:
                gf = g[fr.loc[g.index, t]]
                a = gf.iloc[-1] if len(gf) else g.iloc[-1]
                s.anchor[st][t] = (int(a.Year), float(a[t]), float(a.GSDP))
            s.anchor[st]["zone"] = g.Zone.iloc[0]
        return s

    def zone_intensity_path(s, df, years, gsdp_cagr=0.06):
        """Baseline simulation of all states to get each zone's intensity over time."""
        pass

    def predict_frame(s, df, te):
        # simulate all states jointly year by year so zone intensity evolves with forecasts
        states = list(s.anchor)
        out = {}
        gsdp_te = te.set_index(["State", "Year"]).GSDP
        last_g = df.sort_values("Year").groupby("State").GSDP.last()
        last_gy = df.sort_values("Year").groupby("State").Year.last()
        # GSDP path per state: interpolate in logs between last obs and test values (fallback 6%/yr)
        def gsdp(st, y):
            if (st, y) in gsdp_te.index: return gsdp_te[(st, y)]
            if y <= last_gy[st]:
                v = df[(df.State == st) & (df.Year == y)].GSDP
                if len(v): return float(v.iloc[0])
            return last_g[st] * 1.06 ** (y - last_gy[st])
        y_end = int(te.Year.max())
        for t in TECH:
            p = s.params[t]
            start = min(a[t][0] for a in s.anchor.values())
            cap = {st: s.anchor[st][t][1] for st in states}
            ay = {st: s.anchor[st][t][0] for st in states}
            for y in range(start + 1, y_end + 1):
                # zone intensity from current state values (anchored or simulated)
                zc, zg = {}, {}
                for st in states:
                    z = s.anchor[st]["zone"]; zc[z] = zc.get(z, 0) + cap[st]; zg[z] = zg.get(z, 0) + gsdp(st, y - 1)
                for st in states:
                    if y <= ay[st]: continue
                    i_s = cap[st] / gsdp(st, y - 1) * 1e5; z = s.anchor[st]["zone"]; i_z = zc[z] / zg[z] * 1e5
                    gap = np.clip(np.log((i_z + EPS) / (i_s + EPS)), -s.max_gap, s.max_gap)
                    if y <= s.last_year and y in p["alpha"]:
                        a = p["alpha"][y]
                    elif s.trend == "gompertz":
                        a = max(p["gz"][0] + p["gz"][1] * np.log1p(sum(cap.values())), 0.0)
                    else:
                        a = p["a_ref"] * np.exp(-p["lam"] * max(y - s.last_year, 0))
                    r = a + p["beta"] * (np.log(gsdp(st, y)) - np.log(gsdp(st, y - 1))) + p["kappa"] * gap
                    cap[st] = max(np.expm1(np.log1p(cap[st]) + r), cap[st])
                    if (st, y) in gsdp_te.index: out[(st, y, t)] = cap[st]
        res = pd.DataFrame(index=te.index, columns=TECH, dtype=float)
        for i, r in te.iterrows():
            for t in TECH: res.loc[i, t] = out.get((r.State, r.Year, t), 0.0)
        return res


def naive_fresh(tr, te):
    return tr.sort_values("Year").groupby("State")[TECH].last().reindex(te.State).set_index(te.index).fillna(0)


if __name__ == "__main__":
    df = load_data()
    fr_all = fresh_mask(df)
    res = {}
    for cut in [2016, 2018, 2020]:
        tr, te = df[df.Year <= cut], df[df.Year > cut]
        te = te[te.State.isin(tr.State)]
        fr = fr_all.loc[te.index]
        models = {"Naive last value": naive_fresh,
                  "v1 elasticity": lambda a, b: ElasticityModel().fit(a).predict_frame(b),
                  "v1 + stale-aware anchors": v1_stale_aware,
                  **{f"v2 damped hl={h}": (lambda h: lambda a, b: ConvergenceModel(half_life=h).fit(a).predict_frame(a, b))(h) for h in (3, 5, 8)},
                  "v2 gompertz": lambda a, b: ConvergenceModel(trend="gompertz").fit(a).predict_frame(a, b)}
        for name, fn in models.items():
            res[(cut, name)] = score_fresh(fn(tr, te), te, fr)
        m2 = ConvergenceModel(trend="gompertz").fit(tr)
        print(cut, {t[:5]: (round(m2.params[t]["a_ref"],3), [round(x,3) for x in m2.params[t]["gz"]]) for t in TECH})
    R = pd.DataFrame(res).T.round(1); pd.set_option("display.width", 220)
    print(R.to_string()); print(R.groupby(level=1).mean().round(1).sort_values("Total WAPE (fresh)").to_string())

"""Backtest candidate forecasting approaches on held-out years.
Train on years <= CUTOFF, forecast CUTOFF+1..2024 using the true future Population/GSDP
(as the user would supply them), and score against actuals."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
from pathlib import Path
from sklearn.ensemble import RandomForestRegressor, VotingRegressor, HistGradientBoostingRegressor
from sklearn.multioutput import MultiOutputRegressor
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from xgboost import XGBRegressor
from lightgbm import LGBMRegressor

ROOT = Path(__file__).resolve().parents[1]
TECH = ["Solar Power","Wind Power","Bio-Mass Power","Small Hydro Power","Waste to Energy"]

def load():
    df = pd.read_csv(ROOT/"data/raw/renewable_energy_dataset.csv")
    df.columns = [c.replace("Installed - ","") for c in df.columns]
    df = df.rename(columns={"GSDP (crore INR)":"GSDP"}).sort_values(["State","Year"]).reset_index(drop=True)
    # splice GSDP series break at 2011 (base-year change): rescale pre-2011 values so 2010->2011
    # growth equals the state's median growth over 2012-2015
    for st, g in df.groupby("State"):
        if 2010 in g.Year.values and 2011 in g.Year.values:
            v = g.set_index("Year").GSDP
            gr = v.pct_change().loc[2012:2015].median()
            k = v[2011] / (v[2010]*(1+gr))
            df.loc[(df.State==st)&(df.Year<=2010),"GSDP"] *= k
    return df

def score(pred, act):
    out = {}
    for t in TECH:
        a, p = act[t].values, pred[t].values
        out[t] = np.abs(p-a).sum()/max(a.sum(),1e-9)*100          # state-level WAPE %
    nat_a = act.groupby("Year")[TECH].sum(); nat_p = pred.assign(Year=act.Year.values).groupby("Year")[TECH].sum()
    out["Total WAPE"] = np.abs(pred[TECH].values-act[TECH].values).sum()/act[TECH].values.sum()*100
    out["National total err % (last yr)"] = (nat_p.iloc[-1].sum()/nat_a.iloc[-1].sum()-1)*100
    return out

# ---------- candidates ----------
def m_original(tr, te):
    feats = ["Zone","State","Year","Population","GSDP"]
    X = lambda d: d[feats].assign(PC=d.GSDP*1e7/(d.Population+1), Y6=d.Year-2006)
    pre = ColumnTransformer([("c",OneHotEncoder(handle_unknown="ignore"),["Zone","State"])],remainder="passthrough")
    vr = VotingRegressor([("x",XGBRegressor(n_estimators=600,learning_rate=0.04,max_depth=6,subsample=.85,colsample_bytree=.85,verbosity=0)),
                          ("l",LGBMRegressor(n_estimators=600,learning_rate=0.04,max_depth=6,verbose=-1)),
                          ("r",RandomForestRegressor(n_estimators=400,max_depth=14,random_state=0))],weights=[3,2,2])
    p = Pipeline([("p",pre),("m",MultiOutputRegressor(vr))]).fit(X(tr), tr[TECH])
    return pd.DataFrame(np.clip(p.predict(X(te)),0,None), columns=TECH, index=te.index)

def m_naive(tr, te):
    last = tr.sort_values("Year").groupby("State")[TECH].last()
    return last.reindex(te.State).set_index(te.index)

def m_damped_cagr(tr, te, k=3, phi=0.85):
    out = []
    for st, g in te.groupby("State"):
        h = tr[tr.State==st].set_index("Year")[TECH]
        if h.empty: out.append(pd.DataFrame(0,index=g.index,columns=TECH)); continue
        last_y = h.index.max(); lv = h.iloc[-1]
        base = h.iloc[-1-k] if len(h)>k else h.iloc[0]
        r = np.log1p(lv)-np.log1p(base); r = (r/k).clip(-0.05, 1.0)
        rows=[]
        for y in g.Year:
            n = y-last_y; mult = sum(phi**i for i in range(1,n+1))
            rows.append(np.expm1(np.log1p(lv)+r*mult))
        out.append(pd.DataFrame(rows,index=g.index,columns=TECH))
    return pd.concat(out).loc[te.index]

def growth_frame(d):
    """long frame: one row per state-tech-year with annual log-growth target"""
    rows=[]
    for t in TECH:
        x = d[["State","Zone","Year","Population","GSDP",t]].rename(columns={t:"cap"}).copy()
        x["tech"]=t
        rows.append(x)
    L = pd.concat(rows).sort_values(["State","tech","Year"]).reset_index(drop=True)
    grp = L.groupby(["State","tech"])
    L["lcap_prev"] = np.log1p(grp.cap.shift(1))
    L["lcap_prev2"] = np.log1p(grp.cap.shift(2))
    L["g_prev"] = L.lcap_prev - L.lcap_prev2
    L["gsdp_g"] = np.log(L.GSDP) - np.log(grp.GSDP.shift(1))
    L["pop_g"]  = np.log(L.Population) - np.log(grp.Population.shift(1))
    L["lpc"] = np.log(L.GSDP*1e7/L.Population)
    L["lgsdp"] = np.log(L.GSDP)
    nat = L.groupby(["tech","Year"]).cap.sum().groupby(level=0).shift(1)
    L = L.join(np.log1p(nat).rename("lnat_prev"), on=["tech","Year"])
    L["share_prev"] = np.expm1(L.lcap_prev)/np.expm1(L.lnat_prev).replace(0,np.nan)
    L["y"] = np.log1p(L.cap) - L.lcap_prev
    return L

GF = ["lcap_prev","g_prev","gsdp_g","pop_g","lpc","lgsdp","lnat_prev","share_prev"]
def make_growth_model():
    pre = ColumnTransformer([("c",OneHotEncoder(handle_unknown="ignore"),["tech","Zone"])],remainder="passthrough")
    return Pipeline([("p",pre),("m",HistGradientBoostingRegressor(max_iter=400,learning_rate=0.04,max_depth=4,
                     min_samples_leaf=15,l2_regularization=1.0,random_state=0))])

def m_growth(tr, te):
    L = growth_frame(tr).dropna(subset=["y","g_prev"])
    mdl = make_growth_model().fit(L[["tech","Zone"]+GF], L.y.clip(-0.5,2.5))
    return roll_forward(mdl, tr, te)

def roll_forward(mdl, hist, future):
    """recursive forecast: start from last actual, apply predicted annual log-growth"""
    h = hist.copy()
    for y in sorted(future.Year.unique()):
        fut = future[future.Year==y].copy(); fut[TECH]=np.nan
        cur = pd.concat([h, fut]).sort_values(["State","Year"])
        L = growth_frame(cur); L = L[L.Year==y]
        L = L[L.lcap_prev.notna()]
        g = mdl.predict(L[["tech","Zone"]+GF])
        L["pred"] = np.expm1(L.lcap_prev + g).clip(lower=np.expm1(L.lcap_prev))  # installed capacity doesn't shrink
        P = L.pivot_table(index="State",columns="tech",values="pred")
        fut = fut.set_index("State"); fut.update(P); fut = fut.reset_index()
        fut[TECH] = fut[TECH].fillna(0)
        h = pd.concat([h, fut[h.columns]])
    out = h[h.Year.isin(future.Year.unique())].set_index(["State","Year"])[TECH]
    return out.reindex(pd.MultiIndex.from_frame(future[["State","Year"]])).set_index(future.index)

if __name__=="__main__":
    df = load()
    res = {}
    for cut in [2018, 2020]:
        tr, te = df[df.Year<=cut], df[df.Year>cut]
        te = te[te.State.isin(tr.State)]
        for name, fn in [("Original ensemble",m_original),("Naive last value",m_naive),
                         ("Damped CAGR",m_damped_cagr),("ML growth (recursive)",m_growth)]:
            res[(cut,name)] = score(fn(tr,te), te)
    R = pd.DataFrame(res).T.round(1)
    R.index.names=["train<=","model"]
    print(R.to_string())

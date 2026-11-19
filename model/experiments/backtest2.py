import warnings; warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
import backtest as B
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
TECH=B.TECH

def growth_frame2(d):
    L = B.growth_frame(d)
    grp = L.groupby(["State","tech"])
    L["g3"] = (L.lcap_prev - np.log1p(grp.cap.shift(4)))/3
    nat = L.groupby(["tech","Year"]).cap.sum()
    ng = np.log1p(nat).groupby(level=0).diff().groupby(level=0).shift(1)
    ng3 = (np.log1p(nat).groupby(level=0).shift(1)-np.log1p(nat).groupby(level=0).shift(4))/3
    L = L.join(ng.rename("gnat_prev"), on=["tech","Year"]).join(ng3.rename("gnat3"), on=["tech","Year"])
    return L
GF2 = B.GF+["g3","gnat_prev","gnat3"]

class GrowthModel:
    def __init__(s, half_life=6, n_seeds=3): s.hl=half_life; s.n=n_seeds
    def fit(s, hist):
        L = growth_frame2(hist).dropna(subset=["y","g3","gnat3"])
        w = 0.5**((L.Year.max()-L.Year)/s.hl)
        y = L.y.clip(-0.2, 1.5)
        s.ms=[]
        for seed in range(s.n):
            pre = ColumnTransformer([("c",OneHotEncoder(handle_unknown="ignore"),["tech","Zone"])],remainder="passthrough")
            m = Pipeline([("p",pre),("m",HistGradientBoostingRegressor(max_iter=300,learning_rate=0.03,max_depth=3,
                    min_samples_leaf=25,l2_regularization=2.0,random_state=seed))])
            s.ms.append(m.fit(L[["tech","Zone"]+GF2], y, m__sample_weight=w.values))
        return s
    def predict_growth(s, L): return np.mean([m.predict(L[["tech","Zone"]+GF2]) for m in s.ms],axis=0)

def roll(predict_g, hist, future):
    h = hist.copy()
    for y in sorted(future.Year.unique()):
        fut = future[future.Year==y].copy(); fut[TECH]=np.nan
        cur = pd.concat([h, fut]).sort_values(["State","Year"])
        L = growth_frame2(cur); L = L[(L.Year==y)&L.lcap_prev.notna()].copy()
        L["pred"] = np.expm1(L.lcap_prev + np.maximum(predict_g(L),0))
        P = L.pivot_table(index="State",columns="tech",values="pred")
        fut = fut.set_index("State"); fut.update(P); fut=fut.reset_index(); fut[TECH]=fut[TECH].fillna(0)
        h = pd.concat([h, fut[h.columns]])
    out = h[h.Year.isin(future.Year.unique())].set_index(["State","Year"])[TECH]
    return out.reindex(pd.MultiIndex.from_frame(future[["State","Year"]])).set_index(future.index)

def shrunk_trend_g(L, phi_by_step, k_mw=50):
    """state 3y growth shrunk toward national tech growth by size; damped by horizon"""
    lv = np.expm1(L.lcap_prev); w = lv/(lv+k_mw)
    g = (w*L.g3.fillna(0) + (1-w)*L.gnat3.fillna(0)).clip(0, 1.0)
    return g*phi_by_step

def m_ml(tr, te):
    gm = GrowthModel().fit(tr); return roll(gm.predict_growth, tr, te)

def m_trend(tr, te, phi=0.85):
    last = tr.Year.max()
    return roll(lambda L: shrunk_trend_g(L, phi**(L.Year-last)), tr, te)

def m_blend(tr, te, phi=0.85, a=0.5):
    gm = GrowthModel().fit(tr); last = tr.Year.max()
    return roll(lambda L: a*gm.predict_growth(L)+(1-a)*shrunk_trend_g(L, phi**(L.Year-last)), tr, te)

if __name__=="__main__":
    df=B.load(); res={}
    for cut in [2016, 2018, 2020]:
        tr, te = df[df.Year<=cut], df[df.Year>cut]; te=te[te.State.isin(tr.State)]
        for name, fn in [("Original ensemble",B.m_original),("Naive last value",B.m_naive),
                         ("Shrunk damped trend",m_trend),("ML growth v2",m_ml),("Blend ML+trend",m_blend)]:
            res[(cut,name)] = B.score(fn(tr,te),te)
    R=pd.DataFrame(res).T.round(1); R.index.names=["train<=","model"]; print(R.to_string())
    print("\nMean over cutoffs:"); print(R.groupby(level=1).mean().round(1).sort_values("Total WAPE").to_string())

import warnings; warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
import backtest as B, backtest2 as B2
from sklearn.linear_model import HuberRegressor
TECH=B.TECH

def m_elastic(tr, te, window=6, k_mw=50):
    """Anchored elasticity: cap_t = cap_last * (GSDP_t/GSDP_last)^b_tech, b fit on recent within-state changes,
    shrinking tiny-capacity states toward zero growth."""
    L = B.growth_frame(tr); L = L[(L.Year>tr.Year.max()-window)].dropna(subset=["y","gsdp_g"])
    L = L[np.expm1(L.lcap_prev)>=k_mw]  # fit only on established capacity
    b = {}
    for t in TECH:
        x = L[L.tech==t]
        if len(x)<10: b[t]=0.0; continue
        # elasticity through origin, robust
        h = HuberRegressor(fit_intercept=False).fit(x[["gsdp_g"]], x.y.clip(-0.2,1.5)); b[t]=max(h.coef_[0],0)
    last = tr.sort_values("Year").groupby("State").last()
    out=[]
    for i,r in te.iterrows():
        if r.State not in last.index: out.append([0]*5); continue
        l = last.loc[r.State]; ratio = r.GSDP/l.GSDP
        out.append([l[t]*ratio**b[t] for t in TECH])
    m_elastic.b=b
    return pd.DataFrame(out,index=te.index,columns=TECH)

if __name__=="__main__":
    df=B.load(); res={}
    for cut in [2016,2018,2020]:
        tr,te=df[df.Year<=cut],df[df.Year>cut]; te=te[te.State.isin(tr.State)]
        for name,fn in [("Naive last value",B.m_naive),("Original ensemble",B.m_original),("GSDP elasticity",m_elastic)]:
            res[(cut,name)]=B.score(fn(tr,te),te)
            if name=="GSDP elasticity": print(cut,{k:round(v,2) for k,v in m_elastic.b.items()})
    R=pd.DataFrame(res).T.round(1); print(R.to_string()); print(R.groupby(level=1).mean().round(1).to_string())

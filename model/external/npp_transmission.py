"""
State-year transmission build-out from CEA's yearly transmission reports on the National Power Portal
(npp.gov.in -> Reports -> Transmission Reports), FY2018-19 .. FY2025-26.

    trans2-YYYY-03.xls  transmission lines completed during the FY (cKM)
    trans7-YYYY-03.xls  sub-stations completed during the FY (MVA)

The reports have no state column. State is inferred from the executing agency (state transmission
utilities) or, for central/private projects, from place names in the line / sub-station name.
A project is flagged renewable-related (RE) when its name or developer points to solar/wind evacuation
(pooling stations, solar parks, REZ, green energy corridor, RE developers).

    .venv/bin/python model/external/npp_transmission.py data/external/npp_transmission_raw
    -> data/external/npp_transmission_state_year.csv
"""
from __future__ import annotations

import glob
import re
import sys
from pathlib import Path

import pandas as pd
import xlrd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "external" / "npp_transmission_state_year.csv"

AGENCY = {
    "UPPTCL": "Uttar Pradesh", "GETCO": "Gujarat", "MSETCL": "Maharashtra", "TANTRANSCO": "Tamil Nadu",
    "TSTRANSCO": "Telangana", "HVPNL": "Haryana", "MPPTCL": "Madhya Pradesh", "KPTCL": "Karnataka",
    "APTRANSCO": "Andhra Pradesh", "PSTCL": "Punjab", "RVPNL": "Rajasthan", "OPTCL": "Odisha", "BSPTCL": "Bihar",
    "WBSETCL": "West Bengal", "CSPTCL": "Chhattisgarh", "KSEB": "Kerala", "HPPTCL": "Himachal Pradesh",
    "JUSNL": "Jharkhand", "JKPDD": "Jammu And Kashmir", "DTL": "Delhi", "PTCUL": "Uttarakhand", "SIKKIM": "Sikkim",
    "AEGCL": "Assam", "ED, Manipur": "Manipur", "ED-GOA": "Goa", "KSPDCL": "Karnataka", "APSPCL": "Andhra Pradesh",
    "RUMSL": "Madhya Pradesh", "Rajasthan Solar Park Development": "Rajasthan", "MEGHA": "Meghalaya",
}
PLACES = {
    "Rajasthan": "bhadla bikaner fatehgarh jaisalmer barmer ramgarh sikar jodhpur ajmer beawar khetri chittorgarh "
                 "kota jhunjhunu phagi neemrana bhinmal pokaran tonk bhiwadi jaipur merta nagaur rajasthan",
    "Gujarat": "bhuj lakadia banaskantha ahmedabad ahemdabad navsari khambhaliya kutch khavda radhanesda vadodara "
               "dholera pirana halvad rajkot dwarka mundra kansari vapi pachchham jamnagar gujarat",
    "Maharashtra": "pune wardha aurangabad solapur kolhapur padghe boisar kharghar parli akola warora kalwa dhule "
                   "nagpur nashik maharashtra",
    "Madhya Pradesh": "rewa neemuch mandsaur indore itarsi satna jabalpur gwalior bhopal khandwa rajgarh shujalpur "
                      "pachore sagar damoh madhya",
    "Karnataka": "pavagada tumkur koppal gadag bidar raichur yelahanka narendra hiriyur davanagere bellary karnataka",
    "Andhra Pradesh": "kurnool ananthapuram anantapur kadapa nellore vemagiri chilakaluripeta hindupur gooty kunta "
                      "ghani urvakonda andhra",
    "Tamil Nadu": "tuticorin thoothukudi pugalur tirunelveli arasur salem madurai karur udumalpet kayathar tamil",
    "Telangana": "maheshwaram warangal nizamabad hyderabad telangana",
    "Uttar Pradesh": "lucknow kanpur agra aligarh bareilly gorakhpur allahabad prayagraj varanasi mainpuri meerut "
                     "fatehpur unnao jhansi lalitpur",
    "Punjab": "ludhiana jalandhar amritsar patiala moga punjab",
    "Haryana": "bhiwani kurukshetra panipat hisar sonipat jind fatehabad haryana",
    "Delhi": "narela maharanibagh tughlakabad bamnauli delhi",
    "Bihar": "patna gaya muzaffarpur purnea darbhanga sitamarhi bihar",
    "Jharkhand": "ranchi jamshedpur daltonganj jharkhand",
    "Odisha": "jeypore angul jharsuguda rourkela bolangir keonjhar odisha",
    "West Bengal": "durgapur kolkata farakka bengal",
    "Chhattisgarh": "raipur bilaspur korba kobra chhattisgarh",
    "Assam": "bongaigaon silchar guwahati misa assam",
    "Himachal Pradesh": "kala amb himachal",
    "Jammu And Kashmir": "srinagar jammu samba kishenpur",
    "Uttarakhand": "roorkee kashipur pithoragarh uttarakhand",
}
PLACE_RE = [(st, re.compile(r"\b(" + "|".join(w.split()) + r")", re.I)) for st, w in PLACES.items()]
RE_NAME = re.compile(r"solar|wind|\bre\b|\brez\b|pooling|\bps\b|\bps-|green energy|\bgec\b|hybrid|renewable|park", re.I)
RE_AGENCY = re.compile(r"adani ?green|renew|azure|acme|avaada|ayana|solar|mahindra|serentica|sprng|abcsolar|"
                       r"greeninfra|grinfra|alfanar|apraava|avikiran|ahejl|arehfl|arehl|areprl|awekl|giwel|mytrah|"
                       r"orange|jsw ?(renew|future)|tatarenew|apspcl|rumsl", re.I)


def parse(folder: str) -> pd.DataFrame:
    rows = []
    for p in sorted(glob.glob(str(Path(folder) / "trans[27]-*.xls"))):
        kind = "line" if "trans2" in p else "sub"
        fy = int(re.search(r"-(\d{4})-03", p).group(1))  # FY ending March of this year
        for sh in xlrd.open_workbook(p).sheets():
            R = [[str(v).strip() for v in sh.row_values(r)] for r in range(sh.nrows)]
            hi = next((i for i, r in enumerate(R) if any("Executing" in c for c in r)), None)
            if hi is None:
                continue
            col = lambda key: next((j for j, c in enumerate(R[hi]) if key.lower() in c.lower()), None)  # noqa: E731
            cn, ca, ci, cq = col("Name"), col("Executing"), col("ISTS"), col("Length" if kind == "line" else "Capacity")
            if cn is None or cq is None:
                continue
            context = ""
            for r in R[hi + 1:]:
                if not re.fullmatch(r"\d+(\.0)?", r[0] or ""):
                    if r[cn] and not r[0]:  # sub-title rows like "evacuation of power from ... solar park"
                        context = r[cn]
                    continue
                try:
                    q = float(r[cq])
                except (ValueError, TypeError):
                    continue
                rows.append(dict(fy=fy, kind=kind, name=r[cn], context=context, agency=r[ca] if ca is not None else "",
                                 ists=r[ci] if ci is not None else "", qty=q))
                context = ""
    return pd.DataFrame(rows)


def assign_state(r) -> str | None:
    if r.agency in AGENCY:
        return AGENCY[r.agency]
    text = f"{r['name']} {r.context}"
    hits = [st for st, rx in PLACE_RE if rx.search(text)]
    return hits[0] if hits else None


def build(folder: str) -> tuple[pd.DataFrame, dict]:
    df = parse(folder)
    df["state"] = df.apply(assign_state, axis=1)
    df["re"] = df.apply(lambda r: bool(RE_NAME.search(f"{r['name']} {r.context}") or RE_AGENCY.search(r.agency)), axis=1)
    cov = {"rows": len(df), "state_assigned_pct": round(df.state.notna().mean() * 100, 1),
           "re_rows": int(df.re.sum()), "re_state_assigned_pct": round(df[df.re].state.notna().mean() * 100, 1)}
    d = df[df.state.notna()]
    agg = (d.assign(line_ckm=d.qty.where(d.kind == "line", 0), sub_mva=d.qty.where(d.kind == "sub", 0),
                    re_line_ckm=d.qty.where((d.kind == "line") & d.re, 0), re_sub_mva=d.qty.where((d.kind == "sub") & d.re, 0))
           .groupby(["state", "fy"])[["line_ckm", "sub_mva", "re_line_ckm", "re_sub_mva"]].sum().reset_index()
           .rename(columns={"state": "State", "fy": "Year"}))
    return agg, cov


if __name__ == "__main__":
    agg, cov = build(sys.argv[1])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    agg.to_csv(OUT, index=False)
    print(cov)
    print(agg.groupby("Year")[["line_ckm", "sub_mva", "re_line_ckm", "re_sub_mva"]].sum().round(0).to_string())
    top = agg.groupby("State")[["re_line_ckm", "re_sub_mva"]].sum().sort_values("re_sub_mva", ascending=False)
    print(top.head(10).round(0).to_string())
    print("saved", OUT.relative_to(ROOT))

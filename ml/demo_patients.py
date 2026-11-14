"""اختيار مريض التدهور الرئيسي للعرض من مجموعة B، بالنموذج المحفوظ للتنبؤ فقط (لا تدريب، لا تغيير في المقاييس).

التشغيل:  ml/.venv/Scripts/python ml/demo_patients.py          ← يبحث ويطبع المرشحين فقط
          ml/.venv/Scripts/python ml/demo_patients.py --write  ← ويحدّث مريض 3 في web/src/data/patients.json

القاعدة (حتمية، أصغر معرّف يحقق كل الشروط):
  مريض إنتان في B، أول تنبيه «عالٍ» قبل البداية بـ 4 ساعات أو أكثر (داخل نافذة 12 ساعة)،
  حرارته (القياسات الفعلية) لم تصل 38 حتى ذلك التنبيه ولا قبل البداية،
  أهم سبب عند التنبيه هو التنفس (رسالتنا: التنفس لا الحرارة)، ولا حرارة بين أهم 3 أسباب،
  ولم يُنبَّه «عالٍ» قبل ذلك أبداً، وعدد ساعات «متوسط» قبل أول تنبيه عالٍ قليل (≤ 6).
"""
import json
import sys

import joblib
import numpy as np
import pandas as pd
import shap
from sklearn.model_selection import GroupShuffleSplit

from reasons import top_reasons
from train import CLEAN, OUT, PATCH, SEED, WEB, WINDOW, build_features, r, to_score

MIN_LEAD, MAX_MEDIUM_BEFORE, FEVER = 4, 6, 38.0
sys.stdout.reconfigure(encoding="utf-8")


def main(write: bool) -> None:
    art = joblib.load(OUT / "model.joblib")
    model, cols, thr = art["model"], art["features"], art["thresholds"]
    t_med, t_high = float(thr["medium"]), float(thr["high"])
    df = pd.read_parquet(CLEAN)
    X = build_features(df)
    A, B = (df["set"] == "A").values, (df["set"] == "B").values
    _, va = next(GroupShuffleSplit(1, test_size=0.2, random_state=SEED).split(df[A], groups=df.patient_id[A]))
    top = float(np.quantile(model.predict_proba(X.iloc[np.flatnonzero(A)[va]][cols])[:, 1], 0.999))
    p = pd.Series(model.predict_proba(X[cols])[:, 1], index=df.index)
    expl = shap.TreeExplainer(model)

    rows = []
    Bdf = df[B]
    for pid, d in Bdf.groupby("patient_id"):
        t_s = d.t_sepsis.iloc[0]
        if np.isnan(t_s) or not 36 <= len(d) <= 120 or d.measured_Temp.mean() < 0.15:
            continue
        s = p[d.index]
        high = d.index[(s >= t_high).values]
        if len(high) == 0:
            continue
        h0 = d.loc[high[0]]
        lead = t_s - h0.hour
        if not MIN_LEAD <= lead <= WINDOW:
            continue
        before = d[d.hour <= h0.hour]
        n_med_before = int(((s[before.index] >= t_med) & (s[before.index] < t_high)).sum())
        tmax = float(d.Temp[d.measured_Temp].max()) if d.measured_Temp.any() else np.nan
        tmax_before = float(before.Temp[before.measured_Temp].max()) if before.measured_Temp.any() else np.nan
        sv = expl.shap_values(X.loc[[high[0]], cols])[0]
        reasons = top_reasons(cols, X.loc[high[0], cols].values, sv)
        rows.append({"pid": pid, "n": len(d), "onset": int(t_s), "first_high_hour": int(h0.hour), "lead": int(lead),
                     "tmax_before_alert": tmax_before, "tmax_all": tmax, "med_before": n_med_before,
                     "reasons": [x["feature"] for x in reasons], "idx": high[0]})
    c = pd.DataFrame(rows)
    ok = c[(c.tmax_all < FEVER) & (c.tmax_before_alert < FEVER) & (c.med_before <= MAX_MEDIUM_BEFORE)
           & c.reasons.map(lambda f: len(f) > 0 and f[0].split("_")[0] == "Resp"
                           and not any(x.startswith("Temp") for x in f))]
    print(f"مرشحون يحققون الشروط: {len(ok)} من {len(c)} مريض إنتان (تنبيه عالٍ قبل ≥{MIN_LEAD}س)")
    print(ok.drop(columns="idx").head(15).to_string())
    if ok.empty:
        return
    pick = ok.sort_values("pid").iloc[0]
    print("\nالمختار (أصغر معرّف):", pick.pid)
    if not write:
        return

    pid = pick.pid
    mask = (df.patient_id == pid).values
    xp, dp = X[mask], df[mask]
    pr = p[dp.index].values
    sv = expl.shap_values(xp[cols])
    hrs = []
    for j in range(len(dp)):
        row = dp.iloc[j]
        hrs.append({"h": int(row.hour), "vitals": {v: r(row[v]) for v in PATCH + ["SBP", "MAP", "DBP"]},
                    "fresh": [v for v in PATCH if row[f"measured_{v}"]],
                    "baseline": {v: r(xp[f"{v}_base"].iloc[j]) for v in PATCH},
                    "score": r(to_score(pr[j], t_med, t_high, top)),
                    "level": "high" if pr[j] >= t_high else "medium" if pr[j] >= t_med else "low",
                    "reasons": top_reasons(cols, xp[cols].iloc[j].values, sv[j])})
    new = {"id": 3, "role": "deteriorating", "age": r(dp.Age.iloc[0], 0), "gender": "M" if dp.Gender.iloc[0] == 1 else "F",
           "sepsis_onset_hour": int(dp.t_sepsis.iloc[0]), "hours": hrs}
    f = WEB / "patients.json"
    pats = json.loads(f.read_text(encoding="utf-8"))
    pats = [new if q["id"] == 3 else q for q in pats]
    f.write_text(json.dumps(pats, ensure_ascii=False, default=float, allow_nan=False), encoding="utf-8")
    print(f"حُدّث مريض 3 في patients.json (معرّف PhysioNet {pid} للتقرير فقط). لا مقاييس تغيّرت.")


if __name__ == "__main__":
    main("--write" in sys.argv)

"""قائمة مقدّم الرعاية: 16 مريضاً إضافياً من الاختبار الخارجي B، بالنموذج المحفوظ (تنبؤ فقط، لا تدريب) وبنفس كود تصدير الساعات.

التشغيل:  ml/.venv/Scripts/python ml/cohort.py   ← يكتب web/src/data/cohort.json (الـ 16)، ولا يلمس patients.json (الأربعة القدامى)

القاعدة (ثابتة وغير منتقاة حسب نتيجة النموذج):
  من مرضى B الذين لديهم 48 ساعة قراءات على الأقل (بعد التنظيف)، باستثناء مرضى العرض الأربعة،
  نسحب 5 مرضى إنتان و11 غير مصابين بـ numpy.random.default_rng(42) من القائمتين مرتّبتين بالمعرّف.
الساعات المصدَّرة: حتى آخر ساعة يصلها شريط العرض (آخر ساعة لأطول مريض من مرضى العرض الثلاثة)، لأن ما بعدها لا يُعرض أبداً.
  الميزات من الماضي فقط، فالقص لا يغيّر أي ساعة معروضة. ومرضى الإنتان مقصوصون عند البداية أصلاً (prepare.py).
الأسماء افتراضية؛ العمر والجنس من البيانات. معرّفات PhysioNet تُطبع هنا للتقرير فقط ولا تُصدَّر.
"""
import hashlib
import json
import sys

import joblib
import numpy as np
import pandas as pd
import shap
from sklearn.model_selection import GroupShuffleSplit

from reasons import top_reasons
from train import CLEAN, OUT, PATCH, SEED, WEB, WINDOW, build_features, r, to_score

N_SEPSIS, N_OTHER, MIN_HOURS = 5, 11, 48
NAMES = {  # أسماء سعودية افتراضية، تُوزَّع بالترتيب حسب الجنس
    "M": [("سلمان", "Salman"), ("تركي", "Turki"), ("ماجد", "Majed"), ("بندر", "Bandar"), ("سعود", "Saud"), ("ناصر", "Nasser"),
          ("يوسف", "Yousef"), ("حمد", "Hamad"), ("راشد", "Rashed"), ("منصور", "Mansour"), ("طلال", "Talal"), ("مشعل", "Mishal"),
          ("سالم", "Salem"), ("وليد", "Waleed"), ("زياد", "Ziyad"), ("عبدالرحمن", "Abdulrahman")],
    "F": [("ريم", "Reem"), ("لطيفة", "Latifa"), ("منيرة", "Munira"), ("العنود", "Alanoud"), ("جواهر", "Jawaher"), ("مها", "Maha"),
          ("دانة", "Dana"), ("حصة", "Hessa"), ("شهد", "Shahad"), ("لمى", "Lama"), ("غادة", "Ghada"), ("أمل", "Amal"),
          ("وعد", "Waad"), ("سارة", "Sarah"), ("رهف", "Rahaf"), ("هيا", "Haya")],
}
sys.stdout.reconfigure(encoding="utf-8")
dump = lambda o: json.dumps(o, ensure_ascii=False, default=float, allow_nan=False)
digest = lambda o: hashlib.sha256(json.dumps(o, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]


def old_ids(df: pd.DataFrame, old: list) -> list[str]:
    """معرّفات مرضى العرض الأربعة بمطابقة بياناتهم (عدد الساعات والعمر وتسلسل النبض)، حتى لا يُسحبوا مرة ثانية."""
    B = df[df["set"] == "B"]
    n = B.groupby("patient_id").size()
    out = []
    for q in old:
        hr = [h["vitals"]["HR"] for h in q["hours"]]
        for pid in n.index[n == len(q["hours"])]:
            d = B[B.patient_id == pid]
            if r(d.Age.iloc[0], 0) == q["age"] and [r(x) for x in d.HR] == hr:
                out.append(pid)
                break
    assert len(out) == len(old), "لم أجد كل مرضى العرض في B"
    return out


def draw(df: pd.DataFrame, exclude: list[str]) -> list[str]:
    """السحب العشوائي الثابت: يعتمد على المعرّف وعدد الساعات وحالة الإنتان فقط، لا على النموذج."""
    g = df[df["set"] == "B"].groupby("patient_id")
    st = pd.DataFrame({"n": g.size(), "sep": g.t_sepsis.first().notna()})
    st = st[(st.n >= MIN_HOURS) & ~st.index.isin(exclude)].sort_index()
    rng = np.random.default_rng(SEED)
    sep = rng.choice(st.index[st.sep].to_numpy(), N_SEPSIS, replace=False)
    oth = rng.choice(st.index[~st.sep].to_numpy(), N_OTHER, replace=False)
    print(f"المجتمع: {len(st)} مريضاً في B بـ ≥{MIN_HOURS} ساعة ({int(st.sep.sum())} إنتان). سُحب {N_SEPSIS} إنتان + {N_OTHER} غير مصابين.")
    return sorted(sep) + sorted(oth)


def main() -> None:
    f = WEB / "patients.json"
    old = [q for q in json.loads(f.read_text(encoding="utf-8")) if q["id"] <= 4]
    before = {q["id"]: digest(q) for q in old}
    h_max = max(q["hours"][-1]["h"] for q in old if q["id"] <= 3)

    art = joblib.load(OUT / "model.joblib")
    model, cols, thr = art["model"], art["features"], art["thresholds"]
    t_med, t_high = float(thr["medium"]), float(thr["high"])
    df = pd.read_parquet(CLEAN)
    X = build_features(df)
    A = (df["set"] == "A").values
    _, va = next(GroupShuffleSplit(1, test_size=0.2, random_state=SEED).split(df[A], groups=df.patient_id[A]))
    top = float(np.quantile(model.predict_proba(X.iloc[np.flatnonzero(A)[va]][cols])[:, 1], 0.999))
    expl = shap.TreeExplainer(model)

    used = {"M": 0, "F": 0}
    new, stats = [], []
    ex = old_ids(df, old)
    print("مرضى العرض الأربعة (للتقرير فقط):", ex)
    for k, pid in enumerate(draw(df, ex), 5):
        mask = (df.patient_id == pid).values
        xp, dp = X[mask], df[mask]
        pr = model.predict_proba(xp[cols])[:, 1]
        t_s = dp.t_sepsis.iloc[0]
        sep = not np.isnan(t_s)
        # إحصاءات التقرير على كامل بيانات المريض (لا المعروض فقط)
        alert = pr >= t_high
        caught = sep and bool((alert & (dp.hour.values >= t_s - WINDOW) & (dp.hour.values <= t_s)).any())
        keep = dp.hour.values <= h_max
        xs, ds, ps = xp[keep], dp[keep], pr[keep]
        sv = expl.shap_values(xs[cols])
        hrs = []
        for j in range(len(ds)):
            row = ds.iloc[j]
            hrs.append({"h": int(row.hour), "vitals": {v: r(row[v]) for v in PATCH + ["SBP", "MAP", "DBP"]},
                        "fresh": [v for v in PATCH if row[f"measured_{v}"]],
                        "baseline": {v: r(xs[f"{v}_base"].iloc[j]) for v in PATCH},
                        "score": r(to_score(ps[j], t_med, t_high, top)),
                        "level": "high" if ps[j] >= t_high else "medium" if ps[j] >= t_med else "low",
                        "reasons": top_reasons(cols, xs[cols].iloc[j].values, sv[j])})
        gender = "M" if dp.Gender.iloc[0] == 1 else "F"
        ar, en = NAMES[gender][used[gender]]
        used[gender] += 1
        new.append({"id": k, "role": "cohort", "name": {"ar": ar, "en": en}, "age": r(dp.Age.iloc[0], 0), "gender": gender,
                    "sepsis_onset_hour": int(t_s) if sep else None, "hours": hrs})
        lv = [h["level"] for h in hrs]
        stats.append({"id": k, "pid": pid, "name": ar, "sepsis": sep, "hours_all": len(dp), "hours_shown": len(hrs),
                      "first_h": hrs[0]["h"], "last_h": hrs[-1]["h"], "max_shown": max(lv, key=["low", "medium", "high"].index),
                      "any_high_all": bool(alert.any()), "caught_12h": caught if sep else None})

    # ملف منفصل يُحمَّل مع لوحة مقدّم الرعاية فقط (لا يُبطئ شاشة المريض). patients.json لا يُكتب أصلاً.
    c = WEB / "cohort.json"
    c.write_text(dump(new), encoding="utf-8")
    after = {q["id"]: digest(q) for q in json.loads(f.read_text(encoding="utf-8")) if q["id"] <= 4}
    print(pd.DataFrame(stats).to_string(index=False))
    print(f"\nالساعات المصدَّرة حتى الساعة {h_max}. حجم cohort.json: {c.stat().st_size / 1024:.0f} KB")
    print("الأربعة القدامى:", "لم تتغيّر ✅" if before == after else "تغيّرت ❌", before)


if __name__ == "__main__":
    main()

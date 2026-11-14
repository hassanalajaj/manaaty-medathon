import json
import sys
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap
import xgboost as xgb
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from reasons import feature_label, top_reasons

ROOT = Path(__file__).resolve().parents[1]
CLEAN, RAW = ROOT / "data" / "clean.parquet", ROOT / "data" / "raw"
EXCL_CACHE = ROOT / "data" / "exclusions.json"
THR_FILE, OUT, WEB = ROOT / "ml" / "thresholds.json", ROOT / "ml" / "out", ROOT / "web" / "src" / "data"

SEED = 42
PATCH = ["HR", "O2Sat", "Temp", "Resp"]
PRESSURE = ["SBP", "MAP"]
KINDS = ["value", "dev", "delta6", "slope24", "std6"]
BASE_HOURS = 12
WINDOW = 12
FEVER_C = 38.0


def cols(vitals):
    return [f"{v}_{k}" for v in vitals for k in KINDS]


PATCH_COLS = ["Age", "Gender"] + cols(PATCH)
FULL_COLS = PATCH_COLS + cols(PRESSURE) + ["shock_index"]
HS_COLS = PATCH_COLS + [f"hs_{v}" for v in PATCH]

sys.stdout.reconfigure(encoding="utf-8")


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    pid = df["patient_id"]

    def g(s):
        return s.groupby(pid, sort=False)

    def wsum(s, w):
        c = g(s).cumsum()
        return c - g(c).shift(w).fillna(0)

    pos = g(df["hour"]).cumcount().astype("float64")
    F = {"Age": df["Age"], "Gender": df["Gender"]}
    for v in PATCH + PRESSURE:
        y, m = df[v], df[f"measured_{v}"].astype("float64")
        F[f"{v}_value"] = y
        first = y[pos < BASE_HOURS]
        roll = first.groupby(pid[first.index], sort=False).rolling(BASE_HOURS, min_periods=1).median()
        base = g(roll.droplevel(0).reindex(df.index)).ffill()
        F[f"{v}_base"] = base
        F[f"{v}_dev"] = y - base
        F[f"{v}_delta6"] = y - g(y).shift(6)
        x, ym = pos.where(m > 0, 0.0), y.where(m > 0, 0.0)
        n, sx, sy = wsum(m, 24), wsum(x, 24), wsum(ym, 24)
        den = n * wsum(x * x, 24) - sx**2
        F[f"{v}_slope24"] = ((n * wsum(x * ym, 24) - sx * sy) / den).where((n >= 6) & (den > 0))
        yf, k = y.fillna(0.0), y.notna().astype("float64")
        n6, s1, s2 = wsum(k, 6), wsum(yf, 6), wsum(yf * yf, 6)
        var = (s2 - s1**2 / n6.where(n6 > 0)) / (n6 - 1).where(n6 >= 2)
        F[f"{v}_std6"] = np.sqrt(var.clip(lower=0))
        F[f"hs_{v}"] = pos - pos.where(m > 0).groupby(pid, sort=False).ffill()
    F["shock_index"] = df["HR"] / df["SBP"]
    return pd.DataFrame(F).astype("float32")


def check_causal(df: pd.DataFrame) -> None:
    rng = np.random.default_rng(SEED)
    size = df.groupby("patient_id").size()
    ids = rng.choice(size.index[size >= 12], 40, replace=False)
    sub = df[df.patient_id.isin(ids)]
    n = sub.groupby("patient_id").size()
    cut = pd.Series({p: rng.integers(10, n[p]) for p in ids})
    part = sub[sub.groupby("patient_id").cumcount() < sub.patient_id.map(cut)]
    a, b = build_features(sub).loc[part.index], build_features(part)
    assert np.allclose(a.values, b.values, rtol=1e-4, atol=1e-4, equal_nan=True), "ميزة تستخدم المستقبل!"


def row_metrics(y, s) -> dict:
    return {"auroc": roc_auc_score(y, s), "auprc": average_precision_score(y, s), "prevalence": float(np.mean(y))}


def leads(d: pd.DataFrame, alert: pd.Series) -> pd.Series:
    lead = d.t_sepsis - d.hour
    ok = alert & lead.between(1, WINDOW)
    return lead[ok].groupby(d.patient_id[ok]).max()


def patient_eval(d: pd.DataFrame, score, thr: float) -> dict:
    alert = pd.Series(np.asarray(score) >= thr, index=d.index)
    sep = d.t_sepsis.notna()
    n_sep = d.patient_id[sep].nunique()
    ld = leads(d, alert)
    a = alert.astype(int)
    edge = (a == 1) & (a.groupby(d.patient_id).shift(1, fill_value=0) == 0)
    ns = ~sep
    return {"n_sepsis": int(n_sep), "detected": int(len(ld)), "sensitivity": len(ld) / n_sep,
            "median_lead_h": float(ld.median()) if len(ld) else None,
            "n_nonsepsis": int(d.patient_id[ns].nunique()),
            "pct_nonsepsis_alerted": float(alert[ns].groupby(d.patient_id[ns]).any().mean()),
            "false_alerts_per_patient_day": float((edge & ns).sum() / (ns.sum() / 24))}


def threshold_for_fa(d, score, target: float) -> float:
    lo, hi = float(np.min(score)), float(np.max(score))
    for _ in range(14):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if patient_eval(d, score, mid)["false_alerts_per_patient_day"] > target else (lo, mid)
    return hi


def no_fever(d: pd.DataFrame) -> dict:
    total = d.patient_id[d.t_sepsis.notna()].nunique()
    w = d[d.t_sepsis.notna() & (d.t_sepsis - d.hour).between(1, WINDOW) & d.measured_Temp]
    reached = w.groupby("patient_id").Temp.max() >= FEVER_C
    return {"sepsis_patients": int(total), "with_temp_measurement": int(len(reached)),
            "excluded_no_measurement": int(total - len(reached)), "no_fever_n": int((~reached).sum()),
            "no_fever_pct": float((~reached).mean() * 100)}


def exclusion_stats() -> dict:
    if EXCL_CACHE.exists():
        return json.loads(EXCL_CACHE.read_text())
    res = {}
    for s in "AB":
        tot = early = short = 0
        for f in sorted((RAW / f"training_set{s}").glob("*.psv")):
            d = pd.read_csv(f, sep="|", usecols=["ICULOS", "SepsisLabel"])
            lab = d.ICULOS[d.SepsisLabel == 1]
            if lab.empty:
                continue
            tot += 1
            first = lab.min()
            n_kept = int((d.ICULOS <= first + 6).sum())
            early += int(first <= 6)
            short += int(first > 6 and n_kept < 8)
        res[s] = {"sepsis_before_exclusion": tot, "excluded_early_onset": early,
                  "excluded_early_pct": 100 * early / tot, "excluded_short_stay_only": short}
    EXCL_CACHE.write_text(json.dumps(res))
    return res


def fit_xgb(Xtr, ytr, Xva, yva):
    m = xgb.XGBClassifier(tree_method="hist", n_estimators=800, learning_rate=0.05, max_depth=5,
                          min_child_weight=20, subsample=0.8, colsample_bytree=0.8,
                          scale_pos_weight=(ytr == 0).sum() / (ytr == 1).sum(), eval_metric="aucpr",
                          early_stopping_rounds=40, random_state=SEED, n_jobs=-1)
    return m.fit(Xtr, ytr, eval_set=[(Xva, yva)], verbose=False)


def fit_logreg(Xtr, ytr):
    return make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                         LogisticRegression(max_iter=300, class_weight="balanced")).fit(Xtr, ytr)


def pick_demo(B: pd.DataFrame, s, t_med: float, t_high: float) -> dict:
    d = B.assign(s=s)
    gp = d.groupby("patient_id")
    st = pd.DataFrame({"n": gp.size(), "sep": gp.t_sepsis.first().notna(), "max": gp.s.max(),
                       "fmed": d.s.ge(t_med).groupby(d.patient_id).mean(),
                       "tm": gp.measured_Temp.mean()})
    st["lead"] = leads(d, d.s >= t_high)
    st["first_high_lead"] = (d.t_sepsis - d.hour)[d.s >= t_high].groupby(d.patient_id).max()
    ok = st.tm >= 0.15
    rules = {"stable": ~st.sep & st.n.between(48, 120) & (st["max"] < t_med),
             "fluctuating": ~st.sep & st.n.between(48, 120) & (st["max"] >= t_med) & (st["max"] < t_high) & st.fmed.between(0.05, 0.4),
             "deteriorating": st.sep & st.n.between(36, 120) & st.first_high_lead.between(6, WINDOW),
             "missed": st.sep & st.n.between(36, 120) & st.lead.isna(),
             "false_alarm": ~st.sep & st.n.between(48, 120) & (st["max"] >= t_high)}
    pick = {}
    for role, rule in rules.items():
        hit = st.index[rule & ok]
        pick[role] = hit.min() if len(hit) else None
    if pick["missed"] is None:
        pick["missed"] = pick["false_alarm"]
    return {k: pick[k] for k in ("stable", "fluctuating", "deteriorating", "missed")}


def to_score(p, t_med, t_high, top):
    return float(np.interp(p, [0, t_med, t_high, max(top, t_high + 1e-6)], [0, 40, 70, 100]))


def r(x, nd=1):
    return None if x is None or pd.isna(x) else round(float(x), nd)


def main() -> None:
    df = pd.read_parquet(CLEAN)
    check_causal(df)
    X, y = build_features(df), df.SepsisLabel.values
    A, Bm = (df["set"] == "A").values, (df["set"] == "B").values
    tr, va = next(GroupShuffleSplit(1, test_size=0.2, random_state=SEED).split(df[A], groups=df.patient_id[A]))
    itr, iva = np.flatnonzero(A)[tr], np.flatnonzero(A)[va]
    ib = np.flatnonzero(Bm)
    assert not set(df.patient_id.iloc[itr]) & set(df.patient_id.iloc[iva]), "مريض مشترك بين التدريب والتحقق"
    meta = ["patient_id", "hour", "t_sepsis", "SepsisLabel", "measured_Temp", "Temp"]
    Dv, Db = df.iloc[iva][meta], df.iloc[ib][meta]
    print(f"تدريب: {len(itr):,} صف، تحقق: {len(iva):,}، اختبار خارجي B (لم يُلمس بعد): {len(ib):,}")

    xtr, ytr, xva, yva = X.iloc[itr], y[itr], X.iloc[iva], y[iva]
    main_m = fit_xgb(xtr[PATCH_COLS], ytr, xva[PATCH_COLS], yva)
    full_m = fit_xgb(xtr[FULL_COLS], ytr, xva[FULL_COLS], yva)
    lr_m = fit_logreg(xtr[PATCH_COLS], ytr)
    hs_m = fit_xgb(xtr[HS_COLS], ytr, xva[HS_COLS], yva)
    val = {"main": main_m.predict_proba(xva[PATCH_COLS])[:, 1], "full": full_m.predict_proba(xva[FULL_COLS])[:, 1],
           "logreg": lr_m.predict_proba(xva[PATCH_COLS])[:, 1], "hours_since": hs_m.predict_proba(xva[HS_COLS])[:, 1],
           "fever": Dv.Temp.fillna(0.0).values}
    vm = {k: row_metrics(yva, s) for k, s in val.items()}
    print("\n== التحقق (A 20%): AUROC / AUPRC ==")
    for k, m in vm.items():
        print(f"{k:12s} {m['auroc']:.4f} / {m['auprc']:.4f}   (عشوائي AUPRC = {m['prevalence']:.4f})")
    abl = {"auroc_without": vm["main"]["auroc"], "auroc_with_hours_since": vm["hours_since"]["auroc"],
           "diff": vm["hours_since"]["auroc"] - vm["main"]["auroc"]}
    print(f"\nتجربة hours_since (تحقق فقط): الفرق في AUROC = {abl['diff']:+.4f}")
    fever_val = patient_eval(Dv, val["fever"], FEVER_C)
    print(f"قاعدة الحمّى على التحقق: حساسية {fever_val['sensitivity']:.3f}، تنبيهات كاذبة/مريض/يوم {fever_val['false_alerts_per_patient_day']:.3f}")

    if not THR_FILE.exists():
        print("\n== جدول مقايضة الحدود (نموذج اللاصقة، التحقق فقط) ==")
        print("الحد     حساسية(داخل 12س)  كاذبة/مريض/يوم  %غير مصابين نُبّهوا  وسيط الساعات المبكرة")
        for q in (0.80, 0.85, 0.90, 0.93, 0.95, 0.97, 0.98, 0.99, 0.995):
            t = float(np.quantile(val["main"], q))
            e = patient_eval(Dv, val["main"], t)
            print(f"{t:.3f}   {e['sensitivity']:.3f}            {e['false_alerts_per_patient_day']:.3f}"
                  f"            {e['pct_nonsepsis_alerted']:.3f}               {e['median_lead_h']}")
        print("\nالمرحلة 1 انتهت (B لم تُلمس). ثبّت الحدين في ml/thresholds.json كـ {\"medium\":..,\"high\":..} وأعد التشغيل.")
        return

    thr = json.loads(THR_FILE.read_text(encoding="utf-8"))
    t_med, t_high = float(thr["medium"]), float(thr["high"])
    xb, yb = X.iloc[ib], y[ib]
    test = {"main": main_m.predict_proba(xb[PATCH_COLS])[:, 1], "full": full_m.predict_proba(xb[FULL_COLS])[:, 1],
            "logreg": lr_m.predict_proba(xb[PATCH_COLS])[:, 1], "fever": Db.Temp.fillna(0.0).values}
    fa_target = patient_eval(Dv, val["main"], t_high)["false_alerts_per_patient_day"]
    op = {"main": t_high, "full": threshold_for_fa(Dv, val["full"], fa_target),
          "logreg": threshold_for_fa(Dv, val["logreg"], fa_target), "fever": FEVER_C}
    models = {}
    for k in ("fever", "logreg", "main", "full"):
        models[k] = {"threshold": op[k],
                     "validation": {**vm[k], "patient": patient_eval(Dv, val[k], op[k])},
                     "external_B": {**row_metrics(yb, test[k]), "patient": patient_eval(Db, test[k], op[k])}}
    models["main"]["external_B"]["patient_medium"] = patient_eval(Db, test["main"], t_med)
    t_fa = threshold_for_fa(Dv, val["main"], fever_val["false_alerts_per_patient_day"])
    main_at_fever_fa = {"threshold": t_fa, "external_B": patient_eval(Db, test["main"], t_fa)}

    expl = shap.TreeExplainer(main_m)
    samp = xva[PATCH_COLS].sample(20000, random_state=SEED)
    imp = np.abs(expl.shap_values(samp)).mean(axis=0)
    top_feats = [{"feature": PATCH_COLS[i], **feature_label(PATCH_COLS[i]), "mean_abs_shap": float(imp[i])}
                 for i in np.argsort(-imp)[:10]]

    demo_ids = pick_demo(Db, test["main"], t_med, t_high)
    top = float(np.quantile(val["main"], 0.999))
    patients = []
    for i, (role, pid) in enumerate(demo_ids.items(), 1):
        mask = (df.patient_id == pid).values
        xp, dp = X[mask], df[mask]
        p = main_m.predict_proba(xp[PATCH_COLS])[:, 1]
        sv = expl.shap_values(xp[PATCH_COLS])
        hrs = []
        for j in range(len(dp)):
            row = dp.iloc[j]
            hrs.append({"h": int(row.hour),
                        "vitals": {v: r(row[v]) for v in PATCH + ["SBP", "MAP", "DBP"]},
                        "fresh": [v for v in PATCH if row[f"measured_{v}"]],
                        "baseline": {v: r(xp[f"{v}_base"].iloc[j]) for v in PATCH},
                        "score": r(to_score(p[j], t_med, t_high, top)),
                        "level": "high" if p[j] >= t_high else "medium" if p[j] >= t_med else "low",
                        "reasons": top_reasons(PATCH_COLS, xp[PATCH_COLS].iloc[j].values, sv[j])})
        sep = not np.isnan(dp.t_sepsis.iloc[0])
        patients.append({"id": i, "role": role, "age": r(dp.Age.iloc[0], 0), "gender": "M" if dp.Gender.iloc[0] == 1 else "F",
                         "sepsis_onset_hour": int(dp.t_sepsis.iloc[0]) if sep else None, "hours": hrs,
                         "_physionet_id": pid})

    excl, nf = exclusion_stats(), {s: no_fever(df[df["set"] == s]) for s in "AB"}
    ids = {p["id"]: p.pop("_physionet_id") for p in patients}
    assert (df.t_sepsis.isna() | (df.hour <= df.t_sepsis)).all()
    assert not {"hour"} & set(PATCH_COLS) and not any(c.startswith(("hs_", "measured_")) for c in PATCH_COLS)

    metrics = {"trained_at": date.today().isoformat(), "seed": SEED, "window_hours": WINDOW, "fever_celsius": FEVER_C,
               "data": {s: {"patients": int(df.patient_id[df["set"] == s].nunique()), "rows": int((df["set"] == s).sum())} for s in "AB"},
               "split": {"train_rows": len(itr), "val_rows": len(iva), "external_rows": len(ib),
                         "best_iteration_main": int(main_m.best_iteration)},
               "exclusions": {**excl, "note": "أرقام الاختبار على B لا تشمل هؤلاء المرضى"},
               "no_fever": nf, "models": models, "main_at_fever_false_alert_rate": main_at_fever_fa,
               "thresholds": {"medium": t_med, "high": t_high, "why": thr.get("why", "قرار تصميم")},
               "top_features": top_feats, "hours_since_ablation": abl,
               "feature_sets": {"patch": PATCH_COLS, "full": FULL_COLS}}
    WEB.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": main_m, "features": PATCH_COLS, "thresholds": thr}, OUT / "model.joblib")
    (WEB / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=1, default=float, allow_nan=False), encoding="utf-8")
    (WEB / "patients.json").write_text(json.dumps(patients, ensure_ascii=False, default=float, allow_nan=False), encoding="utf-8")

    print("\n== الاختبار الخارجي B (مرة واحدة) ==")
    for k, m in models.items():
        e, pe = m["external_B"], m["external_B"]["patient"]
        print(f"{k:8s} AUROC {e['auroc']:.4f} AUPRC {e['auprc']:.4f} | حساسية {pe['sensitivity']:.3f}، "
              f"كاذبة/يوم {pe['false_alerts_per_patient_day']:.3f}، وسيط مبكر {pe['median_lead_h']}")
    e = main_at_fever_fa["external_B"]
    print(f"النموذج بنفس معدل كاذبات الحمّى: حساسية {e['sensitivity']:.3f}، كاذبة/يوم {e['false_alerts_per_patient_day']:.3f}")
    print("بلا حمّى:", nf)
    print("المستبعدون:", excl)
    print("مرضى الديمو (معرّف PhysioNet للتقرير فقط):", ids)
    print("أهم الميزات:", [t["feature"] for t in top_feats])


if __name__ == "__main__":
    main()

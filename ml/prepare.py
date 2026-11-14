import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "clean.parquet"
SUMMARY = ROOT / "data" / "prepare_summary.md"

VITALS = ["HR", "O2Sat", "Temp", "Resp", "SBP", "MAP", "DBP"]
KEEP = VITALS + ["Age", "Gender"]
VALID = {"HR": (20, 250), "O2Sat": (50, 100), "Temp": (30, 43), "Resp": (4, 60),
         "SBP": (40, 260), "MAP": (20, 200), "DBP": (10, 180)}
FFILL_LIMIT = {"HR": 4, "O2Sat": 4, "Resp": 4, "SBP": 4, "MAP": 4, "DBP": 4, "Temp": 12}
MIN_HOURS = 8
MIN_LABEL_HOUR = 6
LABEL_LEAD = 6
TEMP_STOP = 0.50

sys.stdout.reconfigure(encoding="utf-8")
lines: list[str] = []


def say(text: str = "") -> None:
    print(text)
    lines.append(text)


def table(df: pd.DataFrame) -> None:
    say(df.to_string())


def read_all() -> pd.DataFrame:
    frames = []
    for s in ("A", "B"):
        files = sorted((RAW / f"training_set{s}").glob("*.psv"))
        if not files:
            sys.exit(f"لا ملفات في data/raw/training_set{s}: حمّل البيانات أولاً")
        for f in files:
            d = pd.read_csv(f, sep="|")
            d["patient_id"], d["set"], d["hour"] = f.stem, s, d["ICULOS"]
            frames.append(d)
    return pd.concat(frames, ignore_index=True)


def inspect(df: pd.DataFrame) -> None:
    say("## الفحص قبل التنظيف")
    pat = df.groupby(["set", "patient_id"]).agg(rows=("hour", "size"), sepsis=("SepsisLabel", "max"))
    rows = []
    for s, g in pat.groupby("set"):
        rows.append({"المجموعة": s, "المرضى": len(g), "الصفوف": int(g.rows.sum()),
                     "وسيط الساعات/مريض": float(g.rows.median()),
                     "مرضى إنتان %": round(100 * g.sepsis.mean(), 2),
                     "صفوف SepsisLabel=1 %": round(100 * df[df.set == s].SepsisLabel.mean(), 2)})
    table(pd.DataFrame(rows).set_index("المجموعة"))
    miss = (df.drop(columns=["patient_id", "set", "hour"]).isna().mean() * 100).round(1)
    say("\nنسبة القيم الناقصة % لكل عمود (قبل أي تنظيف):")
    say(", ".join(f"{k}={v}" for k, v in miss.sort_values().items()))
    say(f"\nتأكيد EtCO2: ناقص {miss['EtCO2']}% (لذلك يُحذف).")
    gaps = df.groupby("patient_id").hour.diff().dropna()
    say(f"فجوات في تسلسل الساعات (ليست +1): {(gaps != 1).sum()} من {len(gaps)}")


def drop_impossible(df: pd.DataFrame) -> pd.DataFrame:
    say("\n## القيم المستحيلة المحوّلة إلى NaN")
    out = {}
    for v, (lo, hi) in VALID.items():
        bad = df[v].notna() & ~df[v].between(lo, hi)
        out[v] = {"النطاق": f"{lo}–{hi}", "عدد المحذوف": int(bad.sum())}
        df.loc[bad, v] = np.nan
    table(pd.DataFrame(out).T)
    return df


def sort_and_truncate(df: pd.DataFrame) -> pd.DataFrame:
    n0 = len(df)
    df = df.sort_values(["patient_id", "hour"]).drop_duplicates(["patient_id", "hour"], keep="first")
    say(f"\nساعات مكررة محذوفة: {n0 - len(df)}")
    first = df[df.SepsisLabel == 1].groupby("patient_id").hour.min()
    df["first_label_hour"] = df.patient_id.map(first)
    df["t_sepsis"] = df.first_label_hour + LABEL_LEAD
    after = df.t_sepsis.notna() & (df.hour > df.t_sepsis)
    say(f"صفوف بعد بداية الإنتان (محذوفة): {int(after.sum())} من {n0}")
    return df[~after]


def exclude(df: pd.DataFrame) -> pd.DataFrame:
    say("\n## الاستبعاد: كم مريضاً يُستبعد تحت كل قاعدة (بعد حذف ما بعد البداية)")
    p = df.groupby("patient_id").agg(set=("set", "first"), n=("hour", "size"), lab=("first_label_hour", "first"))
    cand = {"أقل من 6 ساعات": p.n < 6, "أقل من 8 ساعات (المختارة)": p.n < MIN_HOURS,
            "أقل من 12 ساعة": p.n < 12,
            "إنتان يبدأ تسميته ≤6 ساعات (المختارة)": p.lab <= MIN_LABEL_HOUR,
            "إنتان يبدأ تسميته ≤12 ساعة": p.lab <= 12}
    rows = {k: {"A": int(m[p.set == "A"].sum()), "B": int(m[p.set == "B"].sum())} for k, m in cand.items()}
    table(pd.DataFrame(rows).T)
    drop = (p.n < MIN_HOURS) | (p.lab <= MIN_LABEL_HOUR)
    say(f"\nالمستبعد فعلياً (اتحاد القاعدتين): A={int(drop[p.set == 'A'].sum())}, B={int(drop[p.set == 'B'].sum())}")
    return df[df.patient_id.isin(p.index[~drop])]


def fill_missing(df: pd.DataFrame) -> pd.DataFrame:
    for v in VITALS:
        df[f"measured_{v}"] = df[v].notna()
    g = df.groupby("patient_id")
    for v, lim in FFILL_LIMIT.items():
        df[v] = g[v].ffill(limit=lim)
    return df


def temp_check(df: pd.DataFrame) -> float:
    say("\n## نسبة الصفوف بلا قيمة بعد الملء (الحرارة هي الحاسمة)")
    rows = {v: {"قبل الملء %": round(100 * (~df[f"measured_{v}"]).mean(), 1),
                "بعد الملء %": round(100 * df[v].isna().mean(), 1)} for v in VITALS}
    table(pd.DataFrame(rows).T)
    t = df.Temp.isna().mean()
    for s in ("A", "B"):
        say(f"الحرارة الناقصة بعد الملء في {s}: {100 * df[df.set == s].Temp.isna().mean():.1f}%")
    return t


def main() -> None:
    df = read_all()
    inspect(df)
    n_before = {s: (df[df.set == s].patient_id.nunique(), int((df.set == s).sum())) for s in "AB"}
    df = df[KEEP + ["hour", "SepsisLabel", "patient_id", "set"]]
    say(f"\nالأعمدة المتبقية: {', '.join(df.columns)} (حُذف 26 تحليلاً وEtCO2 وUnit1 وUnit2 وHospAdmTime وICULOS المكرر)")
    df = drop_impossible(df)
    df = sort_and_truncate(df)
    df = exclude(df)
    df = fill_missing(df)
    t = temp_check(df)
    df.to_parquet(OUT, index=False)
    say("\n## قبل / بعد")
    rows = {s: {"مرضى قبل": n_before[s][0], "صفوف قبل": n_before[s][1],
                "مرضى بعد": df[df.set == s].patient_id.nunique(), "صفوف بعد": int((df.set == s).sum()),
                "مرضى إنتان بعد": int(df[df.set == s].groupby("patient_id").SepsisLabel.max().sum())} for s in "AB"}
    table(pd.DataFrame(rows).T)
    say(f"\nحُفظ: {OUT}")
    SUMMARY.write_text("\n".join(lines), encoding="utf-8")
    if t > TEMP_STOP:
        say(f"\n⚠️ توقف: الحرارة الناقصة بعد الملء {100 * t:.1f}% (> {int(TEMP_STOP * 100)}%). اعرض الرقم على الفريق.")
        sys.exit(2)


if __name__ == "__main__":
    main()

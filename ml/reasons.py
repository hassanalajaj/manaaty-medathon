import numpy as np

VN = {"HR": ("النبض", "Heart rate", True), "O2Sat": ("الأكسجين", "Oxygen saturation", True),
      "Temp": ("الحرارة", "Temperature", False), "Resp": ("التنفس", "Respiration", True),
      "SBP": ("الضغط الانقباضي", "Systolic pressure", True), "MAP": ("متوسط الضغط الشرياني", "Mean arterial pressure", True)}


def num(x: float, v: str) -> str:
    return f"{abs(x):.1f}" if v == "Temp" or abs(x) < 1 else f"{abs(x):.0f}"


def feature_label(f: str) -> dict:
    if f in ("Age", "Gender", "shock_index"):
        return {"Age": {"ar": "العمر", "en": "Age"}, "Gender": {"ar": "الجنس", "en": "Sex"},
                "shock_index": {"ar": "مؤشر الصدمة", "en": "Shock index"}}[f]
    v, k = f.split("_", 1)
    ar, en, _ = VN[v]
    return {"value": {"ar": f"{ar} الآن", "en": f"{en} now"},
            "dev": {"ar": f"{ar} مقابل معتاده", "en": f"{en} vs. usual"},
            "delta6": {"ar": f"تغيّر {ar} خلال 6 ساعات", "en": f"{en} change over 6 h"},
            "slope24": {"ar": f"اتجاه {ar} خلال 24 ساعة", "en": f"{en} trend over 24 h"},
            "std6": {"ar": f"تذبذب {ar}", "en": f"{en} variability"}}[k]


def reason(f: str, x: float) -> dict:
    if f == "shock_index":
        return {"feature": f, "ar": f"مؤشر الصدمة مرتفع ({x:.2f})", "en": f"Shock index elevated ({x:.2f})"}
    v, k = f.split("_", 1)
    ar, en, masc = VN[v]
    n = num(x, v)
    s = {"value": (f"{ar} الآن {n}", f"{en} now {n}"),
         "dev": (f"{ar} {'أعلى' if x > 0 else 'أقل'} من معتاد{'ه' if masc else 'ها'} بـ {n}",
                 f"{en} {n} {'above' if x > 0 else 'below'} usual"),
         "delta6": (f"{ar} {'ارتفع' if x > 0 else 'انخفض'} {n} خلال 6 ساعات",
                    f"{en} {'rose' if x > 0 else 'fell'} {n} over 6 h"),
         "slope24": (f"اتجاه {ar} {'صاعد' if x > 0 else 'نازل'} خلال 24 ساعة",
                     f"{en} trending {'up' if x > 0 else 'down'} over 24 h"),
         "std6": (f"{ar} غير مستقر في آخر 6 ساعات", f"{en} unstable over the last 6 h")}[k]
    return {"feature": f, "ar": s[0], "en": s[1]}


def top_reasons(feats: list[str], xrow, srow, n=3) -> list[dict]:
    order = np.argsort(-srow)
    out = [reason(feats[i], float(xrow[i])) for i in order
           if srow[i] > 0 and feats[i] not in ("Age", "Gender") and not np.isnan(xrow[i])]
    return out[:n]



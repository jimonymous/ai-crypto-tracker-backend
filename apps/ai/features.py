from typing import Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
from models import Candle, IndicatorSeries


def _to_dataframe(candles: List[Candle]) -> pd.DataFrame:
    df = pd.DataFrame(
        [
            {
                "timestamp": c.timestamp,
                "open": c.open,
                "high": c.high,
                "low": c.low,
                "close": c.close,
                "volume": c.volume,
            }
            for c in candles
        ]
    )
    return df.sort_values("timestamp").reset_index(drop=True)


def _indicator_map(indicators: Optional[List[IndicatorSeries]]) -> Dict[str, IndicatorSeries]:
    if not indicators:
        return {}
    return {series.name.lower(): series for series in indicators}

def _coerce_float(val):
    try:
        return float(val)
    except Exception:
        return None


def _series_from_indicator(series: Optional[IndicatorSeries]) -> Optional[pd.Series]:
    if not series:
        return None
    data = {point.timestamp: point.value for point in series.values if point.timestamp is not None}
    if not data:
        return None
    return pd.Series(data).sort_index()


def _extract_numeric(series: Optional[pd.Series]) -> Optional[pd.Series]:
    if series is None:
        return None
    coerced = series.apply(_coerce_float)
    if coerced.isna().all():
        return None
    return coerced
    return None


def build_feature_frame(
    candles: List[Candle], indicators: Optional[List[IndicatorSeries]] = None
) -> pd.DataFrame:
    if not candles:
        return pd.DataFrame()

    df = _to_dataframe(candles)
    df["return_1"] = df["close"].pct_change()
    df["log_return"] = np.log(df["close"]).diff()
    df["volume_change"] = df["volume"].pct_change()
    df["volatility_10"] = df["return_1"].rolling(window=10).std()
    df["volatility_20"] = df["return_1"].rolling(window=20).std()

    indicator_lookup = _indicator_map(indicators)

    rsi_series = _extract_numeric(_series_from_indicator(indicator_lookup.get("rsi14")))
    if rsi_series is not None:
        df = df.merge(
            rsi_series.rename("rsi14"), left_on="timestamp", right_index=True, how="left"
        )
        df["rsi_slope_3"] = df["rsi14"].diff(periods=3) / 3

    macd_series = _series_from_indicator(indicator_lookup.get("macd"))
    if macd_series is not None:
        hist = macd_series.apply(
            lambda v: _coerce_float(v.get("histogram")) if isinstance(v, dict) else None
        )
        df = df.merge(hist.rename("macd_hist"), left_on="timestamp", right_index=True, how="left")
        df["macd_hist_slope_3"] = df["macd_hist"].diff(periods=3) / 3

    ema20 = _extract_numeric(_series_from_indicator(indicator_lookup.get("ema20")))
    ema50 = _extract_numeric(_series_from_indicator(indicator_lookup.get("ema50")))
    atr14 = _extract_numeric(_series_from_indicator(indicator_lookup.get("atr14")))

    if ema20 is not None:
        df = df.merge(ema20.rename("ema20"), left_on="timestamp", right_index=True, how="left")
    if ema50 is not None:
        df = df.merge(ema50.rename("ema50"), left_on="timestamp", right_index=True, how="left")
    if atr14 is not None:
        df = df.merge(atr14.rename("atr14"), left_on="timestamp", right_index=True, how="left")

    if "ema20" in df.columns and "atr14" in df.columns:
        df["ema20_dist_atr"] = (df["close"] - df["ema20"]) / df["atr14"]
    if "ema50" in df.columns and "atr14" in df.columns:
        df["ema50_dist_atr"] = (df["close"] - df["ema50"]) / df["atr14"]

    bb_series = _series_from_indicator(indicator_lookup.get("bollinger"))
    if bb_series is not None:
        bb_df = bb_series.apply(lambda v: v if isinstance(v, dict) else {}).apply(pd.Series)
        bb_df = bb_df.rename(
            columns={"upper": "bb_upper", "middle": "bb_middle", "lower": "bb_lower", "std": "bb_std"}
        )
        for col in ["bb_upper", "bb_middle", "bb_lower", "bb_std"]:
            if col in bb_df:
                bb_df[col] = bb_df[col].apply(_coerce_float)
        bb_df["timestamp"] = bb_df.index
        df = df.merge(bb_df, on="timestamp", how="left")
        if {"bb_upper", "bb_lower", "bb_middle"}.issubset(set(df.columns)):
            df["bb_width"] = (df["bb_upper"] - df["bb_lower"]) / df["bb_middle"]

    df["target_forward_return_6"] = df["close"].shift(-6) / df["close"] - 1
    df["target_forward_vol_6"] = df["target_forward_return_6"].abs()

    feature_columns = [
        col
        for col in df.columns
        if col
        not in [
            "timestamp",
            "open",
            "high",
            "low",
            "close",
            "volume",
            "target_forward_return_6",
            "target_forward_vol_6",
        ]
    ]

    return df[["timestamp"] + feature_columns + ["target_forward_return_6", "target_forward_vol_6"]]


def latest_feature_row(
    candles: List[Candle], indicators: Optional[List[IndicatorSeries]] = None
) -> Tuple[Optional[int], Optional[pd.Series]]:
    frame = build_feature_frame(candles, indicators)
    if frame.empty:
        return None, None
    latest = frame.iloc[-1]
    clean = latest.drop(labels=["timestamp", "target_forward_return_6", "target_forward_vol_6"])
    return int(latest["timestamp"]), clean

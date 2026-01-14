import os
import sys

import numpy as np
import pandas as pd

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from features import build_feature_frame, latest_feature_row  # noqa: E402
from models import Candle, IndicatorPoint, IndicatorSeries  # noqa: E402


def sample_candles(n=20):
    return [
        Candle(timestamp=i, open=100 + i, high=101 + i, low=99 + i, close=100 + i + (i % 3), volume=1000 + i)
        for i in range(n)
    ]


def sample_indicators():
    ts = [i for i in range(20)]
    return [
        IndicatorSeries(name="rsi14", values=[IndicatorPoint(timestamp=t, value=50 + t * 0.1) for t in ts]),
        IndicatorSeries(name="macd", values=[IndicatorPoint(timestamp=t, value={"histogram": 0.01 * t}) for t in ts]),
        IndicatorSeries(name="ema20", values=[IndicatorPoint(timestamp=t, value=100 + t * 0.5) for t in ts]),
        IndicatorSeries(name="ema50", values=[IndicatorPoint(timestamp=t, value=95 + t * 0.3) for t in ts]),
        IndicatorSeries(name="atr14", values=[IndicatorPoint(timestamp=t, value=1.5 + 0.01 * t) for t in ts]),
        IndicatorSeries(
            name="bollinger",
            values=[
                IndicatorPoint(
                    timestamp=t,
                    value={"upper": 110 + t, "lower": 90 + t, "middle": 100 + t, "std": 2.0},
                )
                for t in ts
            ],
        ),
    ]


def test_build_feature_frame_with_indicators():
    candles = sample_candles()
    indicators = sample_indicators()

    frame = build_feature_frame(candles, indicators)
    assert not frame.empty
    # ensure key engineered features exist
    for col in [
        "return_1",
        "log_return",
        "volatility_10",
        "volatility_20",
        "rsi14",
        "rsi_slope_3",
        "macd_hist",
        "macd_hist_slope_3",
        "ema20_dist_atr",
        "ema50_dist_atr",
        "bb_width",
        "volume_change",
        "target_forward_return_6",
        "target_forward_vol_6",
    ]:
        assert col in frame.columns
    # warmup rows contain NaNs but not all rows
    assert frame["return_1"].isna().sum() > 0
    assert frame["return_1"].notna().sum() > 0
    # no NaNs in forward targets after dropna logic in dataset later
    assert frame["target_forward_return_6"].isna().sum() > 0  # shifted creates NaNs at tail
    # shape aligns with candles
    assert len(frame) == len(candles)


def test_latest_feature_row_returns_sorted_latest():
    candles = sample_candles()
    indicators = sample_indicators()
    ts, series = latest_feature_row(candles, indicators)
    assert ts == candles[-1].timestamp
    assert isinstance(series, pd.Series)
    # vector has no target columns
    assert "target_forward_return_6" not in series.index
    assert not np.isnan(series).all()


def test_empty_candles_returns_empty_frame():
    frame = build_feature_frame([], [])
    assert frame.empty

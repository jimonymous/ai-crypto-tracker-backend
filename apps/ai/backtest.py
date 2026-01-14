import pandas as pd
from typing import Dict, List
from models import Candle
from features import build_feature_frame


def compute_backtest(candles: List[Candle]) -> Dict[str, float]:
    if not candles:
        raise ValueError("No candles provided")
    df = pd.DataFrame(
        [{"timestamp": c.timestamp, "close": c.close} for c in candles]
    ).sort_values("timestamp")

    df["ret"] = df["close"].pct_change().fillna(0)
    df["cum_return"] = (1 + df["ret"]).cumprod() - 1
    df["drawdown"] = df["cum_return"] - df["cum_return"].cummax()

    total_return = float(df["cum_return"].iloc[-1])
    max_drawdown = float(df["drawdown"].min())
    vol = float(df["ret"].std() * (len(df) ** 0.5)) if len(df) else 0.0
    sharpe = float((df["ret"].mean() / df["ret"].std()) * (len(df) ** 0.5)) if df["ret"].std() != 0 else 0.0

    return {
        "total_return": total_return,
        "max_drawdown": max_drawdown,
        "volatility": vol,
        "sharpe": sharpe
    }

import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backtest import compute_backtest  # noqa: E402
from models import Candle  # noqa: E402


def test_backtest_metrics():
    candles = [
        Candle(timestamp=i, open=100 + i, high=101 + i, low=99 + i, close=100 + i, volume=1000)
        for i in range(10)
    ]
    metrics = compute_backtest(candles)
    assert "total_return" in metrics
    assert "max_drawdown" in metrics
    assert metrics["total_return"] >= 0


def test_backtest_trending_and_empty():
    candles = [
        Candle(timestamp=i, open=1 + i, high=2 + i, low=0.5 + i, close=1 + i * 0.2, volume=10) for i in range(5)
    ]
    metrics = compute_backtest(candles)
    assert metrics["total_return"] > 0
    assert metrics["max_drawdown"] <= 0
    try:
        compute_backtest([])
    except ValueError:
        assert True
    else:
        assert False

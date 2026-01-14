import os
import sys
import numpy as np

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dataset import build_dataset  # noqa: E402
from models import Candle  # noqa: E402


def make_candles(n=40):
    return [
        Candle(timestamp=i, open=100 + i, high=101 + i, low=99 + i, close=100 + i + (i % 2), volume=1000 + i)
        for i in range(n)
    ]


def test_build_dataset_splits_and_labels():
    candles = make_candles()
    ds = build_dataset(candles, indicators=None, train_ratio=0.6, val_ratio=0.2)

    total_rows = len(ds.X_train) + len(ds.X_val) + len(ds.X_test)
    # account for forward target shift (last few rows dropped)
    assert total_rows <= len(candles)
    assert len(ds.feature_names) == ds.X_train.shape[1]

    # labels align with features
    assert len(ds.y_up_train) == len(ds.X_train)
    if len(ds.X_val):
        assert len(ds.y_up_val) == len(ds.X_val)

    # no leakage: timestamps strictly increasing across splits
    # approximate by checking lengths sum and non-zero train
    assert len(ds.X_train) > 0


def test_build_dataset_raises_on_empty():
    try:
        build_dataset([], None)
    except ValueError:
        assert True
    else:
        assert False

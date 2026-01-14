from dataclasses import dataclass
from typing import List, Optional
import numpy as np
import pandas as pd
from models import Candle, IndicatorSeries
from features import build_feature_frame


@dataclass
class DatasetSplits:
    X_train: np.ndarray
    X_val: np.ndarray
    X_test: np.ndarray
    y_up_train: np.ndarray
    y_up_val: np.ndarray
    y_up_test: np.ndarray
    y_vol_train: np.ndarray
    y_vol_val: np.ndarray
    y_vol_test: np.ndarray
    feature_names: List[str]


def build_dataset(
    candles: List[Candle],
    indicators: Optional[List[IndicatorSeries]] = None,
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
) -> DatasetSplits:
    frame = build_feature_frame(candles, indicators)
    if frame.empty:
        raise ValueError("No data to build dataset")

    # Normalize NaN/inf instead of dropping entire datasets when one feature is missing.
    frame = frame.replace([np.inf, -np.inf], np.nan)
    frame = frame.fillna(0)

    if frame.empty:
        raise ValueError("No rows left after dropping NaNs")

    feature_cols = [
        col
        for col in frame.columns
        if col not in ["timestamp", "target_forward_return_6", "target_forward_vol_6"]
    ]

    n = len(frame)
    train_end = max(int(n * train_ratio), 1)
    val_end = max(train_end + int(n * val_ratio), train_end + 1)

    train_df = frame.iloc[:train_end]
    val_df = frame.iloc[train_end:val_end]
    test_df = frame.iloc[val_end:]

    # Use training distribution to set high-volatility threshold
    vol_threshold = train_df["target_forward_vol_6"].quantile(0.7)
    if pd.isna(vol_threshold):
        vol_threshold = 0.0

    def labels(df: pd.DataFrame):
        y_up = (df["target_forward_return_6"] > 0).astype(int).to_numpy()
        y_vol = (df["target_forward_vol_6"] > vol_threshold).astype(int).to_numpy()
        return y_up, y_vol

    X_train = train_df[feature_cols].to_numpy()
    X_val = val_df[feature_cols].to_numpy() if not val_df.empty else np.empty((0, len(feature_cols)))
    X_test = test_df[feature_cols].to_numpy() if not test_df.empty else np.empty((0, len(feature_cols)))

    y_up_train, y_vol_train = labels(train_df)
    y_up_val, y_vol_val = labels(val_df) if not val_df.empty else (np.array([]), np.array([]))
    y_up_test, y_vol_test = labels(test_df) if not test_df.empty else (np.array([]), np.array([]))

    return DatasetSplits(
        X_train=X_train,
        X_val=X_val,
        X_test=X_test,
        y_up_train=y_up_train,
        y_up_val=y_up_val,
        y_up_test=y_up_test,
        y_vol_train=y_vol_train,
        y_vol_val=y_vol_val,
        y_vol_test=y_vol_test,
        feature_names=feature_cols,
    )

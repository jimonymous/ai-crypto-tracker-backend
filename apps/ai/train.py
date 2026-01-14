from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import lightgbm as lgb
from sklearn.metrics import accuracy_score, log_loss
from models import Candle, IndicatorSeries
from dataset import DatasetSplits, build_dataset
from storage import save_model
import torch
from models_dl import train_lstm, train_transformer


def _safe_name(s: str) -> str:
    return s.replace("/", "-")


def _train_classifier(
    name: str, X_train: np.ndarray, y_train: np.ndarray, X_val: np.ndarray, y_val: np.ndarray
) -> Tuple[lgb.LGBMClassifier, Dict[str, float]]:
    model = lgb.LGBMClassifier(
        n_estimators=300,
        learning_rate=0.05,
        max_depth=-1,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="binary",
        n_jobs=4,
        verbosity=-1,
    )

    eval_set = [(X_val, y_val)] if len(y_val) else None
    model.fit(
        X_train,
        y_train,
        eval_set=eval_set,
        eval_metric="binary_logloss"
    )

    metrics: Dict[str, float] = {}
    if len(y_val):
        probs = model.predict_proba(X_val)[:, 1]
        unique = set(y_val.tolist()) if hasattr(y_val, "tolist") else set(y_val)
        if len(unique) > 1:
            metrics["val_logloss"] = float(log_loss(y_val, probs, labels=[0, 1]))
        preds = (probs >= 0.5).astype(int)
        metrics["val_accuracy"] = float(accuracy_score(y_val, preds))

    return model, metrics


def train_models(
    symbol: str,
    timeframe: str,
    horizon_minutes: int,
    candles: List[Candle],
    indicators: Optional[List[IndicatorSeries]] = None,
    model_version: str = "v1",
    ) -> Dict[str, Any]:
    splits: DatasetSplits = build_dataset(candles, indicators)

    if len(splits.X_train) < 20:
        raise ValueError("Not enough samples to train models (need at least 20 rows)")

    safe_symbol = _safe_name(symbol)

    up_model, up_metrics = _train_classifier(
        "p_up", splits.X_train, splits.y_up_train, splits.X_val, splits.y_up_val
    )
    vol_model, vol_metrics = _train_classifier(
        "p_high_vol", splits.X_train, splits.y_vol_train, splits.X_val, splits.y_vol_val
    )

    up_path = save_model(
        f"{safe_symbol}_{timeframe}_p_up",
        up_model,
        metadata={
            "symbol": symbol,
            "timeframe": timeframe,
            "horizon_minutes": horizon_minutes,
            "feature_names": splits.feature_names,
        },
        version=model_version
    )
    vol_path = save_model(
        f"{safe_symbol}_{timeframe}_p_high_vol",
        vol_model,
        metadata={
            "symbol": symbol,
            "timeframe": timeframe,
            "horizon_minutes": horizon_minutes,
            "feature_names": splits.feature_names,
        },
        version=model_version
    )

    feature_importances = [
        {"feature": name, "importance": float(imp)}
        for name, imp in zip(splits.feature_names, up_model.feature_importances_)
    ]
    feature_importances = sorted(feature_importances, key=lambda x: x["importance"], reverse=True)

    metrics: Dict[str, Any] = {
        "samples": {
          "train": len(splits.X_train),
          "val": len(splits.X_val),
          "test": len(splits.X_test),
        },
        "p_up": up_metrics,
        "p_high_vol": vol_metrics,
    }

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "horizonMinutes": horizon_minutes,
    "metrics": metrics,
    "feature_importances": feature_importances,
    "model_artifacts": {"p_up": up_path, "p_high_vol": vol_path},
  }


def train_deep_models(
    symbol: str,
    timeframe: str,
    horizon_minutes: int,
    candles: List[Candle],
    indicators: Optional[List[IndicatorSeries]] = None,
    model_version: str = "v1",
):
    splits: DatasetSplits = build_dataset(candles, indicators)
    if len(splits.X_train) < 10:
        raise ValueError("Not enough samples for deep models")

    def to_sequence(X: np.ndarray):
        # Simple reshape: treat last N features as sequence length 1
        return torch.tensor(X, dtype=torch.float32).unsqueeze(1)

    X_train = to_sequence(splits.X_train)
    y_train = torch.tensor(splits.y_up_train, dtype=torch.float32)

    lstm_model = train_lstm(X_train, y_train, epochs=5)
    transformer_model = train_transformer(X_train, y_train, epochs=5)

    meta = {"symbol": symbol, "timeframe": timeframe, "horizon_minutes": horizon_minutes, "input_dim": splits.X_train.shape[1], "version": model_version}

    lstm_path = save_model(
        f"{symbol}_{timeframe}_lstm",
        lstm_model.state_dict(),
        metadata=meta,
        version=model_version
    )
    transformer_path = save_model(
        f"{symbol}_{timeframe}_transformer",
        transformer_model.state_dict(),
        metadata=meta,
        version=model_version
    )

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "horizonMinutes": horizon_minutes,
        "artifacts": {
          "lstm": lstm_path,
          "transformer": transformer_path
        }
    }

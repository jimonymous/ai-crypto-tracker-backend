from typing import Dict, List, Optional, Tuple
import logging
import numpy as np
from models import AIInferenceRequest, AIInferenceResponse, FeatureImportance, RegimeClassification
from storage import load_model, resolve_version
from features import latest_feature_row
import torch
from models_dl import LSTMModel, TransformerModel, predict_model
import math

logger = logging.getLogger(__name__)


def _safe_name(symbol: str) -> str:
    return symbol.replace("/", "-")


def _load_models(symbol: str, timeframe: str, version: Optional[str] = None):
    safe_symbol = _safe_name(symbol)
    up_name = f"{safe_symbol}_{timeframe}_p_up"
    vol_name = f"{safe_symbol}_{timeframe}_p_high_vol"
    resolved_version = resolve_version([up_name, vol_name], version)
    up_model, up_meta = load_model(up_name, version=resolved_version)
    vol_model, vol_meta = load_model(vol_name, version=resolved_version)
    return (up_model, up_meta), (vol_model, vol_meta), resolved_version


def _load_deep_model(symbol: str, timeframe: str, kind: str, version: Optional[str] = None):
    safe_symbol = _safe_name(symbol)
    name = f"{safe_symbol}_{timeframe}_{kind}"
    try:
        resolved_version = resolve_version([name], version)
    except FileNotFoundError:
        if version:
            raise
        return None

    state, meta = load_model(name, version=resolved_version)
    input_dim = meta.get("input_dim", 1) if isinstance(meta, dict) else 1
    if kind == "lstm":
        model = LSTMModel(input_dim=input_dim)
    else:
        model = TransformerModel(input_dim=input_dim)
    model.load_state_dict(state)
    model.eval()
    return model


def _vectorize(features: Dict[str, float], feature_order: List[str]) -> np.ndarray:
    return np.array([float(features.get(name, 0.0)) for name in feature_order], dtype=float).reshape(1, -1)


def _regime_from_probabilities(p_up: float, p_high_vol: float) -> RegimeClassification:
    if p_high_vol > 0.6:
        label = "high-vol"
    elif p_up > 0.55:
        label = "bull"
    elif p_up < 0.45:
        label = "bear"
    else:
        label = "neutral"
    confidence = max(abs(p_up - 0.5), abs(p_high_vol - 0.5)) * 2
    return RegimeClassification(label=label, confidence=min(confidence, 1.0))


def run_inference(payload: AIInferenceRequest) -> AIInferenceResponse:
    if not payload.candles:
        raise ValueError("Candles are required for inference")

    for c in payload.candles:
        vals = [c.open, c.high, c.low, c.close, c.volume]
        if any(v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))) for v in vals):
            raise ValueError("Input candles contain NaN or infinite values")

    as_of, feature_series = latest_feature_row(payload.candles, payload.indicators)
    if feature_series is None or as_of is None:
        raise ValueError("Unable to construct features for inference")

    feature_series = feature_series.replace([np.inf, -np.inf], np.nan)
    if feature_series.isna().all():
        raise ValueError("Features contain NaN values")
    feature_series = feature_series.fillna(0)
    features = {k: float(v) for k, v in feature_series.items()}
    p_up = 0.5
    p_high_vol = 0.0
    feature_importances: Optional[List[FeatureImportance]] = None
    model_used = "lightgbm"

    try:
        (up_model, up_meta), (vol_model, vol_meta), resolved_version = _load_models(
            payload.symbol, payload.timeframe, payload.modelVersion
        )
        feature_names = up_meta.get("feature_names") if isinstance(up_meta, dict) else list(feature_series.index)
        vector = _vectorize(features, feature_names)
        p_up = float(up_model.predict_proba(vector)[0][1])
        p_high_vol = float(vol_model.predict_proba(vector)[0][1])

        if hasattr(up_model, "feature_importances_"):
            fis = []
            for name, imp in zip(feature_names, up_model.feature_importances_):
                fis.append(FeatureImportance(feature=name, importance=float(imp)))
            feature_importances = sorted(fis, key=lambda x: x.importance, reverse=True)[:10]
    except FileNotFoundError:
        # Fall back to deep models if available
        lstm = _load_deep_model(payload.symbol, payload.timeframe, "lstm", payload.modelVersion)
        transformer = _load_deep_model(payload.symbol, payload.timeframe, "transformer", payload.modelVersion)
        input_dim = len(features)
        vec = torch.tensor(list(features.values()), dtype=torch.float32).view(1, 1, input_dim)
        if transformer:
            p_up, _ = predict_model(transformer, vec)
            model_used = "transformer"
        elif lstm:
            p_up, _ = predict_model(lstm, vec)
            model_used = "lstm"
        else:
            raise

    p_down = max(0.0, 1.0 - p_up)

    rationale = []
    if features.get("rsi14") is not None:
        rationale.append(f"RSI={features.get('rsi14'):.2f}")
    if features.get("macd_hist") is not None:
        rationale.append(f"MACD hist={features.get('macd_hist'):.4f}")
    if features.get("atr14") is not None:
        rationale.append(f"ATR14={features.get('atr14'):.4f}")

    regime = _regime_from_probabilities(p_up, p_high_vol)

    response = AIInferenceResponse(
        requestId=payload.requestId,
        symbol=payload.symbol,
        timeframe=payload.timeframe,
        horizonMinutes=payload.horizonMinutes,
        asOf=payload.asOf or as_of,
        probabilities={"pUp": p_up, "pDown": p_down, "pHighVol": p_high_vol},
        regime=regime,
        featureImportances=feature_importances,
        rationale=rationale or None,
    )

    logger.info(
        "Inference completed",
        extra={"symbol": payload.symbol, "timeframe": payload.timeframe, "p_up": p_up, "p_high_vol": p_high_vol, "model": model_used},
    )

    return response

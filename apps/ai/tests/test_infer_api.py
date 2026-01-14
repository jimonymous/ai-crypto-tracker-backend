import os
import sys
from fastapi.testclient import TestClient
import numpy as np

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app  # noqa: E402
import infer as infer_mod  # noqa: E402
from models import Candle  # noqa: E402


class DummyModel:
    def __init__(self, prob):
        self._prob = prob
        self.feature_importances_ = np.array([1.0])

    def predict_proba(self, X):
        return np.array([[1 - self._prob, self._prob]])


def make_payload():
    candles = [
        Candle(timestamp=i, open=1, high=2, low=0.5, close=1 + i * 0.1, volume=10) for i in range(10)
    ]
    return {
        "symbol": "BTC/USDT",
        "timeframe": "1h",
        "horizonMinutes": 60,
        "candles": [c.dict() for c in candles]
    }


def test_infer_success(monkeypatch):
    monkeypatch.setattr(infer_mod, "resolve_version", lambda names, requested=None: requested)
    monkeypatch.setattr(
        infer_mod,
        "load_model",
        lambda name, version=None: (DummyModel(0.8 if "p_up" in name else 0.3), {"feature_names": ["log_return"], "version": version}),
    )
    client = TestClient(app)
    res = client.post("/infer", json=make_payload())
    assert res.status_code == 200
    body = res.json()
    assert 0.0 <= body["probabilities"]["pUp"] <= 1.0
    assert body["regime"]["label"] in ["bull", "bear", "neutral", "high-vol"]


def test_infer_missing_candles():
    client = TestClient(app)
    res = client.post("/infer", json={"symbol": "BTC/USDT", "timeframe": "1h", "horizonMinutes": 60, "candles": []})
    assert res.status_code == 400


def test_infer_models_missing(monkeypatch):
    monkeypatch.setattr(infer_mod, "resolve_version", lambda names, requested=None: (_ for _ in ()).throw(FileNotFoundError()))
    client = TestClient(app)
    res = client.post("/infer", json=make_payload())
    assert res.status_code in (400, 404)


def test_infer_rejects_nan_features(monkeypatch):
    monkeypatch.setattr(infer_mod, "resolve_version", lambda names, requested=None: requested)
    monkeypatch.setattr(
        infer_mod,
        "load_model",
        lambda name, version=None: (DummyModel(0.5), {"feature_names": ["log_return"], "version": version}),
    )
    payload = make_payload()
    payload["candles"][0]["close"] = float("nan")
    client = TestClient(app)
    res = client.post("/infer", json=payload)
    assert res.status_code == 400


def test_infer_model_version(monkeypatch):
    monkeypatch.setattr(infer_mod, "resolve_version", lambda names, requested=None: "v2")
    monkeypatch.setattr(
        infer_mod,
        "load_model",
        lambda name, version=None: (DummyModel(0.6), {"feature_names": ["log_return"], "version": version}),
    )
    client = TestClient(app)
    payload = make_payload()
    payload["modelVersion"] = "v2"
    res = client.post("/infer", json=payload)
    assert res.status_code == 200
    assert res.json()["probabilities"]["pUp"] == 0.6

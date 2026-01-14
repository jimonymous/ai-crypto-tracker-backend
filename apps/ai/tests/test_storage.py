import os
import sys
from pathlib import Path

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from storage import save_model, load_model, model_exists  # noqa: E402


def test_save_and_load_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("MODEL_DIR", str(tmp_path))
    model_obj = {"a": 1}
    save_model("test-model", model_obj, {"feature_names": ["x"]})
    assert model_exists("test-model") is True
    model, meta = load_model("test-model")
    assert model == model_obj
    assert meta["feature_names"] == ["x"]


def test_load_missing_raises(tmp_path, monkeypatch):
    monkeypatch.setenv("MODEL_DIR", str(tmp_path))
    try:
        load_model("missing")
    except FileNotFoundError:
        assert True
    else:
        assert False

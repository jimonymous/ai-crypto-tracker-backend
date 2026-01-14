import os
import sys
from pathlib import Path

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from storage import save_model, load_model, model_exists, resolve_version  # noqa: E402


def test_save_load_version(tmp_path, monkeypatch):
    monkeypatch.setenv("MODEL_DIR", str(tmp_path))
    save_model("foo", {"x": 1}, metadata={"a": 1}, version="v9")
    assert model_exists("v9_foo") is True
    model, meta = load_model("foo", version="v9")
    assert model["x"] == 1
    assert meta["a"] == 1


def test_resolve_version_prefers_highest_common(tmp_path, monkeypatch):
    monkeypatch.setenv("MODEL_DIR", str(tmp_path))
    names = ["bar_p_up", "bar_p_high_vol"]
    for name in names:
        save_model(name, {"v": 1}, version="v1")
        save_model(name, {"v": 2}, version="v2")
    best = resolve_version(names)
    assert best == "v2"
    explicit = resolve_version(names, requested="v1")
    assert explicit == "v1"

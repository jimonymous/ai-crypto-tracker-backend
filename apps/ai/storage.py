import json
import os
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Set
import joblib
import re

ARTIFACT_DIR = Path(os.getenv("MODEL_DIR", "artifacts"))
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


def _paths(name: str, version: Optional[str] = None) -> Tuple[Path, Path]:
    prefix = f"{version}_" if version else ""
    return ARTIFACT_DIR / f"{prefix}{name}.pkl", ARTIFACT_DIR / f"{prefix}{name}.meta.json"


def save_model(name: str, model: Any, metadata: Optional[Dict[str, Any]] = None, version: Optional[str] = None) -> str:
    model_path, meta_path = _paths(name, version)
    joblib.dump(model, model_path)
    if metadata is not None:
        meta_path.write_text(json.dumps(metadata, indent=2))
    return str(model_path)


def load_model(name: str, version: Optional[str] = None) -> Tuple[Any, Optional[Dict[str, Any]]]:
    model_path, meta_path = _paths(name, version)
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {name}")
    model = joblib.load(model_path)
    metadata = None
    if meta_path.exists():
        metadata = json.loads(meta_path.read_text())
    return model, metadata


def model_exists(name: str) -> bool:
    model_path, _ = _paths(name)
    return model_path.exists()


def _parse_version_tag(version: str) -> Tuple[int, str]:
    """
    Return a tuple suitable for sorting versions descending. Prefers numeric suffix (e.g. v10 > v2).
    """
    m = re.match("v?(\\d+)$", version)
    if m:
        return (int(m.group(1)), version)
    return (0, version)


def list_versions(name: str) -> Set[str]:
    """
    List version prefixes that exist for the given model base name.
    Looks for files matching `<version>_{name}.pkl`.
    """
    versions: Set[str] = set()
    suffix = f"_{name}.pkl"
    for path in ARTIFACT_DIR.glob(f"*{suffix}"):
        if not path.name.endswith(suffix):
            continue
        prefix = path.name[: -len(suffix)]
        if prefix:
            versions.add(prefix)
    return versions


def resolve_version(names: list[str], requested: Optional[str] = None) -> Optional[str]:
    """
    Choose a version that exists for all provided model names.
    - If `requested` is provided, require that it exists for all names.
    - Prefer unversioned artifacts when all exist.
    - Otherwise pick the highest available common version (by numeric suffix, then lexicographic).
    Raises FileNotFoundError when no suitable artifacts are found.
    """
    if requested:
        for name in names:
            if not model_exists(name) and not model_exists(f"{requested}_{name}"):
                raise FileNotFoundError(f"Model not found: {requested}_{name}")
        return requested

    if all(model_exists(name) for name in names):
        return None

    common_versions: Optional[set[str]] = None
    for name in names:
        versions = list_versions(name)
        common_versions = versions if common_versions is None else common_versions & versions

    if not common_versions:
        raise FileNotFoundError("Models not trained yet")

    best = sorted(common_versions, key=_parse_version_tag, reverse=True)[0]
    return best

from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class Candle(BaseModel):
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: float


class IndicatorPoint(BaseModel):
    timestamp: int
    value: Any


class IndicatorSeries(BaseModel):
    name: str
    source: Optional[str] = None
    params: Optional[Dict[str, Any]] = None
    values: List[IndicatorPoint]


class RegimeClassification(BaseModel):
    label: str
    confidence: float
    rationale: Optional[List[str]] = None


class FeatureImportance(BaseModel):
    feature: str
    importance: float


class AIInferenceRequest(BaseModel):
    symbol: str
    timeframe: str
    horizonMinutes: int
    modelVersion: Optional[str] = None
    asOf: Optional[int] = None
    candles: Optional[List[Candle]] = None
    indicators: Optional[List[IndicatorSeries]] = None
    requestId: Optional[str] = None


class AIInferenceResponse(BaseModel):
    requestId: Optional[str] = None
    symbol: str
    timeframe: str
    horizonMinutes: int
    asOf: int
    probabilities: Dict[str, float]
    regime: Optional[RegimeClassification] = None
    featureImportances: Optional[List[FeatureImportance]] = None
    rationale: Optional[List[str]] = None


class TrainRequest(BaseModel):
    symbol: str
    timeframe: str
    horizonMinutes: int
    modelVersion: Optional[str] = None
    candles: List[Candle]
    indicators: Optional[List[IndicatorSeries]] = None
    test_size: float = 0.2
    requestId: Optional[str] = None


class TrainResponse(BaseModel):
    symbol: str
    timeframe: str
    horizonMinutes: int
    requestId: Optional[str] = None
    metrics: Dict[str, Any]
    featureImportances: List[FeatureImportance]
    modelArtifacts: Dict[str, str]


class ChatRequest(BaseModel):
    message: str
    system: Optional[str] = None
    model: Optional[str] = None
    contexts: Optional[List[Dict[str, Any]]] = None


class ChatResponse(BaseModel):
    output: str
    model: str
    requestId: Optional[str] = None

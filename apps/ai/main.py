import logging
import os
import json
from typing import Any, Dict
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import ORJSONResponse
from models import AIInferenceRequest, AIInferenceResponse, TrainRequest, TrainResponse, ChatRequest, ChatResponse
from train import train_models, train_deep_models
from infer import run_inference
from backtest import compute_backtest
from openai import OpenAI
from dotenv import load_dotenv


load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("ai-service")

app = FastAPI(
    title="Crypto Tracker AI Service",
    version="0.1.0",
    default_response_class=ORJSONResponse,
)

AI_AUTH_TOKEN = os.getenv("AI_AUTH_TOKEN")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
DEFAULT_OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5-nano")
DEFAULT_SYSTEM_PROMPT = os.getenv(
    "CHAT_SYSTEM_PROMPT",
    "You are a helpful, concise crypto assistant. Use provided contexts (markets, indicators, AI predictions, arb opportunities) as ground truth. Do not invent data."
)
openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None


def require_ai_auth(authorization: str = Header(default=None)) -> None:
    if AI_AUTH_TOKEN is None:
        return
    expected = f"Bearer {AI_AUTH_TOKEN}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/train", response_model=TrainResponse)
def train(request: TrainRequest, _auth=Depends(require_ai_auth)):
    try:
        result: Dict[str, Any] = train_models(
            symbol=request.symbol,
            timeframe=request.timeframe,
            horizon_minutes=request.horizonMinutes,
            candles=request.candles,
            indicators=request.indicators,
        )
        logger.info(
            "Training completed",
            extra={"symbol": request.symbol, "timeframe": request.timeframe},
        )
        return TrainResponse(
            symbol=request.symbol,
            timeframe=request.timeframe,
            horizonMinutes=request.horizonMinutes,
            requestId=request.requestId,
            metrics=result["metrics"],
            featureImportances=[
                {"feature": fi["feature"], "importance": fi["importance"]}
                for fi in result["feature_importances"]
            ],
            modelArtifacts=result["model_artifacts"],
        )
    except Exception as exc:
        logger.exception("Training failed")
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/infer", response_model=AIInferenceResponse)
def infer(request: AIInferenceRequest, _auth=Depends(require_ai_auth)):
    try:
        response = run_inference(request)
        return response
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("Inference failed")
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/backtest")
def backtest(request: TrainRequest, _auth=Depends(require_ai_auth)):
    try:
        metrics = compute_backtest(request.candles)
        return {"symbol": request.symbol, "timeframe": request.timeframe, "metrics": metrics}
    except Exception as exc:
        logger.exception("Backtest failed")
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/train/deep")
def train_deep(request: TrainRequest, _auth=Depends(require_ai_auth)):
    try:
        result = train_deep_models(
            symbol=request.symbol,
            timeframe=request.timeframe,
            horizon_minutes=request.horizonMinutes,
            candles=request.candles,
            indicators=request.indicators,
        )
        logger.info("Deep models trained", extra={"symbol": request.symbol, "timeframe": request.timeframe})
        return result
    except Exception as exc:
        logger.exception("Deep training failed")
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest, _auth=Depends(require_ai_auth)):
    if openai_client is None:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")
    model = req.model or DEFAULT_OPENAI_MODEL
    try:
        # Use Responses API; allow optional system prompt
        input_payload: Any
        system_prompt = req.system or DEFAULT_SYSTEM_PROMPT
        ctx_text = ""
        if req.contexts:
            try:
                ctx_text = "\n\nContexts:\n" + json.dumps(req.contexts, ensure_ascii=False, default=str)
            except Exception:
                ctx_text = "\n\nContexts:\n(unable to serialize contexts)"

        input_payload = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"{req.message}{ctx_text}"}
        ]

        resp = openai_client.responses.create(model=model, input=input_payload)
        text = getattr(resp, "output_text", None)
        if not text and hasattr(resp, "output"):
            # Fallback extraction if output_text is missing
            try:
                outputs = resp.output or []
                if outputs and outputs[0].content:
                    text = outputs[0].content[0].text
            except Exception:
                text = None
        if not text:
            raise RuntimeError("Empty response from model")
        return ChatResponse(output=text, model=model)
    except Exception as exc:
        logger.exception("Chat failed")
        raise HTTPException(status_code=400, detail=str(exc))

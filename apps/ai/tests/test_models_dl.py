import os
import sys
import torch

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from models_dl import LSTMModel, TransformerModel, predict_model  # noqa: E402


def test_lstm_forward_shape():
    model = LSTMModel(input_dim=3)
    x = torch.randn(2, 5, 3)
    out = model(x)
    assert out.shape[0] == 2
    assert out.shape[1] == 1


def test_transformer_forward_shape():
    model = TransformerModel(input_dim=3, hidden_dim=8, num_heads=2, num_layers=1)
    x = torch.randn(2, 5, 3)
    out = model(x)
    assert out.shape[0] == 2
    assert out.shape[1] == 1


def test_predict_model_outputs_probs():
    model = LSTMModel(input_dim=2)
    x = torch.randn(2, 4, 2)
    p_up, p_down = predict_model(model, x)
    assert 0.0 <= p_up <= 1.0
    assert 0.0 <= p_down <= 1.0
    assert abs((p_up + p_down) - 1.0) < 1e-6

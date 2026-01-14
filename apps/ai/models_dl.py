from typing import Tuple
import torch
import torch.nn as nn


class LSTMModel(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int = 32, num_layers: int = 1):
        super().__init__()
        self.lstm = nn.LSTM(input_dim, hidden_dim, num_layers=num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_dim, 1)

    def forward(self, x):
        out, _ = self.lstm(x)
        out = out[:, -1, :]
        out = self.fc(out)
        return torch.sigmoid(out)


class TransformerModel(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int = 64, num_heads: int = 4, num_layers: int = 2):
        super().__init__()
        encoder_layer = nn.TransformerEncoderLayer(d_model=hidden_dim, nhead=num_heads, batch_first=True)
        self.input_proj = nn.Linear(input_dim, hidden_dim)
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.fc = nn.Linear(hidden_dim, 1)

    def forward(self, x):
        x = self.input_proj(x)
        out = self.transformer(x)
        out = out[:, -1, :]
        out = self.fc(out)
        return torch.sigmoid(out)


def train_lstm(X: torch.Tensor, y: torch.Tensor, epochs: int = 20, lr: float = 1e-3) -> LSTMModel:
    model = LSTMModel(X.shape[-1])
    criterion = nn.BCELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    for _ in range(epochs):
        optimizer.zero_grad()
        preds = model(X).squeeze()
        loss = criterion(preds, y)
        loss.backward()
        optimizer.step()
    return model


def train_transformer(X: torch.Tensor, y: torch.Tensor, epochs: int = 10, lr: float = 1e-3) -> TransformerModel:
    model = TransformerModel(X.shape[-1])
    criterion = nn.BCELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    for _ in range(epochs):
        optimizer.zero_grad()
        preds = model(X).squeeze()
        loss = criterion(preds, y)
        loss.backward()
        optimizer.step()
    return model


def predict_model(model: nn.Module, X: torch.Tensor) -> Tuple[float, float]:
    model.eval()
    with torch.no_grad():
        probs = model(X).squeeze()
        p_up = float(probs[-1])
        p_down = 1.0 - p_up
        return p_up, p_down

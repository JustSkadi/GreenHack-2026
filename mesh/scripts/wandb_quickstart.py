"""Smoke test — weryfikuje połączenie z projektem GreenHackMesh na W&B."""

import random
from pathlib import Path

import wandb
import yaml

CONF = Path(__file__).resolve().parent.parent / "conf"

with (CONF / "logging/default.yaml").open() as f:
    logging_cfg = yaml.safe_load(f)
with (CONF / "model/default.yaml").open() as f:
    model_cfg = yaml.safe_load(f)
with (CONF / "env/default.yaml").open() as f:
    env_cfg = yaml.safe_load(f)

run = wandb.init(
    entity=logging_cfg["entity"],
    project=logging_cfg["project"],
    name=f"{logging_cfg['experiment_name']}_smoke_test",
    config={
        "architecture": "RouterMLP",
        "env": env_cfg,
        "model": model_cfg,
    },
)

episodes = 10
offset = random.random() / 5
for episode in range(episodes):
    reward = -5 + episode * 0.8 + random.random() - offset
    loss = 2 ** (-episode / 3) + random.random() / (episode + 1) + offset
    run.log({"reward": reward, "loss": loss, "episode": episode})

run.finish()

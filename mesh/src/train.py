import torch
import torch.optim as optim
import wandb
import hydra
from omegaconf import DictConfig, OmegaConf
from env.mesh_env import MeshEnv
from agent.net import RouterMLP


@hydra.main(version_base="1.3", config_path="../conf", config_name="config")
def train(cfg: DictConfig):
    wandb.init(
        project=cfg.logging.project,
        entity=cfg.logging.entity,
        mode=cfg.logging.mode,
        name=cfg.logging.experiment_name,
        config=OmegaConf.to_container(cfg, resolve=True),
    )

    env = MeshEnv(
        num_nodes=cfg.env.num_nodes,
        radius=cfg.env.radius,
        max_hops=cfg.env.max_hops,
        max_degree=cfg.env.max_degree,
        target_degree=cfg.env.target_degree,
        edge_drop_prob=cfg.env.edge_drop_prob,
        edge_add_prob=cfg.env.edge_add_prob,
    )
    net = RouterMLP(input_dim=cfg.model.input_dim, hidden_dim=cfg.model.hidden_dim)
    optimizer = optim.Adam(net.parameters(), lr=cfg.model.lr)

    reward_ema = None
    success_ema = None
    ema_alpha = cfg.logging.reward_ema_alpha

    for ep in range(cfg.model.episodes):
        state, neighbors = env.reset()
        total_reward = 0.0
        episode_losses = []
        episode_hops = 0

        while True:
            if state is None:
                break

            with torch.no_grad():
                q_values = net(state)

            action = torch.argmax(q_values).item()
            next_state, next_neighbors, reward, done = env.step(action, neighbors)
            total_reward += reward
            episode_hops += 1

            q_val = net(state)[action]
            target = torch.tensor([reward], dtype=torch.float32)
            if not done and next_state is not None:
                with torch.no_grad():
                    target += cfg.model.gamma * torch.max(net(next_state))

            loss = torch.nn.functional.mse_loss(q_val, target)
            episode_losses.append(loss.item())
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            state, neighbors = next_state, next_neighbors
            if done:
                break

        success = 1.0 if env.reached_destination else 0.0
        avg_loss = sum(episode_losses) / len(episode_losses) if episode_losses else 0.0
        reward_ema = total_reward if reward_ema is None else (
            ema_alpha * total_reward + (1 - ema_alpha) * reward_ema
        )
        success_ema = success if success_ema is None else (
            ema_alpha * success + (1 - ema_alpha) * success_ema
        )

        wandb.log(
            {
                "reward": total_reward,
                "reward_ema": reward_ema,
                "loss": avg_loss,
                "success": success,
                "success_rate_ema": success_ema,
                "hops": episode_hops,
                "episode": ep,
            }
        )
        if ep % 200 == 0:
            print(
                f"Epizod {ep}/{cfg.model.episodes} | "
                f"Wynik: {total_reward:.2f} | EMA: {reward_ema:.2f} | "
                f"Sukces: {success:.0f}"
            )

    net.eval()
    torch.save(net.state_dict(), cfg.model.save_name)
    dummy_input = torch.randn(1, cfg.model.input_dim)
    torch.onnx.export(net, dummy_input, cfg.model.onnx_name)
    wandb.save(cfg.model.onnx_name)
    wandb.finish()


if __name__ == "__main__":
    train()

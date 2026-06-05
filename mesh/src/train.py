import torch
import torch.optim as optim
import wandb
import hydra
from omegaconf import DictConfig, OmegaConf
from env.mesh_env import MeshEnv
from agent.net import RouterMLP

@hydra.main(version_base="1.3", config_path="../conf", config_name="config")
def train(cfg: DictConfig):
    # W&B odpala się z parametrami z conf/logging/default.yaml
    wandb.init(
        project=cfg.logging.project,
        entity=cfg.logging.entity,
        mode=cfg.logging.mode,
        name=cfg.logging.experiment_name,
        config=OmegaConf.to_container(cfg, resolve=True)
    )
    
    env = MeshEnv(num_nodes=cfg.env.num_nodes, radius=cfg.env.radius, max_hops=cfg.env.max_hops)
    net = RouterMLP(input_dim=cfg.model.input_dim, hidden_dim=cfg.model.hidden_dim)
    optimizer = optim.Adam(net.parameters(), lr=cfg.model.lr)
    
    for ep in range(cfg.model.episodes):
        state, neighbors = env.reset()
        total_reward = 0
        
        while True:
            if state is None: break
            
            with torch.no_grad():
                q_values = net(state)
            
            action = torch.argmax(q_values).item()
            next_state, next_neighbors, reward, done = env.step(action, neighbors)
            total_reward += reward
            
            q_val = net(state)[action]
            target = torch.tensor([reward], dtype=torch.float32)
            if not done and next_state is not None:
                with torch.no_grad():
                    target += cfg.model.gamma * torch.max(net(next_state))
            
            loss = torch.nn.functional.mse_loss(q_val, target)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            
            state, neighbors = next_state, next_neighbors
            if done: break
            
        wandb.log({"reward": total_reward, "loss": loss.item(), "episode": ep})
        if ep % 200 == 0:
            print(f"Epizod {ep}/{cfg.model.episodes} | Wynik: {total_reward:.2f}")

    # Zapis wag w dynamicznym folderze wygenerowanym przez Hydrę (np. outputs/baseline_mlp/2026-06-05_16-03-12/)
    torch.save(net.state_dict(), cfg.model.save_name)
    dummy_input = torch.randn(1, cfg.model.input_dim)
    torch.onnx.export(net, dummy_input, cfg.model.onnx_name)
    wandb.save(cfg.model.onnx_name)
    wandb.finish()

if __name__ == "__main__":
    train()

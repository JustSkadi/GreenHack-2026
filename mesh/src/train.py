import random

import torch
import torch.nn.functional as F
import torch.optim as optim
import wandb
import hydra
from omegaconf import DictConfig, OmegaConf
from env.mesh_env import MeshEnv
from agent.net import TopologyAgent
from router import greedy_action


def _apply_curriculum(env: MeshEnv, cfg: DictConfig, episode: int) -> str:
    static_end = cfg.model.curriculum_static_episodes
    easy_end = cfg.model.curriculum_easy_irl_episodes

    if episode < static_end:
        env.irl_mode = False
        return "static"
    if episode < easy_end:
        env.irl_mode = True
        env.mobility_step = cfg.env.mobility_step * 0.5
        env.node_drop_prob = 0.0
        return "irl_easy"
    env.irl_mode = True
    env.mobility_step = cfg.env.mobility_step
    env.node_drop_prob = cfg.env.node_drop_prob
    return "irl_full"


def _eval_delivery(net: TopologyAgent, env_cfg: DictConfig, irl: bool, episodes: int = 80) -> float:
    env = MeshEnv(
        num_nodes=env_cfg.num_nodes,
        radius=env_cfg.radius,
        max_hops=env_cfg.max_hops,
        irl_mode=irl,
        mobility_step=env_cfg.mobility_step,
        node_drop_prob=env_cfg.node_drop_prob if irl else 0.0,
        max_store_steps=env_cfg.max_store_steps,
        max_reconnect_attempts=env_cfg.max_reconnect_attempts,
        gossip_warmup_steps=env_cfg.gossip_warmup_steps,
    )
    net.eval()
    delivered = 0
    for _ in range(episodes):
        state, neighbors = env.reset()
        while True:
            if state is None:
                if env.mission_success:
                    break
                state, neighbors, _, done = env._handle_disconnect(0.0)
                if done:
                    break
                continue
            with torch.no_grad():
                action = torch.argmax(net(state)).item()
            state, neighbors, _, done = env.step(action, neighbors)
            if done:
                break
        if env.delivered:
            delivered += 1
    return delivered / episodes


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
        irl_mode=cfg.env.irl_mode,
        mobility_step=cfg.env.mobility_step,
        node_drop_prob=cfg.env.node_drop_prob,
        max_store_steps=cfg.env.max_store_steps,
        max_reconnect_attempts=cfg.env.max_reconnect_attempts,
        gossip_warmup_steps=cfg.env.gossip_warmup_steps,
    )
    net = TopologyAgent(input_dim=cfg.model.input_dim, hidden_dim=cfg.model.hidden_dim)
    optimizer = optim.Adam(net.parameters(), lr=cfg.model.lr)

    delivered_ema = None
    mission_ema = None
    best_score = -1.0
    best_state = None

    for ep in range(cfg.model.episodes):
        phase = _apply_curriculum(env, cfg, ep)
        state, neighbors = env.reset()
        total_reward = 0.0
        episode_losses = []

        while True:
            if state is None:
                if env.mission_success:
                    break
                state, neighbors, reward, done = env._handle_disconnect(0.0)
                total_reward += reward
                if done:
                    break
                continue

            expert = greedy_action(env, neighbors)
            logits = net(state).squeeze(-1)
            loss = F.cross_entropy(
                logits.unsqueeze(0),
                torch.tensor([expert], dtype=torch.long),
            )
            episode_losses.append(loss.item())
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            explore = random.random() < cfg.model.explore_rate
            action = random.randrange(len(neighbors)) if explore else expert

            next_state, next_neighbors, reward, done = env.step(action, neighbors)
            total_reward += reward
            state, neighbors = next_state, next_neighbors
            if done:
                break

        mission = float(env.mission_success)
        delivered_flag = float(env.delivered)
        mission_ema = mission if mission_ema is None else 0.95 * mission_ema + 0.05 * mission
        delivered_ema = (
            delivered_flag
            if delivered_ema is None
            else 0.95 * delivered_ema + 0.05 * delivered_flag
        )

        score = delivered_ema * 0.5 + mission_ema * 0.5
        if ep % 100 == 0 or ep == cfg.model.episodes - 1:
            static_rate = _eval_delivery(net, cfg.env, irl=False, episodes=40)
            irl_rate = _eval_delivery(net, cfg.env, irl=True, episodes=30)
            eval_score = static_rate * 0.5 + irl_rate * 0.5
            wandb.log({"eval_static": static_rate, "eval_irl": irl_rate, "eval_score": eval_score})
            if eval_score > best_score:
                best_score = eval_score
                best_state = {k: v.cpu().clone() for k, v in net.state_dict().items()}
                print(f"  → new best eval: static={static_rate:.0%} irl={irl_rate:.0%}")

        wandb.log(
            {
                "reward": total_reward,
                "loss": sum(episode_losses) / len(episode_losses) if episode_losses else 0,
                "delivered": int(env.delivered),
                "delivered_ema": delivered_ema,
                "impossible": int(env.impossible),
                "mission_success": int(env.mission_success),
                "mission_success_ema": mission_ema,
                "hops": len(env.path) - 1,
                "store_steps": env.store_steps,
                "reconnect_attempts": env.reconnect_attempts,
                "topology_events": env.topology_events,
                "repeaters_proposed": len(env.repeater_sites),
                "curriculum_phase": {"static": 0, "irl_easy": 1, "irl_full": 2}[phase],
                "episode": ep,
            }
        )

        if ep % 200 == 0:
            outcome = (
                "DELIVERED"
                if env.delivered
                else ("IMPOSSIBLE" if env.impossible else "FAIL")
            )
            print(
                f"Ep {ep}/{cfg.model.episodes} | {phase} | {outcome} | "
                f"delivered_ema={delivered_ema:.2f} | mission_ema={mission_ema:.2f} | "
                f"hops={len(env.path)-1}"
            )

    if best_state is not None:
        net.load_state_dict(best_state)
    net.eval()

    static_rate = _eval_delivery(net, cfg.env, irl=False, episodes=100)
    irl_rate = _eval_delivery(net, cfg.env, irl=True, episodes=80)
    print(f"Final eval: static={static_rate:.0%} irl={irl_rate:.0%}")

    torch.save(net.state_dict(), cfg.model.save_name)
    dummy_input = torch.randn(1, cfg.model.input_dim)
    torch.onnx.export(net, dummy_input, cfg.model.onnx_name)
    wandb.log({"eval_static": static_rate, "eval_irl": irl_rate})
    wandb.save(cfg.model.onnx_name)
    wandb.finish()


if __name__ == "__main__":
    train()

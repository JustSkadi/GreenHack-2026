import argparse

import matplotlib.animation as animation
import matplotlib.pyplot as plt
import networkx as nx
import numpy as np
import torch

from agent.net import RouterMLP
from env.mesh_env import MeshEnv

FRAMES_PER_HOP = 15
FRAMES_PER_RESET = 20
EDGE_FADE_SPEED = 0.12


def _edge_key(u, v):
    return (u, v) if u < v else (v, u)


class EdgeTracker:
    def __init__(self):
        self.alpha = {}

    def sync(self, edges, fade_speed=EDGE_FADE_SPEED):
        target = {_edge_key(u, v): 1.0 for u, v in edges}
        for key in list(self.alpha):
            target.setdefault(key, 0.0)

        for key, goal in target.items():
            current = self.alpha.get(key, 0.0)
            if current < goal:
                self.alpha[key] = min(goal, current + fade_speed)
            elif current > goal:
                self.alpha[key] = max(goal, current - fade_speed)

        self.alpha = {k: v for k, v in self.alpha.items() if v > 0.01}


def render():
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=str, required=True)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--num-nodes", type=int, default=80)
    parser.add_argument("--frames", type=int, default=600)
    args = parser.parse_args()

    net = RouterMLP(input_dim=5, hidden_dim=64)
    net.load_state_dict(torch.load(args.weights, weights_only=True))
    net.eval()

    env = MeshEnv(num_nodes=args.num_nodes)
    state, neighbors = env.reset()

    fig, ax = plt.subplots(figsize=(10, 10))
    fig.patch.set_facecolor("#0d1117")

    pos = nx.get_node_attributes(env.G, "pos")
    edge_tracker = EdgeTracker()
    edge_tracker.sync(env.G.edges(), fade_speed=1.0)

    hop_from = env.current_node
    hop_to = env.current_node
    hop_t = 1.0
    reset_t = 1.0
    episode_done = False

    def node_color(n):
        if n == 0:
            return "#ff4d4d"
        if n == env.current_node and hop_t >= 0.99:
            return "#3dff8a"
        return "#4a5568"

    def agent_xy():
        if hop_from == hop_to or hop_t >= 1.0:
            return pos[env.current_node]
        x1, y1 = pos[hop_from]
        x2, y2 = pos[hop_to]
        t = hop_t * hop_t * (3 - 2 * hop_t)
        return x1 + (x2 - x1) * t, y1 + (y2 - y1) * t

    def draw_graph():
        ax.clear()
        ax.set_facecolor("#0d1117")
        ax.axis("off")

        static_nodes = [n for n in env.G.nodes if n != env.current_node or hop_t < 0.99]
        if static_nodes:
            nx.draw_networkx_nodes(
                env.G,
                pos,
                nodelist=static_nodes,
                node_color=[node_color(n) for n in static_nodes],
                node_size=70,
                ax=ax,
            )

        for (u, v), alpha in edge_tracker.alpha.items():
            if alpha <= 0.01:
                continue
            x1, y1 = pos[u]
            x2, y2 = pos[v]
            ax.plot(
                [x1, x2],
                [y1, y2],
                color="#6b7a99",
                alpha=alpha * 0.7,
                linewidth=1.2,
                zorder=1,
            )

        ax.scatter(
            *agent_xy(),
            s=180,
            c="#3dff8a",
            edgecolors="#ffffff",
            linewidths=1.0,
            zorder=5,
        )

        avg_deg = np.mean([d for _, d in env.G.degree()])
        ax.set_title(
            f"Mesh Routing | hops: {env.hops} | priority: {env.priority} | "
            f"avg degree: {avg_deg:.1f}",
            color="#e6edf3",
            fontsize=13,
            pad=12,
        )

    def begin_reset():
        nonlocal state, neighbors, pos, hop_from, hop_to, hop_t, reset_t, episode_done
        reset_t = 0.0
        state, neighbors = env.reset()
        pos = nx.get_node_attributes(env.G, "pos")
        hop_from = env.current_node
        hop_to = env.current_node
        hop_t = 1.0
        episode_done = False
        edge_tracker.sync(env.G.edges(), fade_speed=1.0)

    def begin_hop():
        nonlocal hop_from, hop_to, hop_t, state, neighbors, episode_done
        if state is None or not neighbors:
            begin_reset()
            return

        with torch.no_grad():
            action = torch.argmax(net(state)).item()

        hop_from = env.current_node
        hop_to = neighbors[action]
        hop_t = 0.0

        state, neighbors, _reward, done = env.step(action, neighbors)
        edge_tracker.sync(env.G.edges())
        episode_done = done

    def update(_frame):
        nonlocal hop_t, reset_t

        if reset_t < 1.0:
            reset_t = min(1.0, reset_t + 1.0 / FRAMES_PER_RESET)
            edge_tracker.sync(env.G.edges())
            draw_graph()
            return

        if hop_t < 1.0:
            hop_t = min(1.0, hop_t + 1.0 / FRAMES_PER_HOP)
            edge_tracker.sync(env.G.edges())
            draw_graph()
            return

        if episode_done:
            begin_reset()
            draw_graph()
            return

        begin_hop()
        draw_graph()

    interval = max(1, 1000 // args.fps)
    anim = animation.FuncAnimation(
        fig, update, frames=args.frames, interval=interval, blit=False
    )
    plt.tight_layout()
    plt.show()
    return anim


if __name__ == "__main__":
    render()

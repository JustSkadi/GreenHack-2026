import argparse

import matplotlib.animation as animation
import matplotlib.pyplot as plt
import networkx as nx
import torch

from agent.net import TopologyAgent
from env.mesh_env import MeshEnv
from router import greedy_action, rl_action

FRAMES_PER_HOP = 12


def render():
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=str, default=None)
    parser.add_argument("--source", type=int, default=None)
    parser.add_argument("--dest", type=int, default=None)
    parser.add_argument("--fps", type=int, default=20)
    parser.add_argument("--frames", type=int, default=400)
    parser.add_argument(
        "--router",
        choices=["greedy", "rl", "auto"],
        default="greedy",
        help="greedy=Dijkstra (pewne dostarczenie), rl=model, auto=rl z fallback",
    )
    parser.add_argument("--irl", action="store_true", help="Dynamiczny graf (ruch węzłów)")
    args = parser.parse_args()

    net = None
    if args.weights and args.router in ("rl", "auto"):
        net = TopologyAgent(input_dim=8, hidden_dim=64)
        net.load_state_dict(torch.load(args.weights, weights_only=True))
        net.eval()

    env = MeshEnv(irl_mode=args.irl)
    state, neighbors = env.reset(source=args.source, destination=args.dest)

    hop_from = env.source
    hop_to = env.source
    hop_t = 1.0
    pending_step = True
    status = "routing"
    use_greedy = args.router == "greedy"

    fig, ax = plt.subplots(figsize=(9, 9))
    fig.patch.set_facecolor("#0d1117")

    def pick_action():
        nonlocal use_greedy
        if use_greedy or net is None:
            return greedy_action(env, neighbors)
        action = rl_action(net, state)
        if args.router == "auto":
            try:
                rl_next = neighbors[action]
                rl_dist = nx.shortest_path_length(env.G, rl_next, env.destination)
                greedy = greedy_action(env, neighbors)
                gr_dist = nx.shortest_path_length(
                    env.G, neighbors[greedy], env.destination
                )
                if rl_dist > gr_dist:
                    return greedy
            except nx.NetworkXNoPath:
                return greedy_action(env, neighbors)
        return action

    def packet_xy(pos):
        if hop_from == hop_to or hop_t >= 1.0:
            return pos[env.current_node]
        x1, y1 = pos[hop_from]
        x2, y2 = pos[hop_to]
        t = hop_t * hop_t * (3 - 2 * hop_t)
        return x1 + (x2 - x1) * t, y1 + (y2 - y1) * t

    def draw():
        pos = nx.get_node_attributes(env.G, "pos")
        ax.clear()
        ax.set_facecolor("#0d1117")
        ax.axis("off")

        node_colors = []
        for n in env.G.nodes:
            if n == env.source:
                node_colors.append("#3b82f6")
            elif n == env.destination:
                node_colors.append("#ef4444")
            else:
                node_colors.append("#4b5563")

        nx.draw_networkx_nodes(env.G, pos, node_color=node_colors, node_size=80, ax=ax)
        nx.draw_networkx_edges(env.G, pos, edge_color="#374151", alpha=0.6, width=1.2, ax=ax)

        for site in env.repeater_sites:
            rx, ry = site["pos"]
            ax.scatter(rx, ry, s=400, marker="*", c="#f59e0b", edgecolors="#fff", zorder=6)

        if len(env.path) > 1:
            trail_x = [pos[n][0] for n in env.path if n in pos]
            trail_y = [pos[n][1] for n in env.path if n in pos]
            ax.plot(trail_x, trail_y, color="#22c55e", alpha=0.5, linewidth=2, zorder=3)

        px, py = packet_xy(pos)
        ax.scatter(px, py, s=220, c="#22c55e", edgecolors="#ffffff", linewidths=1.5, zorder=5)

        router_name = "greedy" if use_greedy else args.router
        ax.set_title(
            f"X→Y {env.source}→{env.destination} | {status} | router={router_name}",
            color="#e5e7eb",
            fontsize=11,
            pad=10,
        )

    def update(_frame):
        nonlocal state, neighbors, hop_from, hop_to, hop_t, pending_step, status

        if hop_t < 1.0:
            hop_t = min(1.0, hop_t + 1.0 / FRAMES_PER_HOP)
            draw()
            return

        if env.delivered:
            status = "dostarczono ✓"
            draw()
            return

        if env.impossible:
            status = "IMPOSSIBLE — repeater ★"
            draw()
            return

        if pending_step:
            if state is None or not neighbors:
                state, neighbors, _r, done = env._handle_disconnect(0.0)
                if env.impossible:
                    status = "IMPOSSIBLE — repeater ★"
                elif not neighbors:
                    status = "brak sąsiadów"
                draw()
                return

            action = pick_action()
            hop_from = env.current_node
            hop_to = neighbors[action]
            hop_t = 0.0
            pending_step = False

            state, neighbors, _reward, done = env.step(action, neighbors)
            if env.delivered:
                status = "dostarczono ✓"
            elif env.impossible:
                status = "IMPOSSIBLE — repeater ★"
            elif done:
                status = "timeout"
            draw()
            return

        pending_step = True
        draw()

    draw()
    interval = max(1, 1000 // args.fps)
    anim = animation.FuncAnimation(fig, update, frames=args.frames, interval=interval, blit=False)
    plt.tight_layout()
    plt.show()
    return anim


if __name__ == "__main__":
    render()

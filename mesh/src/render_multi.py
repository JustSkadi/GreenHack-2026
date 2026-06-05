import argparse
import random
from dataclasses import dataclass, field

import matplotlib.animation as animation
import matplotlib.colors as mcolors
import matplotlib.pyplot as plt
import networkx as nx
import numpy as np
import torch

from agent.net import TopologyAgent
from env.multi_mesh_env import MultiMeshEnv, Route
from router import greedy_to, rl_action


def _smoothstep(t: float) -> float:
    return t * t * (3 - 2 * t)


def _norm_edge(u: int, v: int) -> tuple[int, int]:
    return (min(u, v), max(u, v))


def _lerp_color(hex_a: str, hex_b: str, t: float) -> tuple[float, float, float]:
    a = mcolors.to_rgb(hex_a)
    b = mcolors.to_rgb(hex_b)
    return tuple(x + (y - x) * t for x, y in zip(a, b))


EDGE_NORMAL = "#374151"
EDGE_NEW = "#3b82f6"
EDGE_GHOST = "#ef4444"
NEW_EDGE_FRAMES = 50
GHOST_FRAMES = 50


@dataclass
class EdgeGhost:
    line: object
    frames_left: int = GHOST_FRAMES


@dataclass
class ActiveEdge:
    line: object
    new_frames: int = 0


@dataclass
class EdgeTracker:
    active: dict[tuple[int, int], ActiveEdge] = field(default_factory=dict)
    ghosts: list[EdgeGhost] = field(default_factory=list)
    bootstrapped: bool = False

    def sync(self, ax, G, pos: dict):
        current = {_norm_edge(u, v) for u, v in G.edges()}
        known = set(self.active)
        first_frame = not self.bootstrapped
        if first_frame:
            self.bootstrapped = True

        for edge in known - current:
            active = self.active.pop(edge)
            u, v = edge
            if u in pos and v in pos:
                active.line.set_color(EDGE_GHOST)
                active.line.set_alpha(0.85)
                active.line.set_linewidth(2.0)
                active.line.set_zorder(0)
                self.ghosts.append(EdgeGhost(line=active.line))

        for edge in current - known:
            u, v = edge
            x1, y1 = pos[u]
            x2, y2 = pos[v]
            (line,) = ax.plot(
                [x1, x2], [y1, y2],
                color=EDGE_NEW if not first_frame else EDGE_NORMAL,
                alpha=0.95 if not first_frame else 0.5,
                linewidth=2.2 if not first_frame else 1.0,
                zorder=2 if not first_frame else 1,
            )
            self.active[edge] = ActiveEdge(
                line=line, new_frames=0 if first_frame else NEW_EDGE_FRAMES
            )

        for edge in current & known:
            u, v = edge
            active = self.active[edge]
            if u in pos and v in pos:
                active.line.set_data([pos[u][0], pos[v][0]], [pos[u][1], pos[v][1]])
            if active.new_frames > 0:
                active.new_frames -= 1
                t = 1.0 - active.new_frames / NEW_EDGE_FRAMES
                active.line.set_color(_lerp_color(EDGE_NEW, EDGE_NORMAL, t))
                active.line.set_alpha(0.5 + 0.45 * (1.0 - t))
                active.line.set_linewidth(2.2 - 1.0 * t)
                active.line.set_zorder(2)
            else:
                active.line.set_color(EDGE_NORMAL)
                active.line.set_alpha(0.5)
                active.line.set_linewidth(1.0)
                active.line.set_zorder(1)

        alive = []
        for ghost in self.ghosts:
            ghost.frames_left -= 1
            fade = ghost.frames_left / GHOST_FRAMES
            ghost.line.set_alpha(max(0.0, fade * 0.85))
            if ghost.frames_left > 0:
                alive.append(ghost)
            else:
                ghost.line.remove()
        self.ghosts = alive

    def clear(self):
        for active in self.active.values():
            active.line.remove()
        self.active.clear()
        for ghost in self.ghosts:
            ghost.line.remove()
        self.ghosts.clear()


def _parse_routes(spec: str) -> list[tuple[str, int, int]]:
    default_labels = ["X→Y", "A→B", "M→N", "P→Q", "R→S", "T→U"]
    routes = []
    for i, part in enumerate(spec.split(",")):
        part = part.strip()
        if not part:
            continue
        if ":" not in part:
            raise ValueError(f"Nieprawidłowa trasa: {part!r} (oczekiwane np. 5:42)")
        left, right = part.split(":", 1)
        src, dst = int(left), int(right)
        label = default_labels[i] if i < len(default_labels) else f"{src}→{dst}"
        routes.append((label, src, dst))
    if not routes:
        raise ValueError("Podaj co najmniej jedną trasę, np. --routes 5:42,8:33,12:47")
    return routes


@dataclass
class PacketAnim:
    route: Route
    hop_from: int
    hop_to: int
    hop_t: float = 1.0


def render_multi():
    parser = argparse.ArgumentParser(
        description="Wiele wiadomości jednocześnie (X→Y, A→B, M→N) na wspólnym grafie IRL",
    )
    parser.add_argument(
        "--routes",
        type=str,
        default="5:42,8:33,12:47",
        help="Trasy src:dst (domyślnie X→Y, A→B, M→N)",
    )
    parser.add_argument("--weights", type=str, default=None)
    parser.add_argument("--fps", type=int, default=60)
    parser.add_argument("--hop-ms", type=int, default=150)
    parser.add_argument("--frames", type=int, default=2000)
    parser.add_argument(
        "--router",
        choices=["greedy", "rl", "auto"],
        default="auto",
    )
    parser.add_argument("--static", action="store_true", help="Wyłącz ruch grafu")
    parser.add_argument("--mobility", type=float, default=2.0, help="Prędkość ruchu węzłów (j/s)")
    args = parser.parse_args()

    irl_mode = not args.static
    hop_frames = max(4, round(args.hop_ms * args.fps / 1000))
    frame_mobility = args.mobility / args.fps if irl_mode else 0.0
    route_specs = _parse_routes(args.routes)

    net = None
    if args.weights and args.router in ("rl", "auto"):
        net = TopologyAgent(input_dim=8, hidden_dim=128)
        net.load_state_dict(torch.load(args.weights, weights_only=True))
        net.eval()

    env = MultiMeshEnv(irl_mode=irl_mode, mobility_step=frame_mobility)
    env.reset(route_specs)

    packets: list[PacketAnim] = [
        PacketAnim(route=r, hop_from=r.source, hop_to=r.source, hop_t=1.0) for r in env.routes
    ]

    fig, ax = plt.subplots(figsize=(10, 10))
    fig.patch.set_facecolor("#0d1117")
    ax.set_facecolor("#0d1117")
    ax.axis("off")
    ax.set_xlim(-0.05, 1.05)
    ax.set_ylim(-0.05, 1.05)
    ax.set_aspect("equal")

    edge_tracker = EdgeTracker()
    node_scatter = None
    packet_scatters: dict[str, object] = {}
    trail_lines: dict[str, object] = {}
    repeater_scatter = None
    title = ax.set_title("", color="#e5e7eb", fontsize=11, pad=10)
    endpoints = env.endpoint_nodes()

    def pick_action(route: Route, state, neighbors):
        if args.router == "greedy" or net is None:
            return greedy_to(env.G, neighbors, route.destination, env.max_hops)
        action = rl_action(net, state)
        if args.router == "auto":
            try:
                rl_dist = nx.shortest_path_length(
                    env.G, neighbors[action], route.destination
                )
                greedy = greedy_to(env.G, neighbors, route.destination, env.max_hops)
                gr_dist = nx.shortest_path_length(
                    env.G, neighbors[greedy], route.destination
                )
                if rl_dist > gr_dist:
                    return greedy
            except nx.NetworkXNoPath:
                return greedy_to(env.G, neighbors, route.destination, env.max_hops)
        return action

    def packet_xy(pkt: PacketAnim, pos):
        if pkt.hop_from == pkt.hop_to or pkt.hop_t >= 1.0:
            return pos[pkt.route.current_node]
        if pkt.hop_from not in pos or pkt.hop_to not in pos:
            return pos.get(pkt.route.current_node, (0.5, 0.5))
        x1, y1 = pos[pkt.hop_from]
        x2, y2 = pos[pkt.hop_to]
        t = _smoothstep(pkt.hop_t)
        return x1 + (x2 - x1) * t, y1 + (y2 - y1) * t

    def _clear_artists():
        nonlocal node_scatter, repeater_scatter
        edge_tracker.clear()
        for d in (packet_scatters, trail_lines):
            for artist in d.values():
                artist.remove()
            d.clear()
        if node_scatter is not None:
            node_scatter.remove()
            node_scatter = None
        if repeater_scatter is not None:
            repeater_scatter.remove()
            repeater_scatter = None

    def sync_artists():
        nonlocal node_scatter, repeater_scatter
        pos = nx.get_node_attributes(env.G, "pos")

        edge_tracker.sync(ax, env.G, pos)

        xs, ys, colors, sizes = [], [], [], []
        for n in env.G.nodes:
            if n not in pos:
                continue
            xs.append(pos[n][0])
            ys.append(pos[n][1])
            sizes.append(140 if n in endpoints else 70)
            if any(r.source == n for r in env.routes):
                colors.append("#3b82f6")
            elif any(r.destination == n for r in env.routes):
                colors.append("#ef4444")
            else:
                colors.append("#4b5563")

        if node_scatter is None:
            node_scatter = ax.scatter(xs, ys, c=colors, s=sizes, zorder=3)
        else:
            node_scatter.set_offsets(np.column_stack([xs, ys]))
            node_scatter.set_facecolors(colors)
            node_scatter.set_sizes(sizes)

        for route in env.routes:
            label = route.label
            if len(route.path) > 1:
                tx = [pos[n][0] for n in route.path if n in pos]
                ty = [pos[n][1] for n in route.path if n in pos]
                if label not in trail_lines:
                    (trail_lines[label],) = ax.plot(
                        tx, ty, color=route.color, alpha=0.45, linewidth=2, zorder=2
                    )
                else:
                    trail_lines[label].set_data(tx, ty)

            pkt = next(p for p in packets if p.route is route)
            px, py = packet_xy(pkt, pos)
            if label not in packet_scatters:
                packet_scatters[label] = ax.scatter(
                    [px], [py], s=180, c=route.color, edgecolors="#fff", linewidths=1.2, zorder=5
                )
            else:
                packet_scatters[label].set_offsets(np.array([[px, py]]))

        repeaters = []
        for r in env.routes:
            repeaters.extend(r.repeater_sites)
        if repeaters:
            rx = [s["pos"][0] for s in repeaters]
            ry = [s["pos"][1] for s in repeaters]
            if repeater_scatter is None:
                repeater_scatter = ax.scatter(
                    rx, ry, s=350, marker="*", c="#f59e0b", edgecolors="#fff", zorder=6
                )
            else:
                repeater_scatter.set_offsets(np.column_stack([rx, ry]))
        elif repeater_scatter is not None:
            repeater_scatter.set_offsets(np.empty((0, 2)))

        mode = "IRL" if irl_mode else "static"
        parts = []
        for r in env.routes:
            if r.delivered:
                st = "✓"
            elif r.impossible:
                st = "★"
            elif r.active:
                st = "…"
            else:
                st = "×"
            parts.append(f"{r.label}{st}")
        title.set_text(
            f"{' | '.join(parts)} | {env.delivered_count}/{len(env.routes)} dostarczone | {mode}"
        )

    def route_packet(pkt: PacketAnim):
        route = pkt.route
        if not route.active:
            return

        state, neighbors = env.get_state(route)
        if state is None or not neighbors:
            env._handle_disconnect(route)
            return

        action = pick_action(route, state, neighbors)
        pkt.hop_from = route.current_node
        pkt.hop_to = neighbors[action]
        pkt.hop_t = 0.0
        env.step_route(route, action, neighbors)

    def update(_frame):
        env.tick_physics()

        animating = False
        for pkt in packets:
            if pkt.route.active and pkt.hop_t < 1.0:
                pkt.hop_t = min(1.0, pkt.hop_t + 1.0 / hop_frames)
                animating = True

        if animating:
            sync_artists()
            return

        if env.all_done:
            sync_artists()
            return

        active = [p for p in packets if p.route.active and p.hop_t >= 1.0]
        random.shuffle(active)
        for pkt in active:
            route_packet(pkt)

        sync_artists()

    _clear_artists()
    sync_artists()
    interval = max(1, 1000 // args.fps)
    anim = animation.FuncAnimation(
        fig, update, frames=args.frames, interval=interval, blit=False, cache_frame_data=False
    )
    plt.tight_layout()
    plt.show()
    return anim


if __name__ == "__main__":
    render_multi()

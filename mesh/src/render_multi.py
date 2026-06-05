import argparse
import random
from dataclasses import dataclass, field

import matplotlib.animation as animation
import matplotlib.colors as mcolors
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.ticker as mticker
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
NEW_EDGE_FRAMES = 12
GHOST_FRAMES = 12
FINISH_HOLD_FRAMES = 4
STATION_112_SIZE = 1500
EMERGENCY_RUN_INDEX = 1
RCB_BROADCAST_RUN_INDEX = 2
RCB_MESSAGE = (
    "RCB: Awaryjne ostrzeżenie — zagrożenie powodziowe w regionie. "
    "Evakuuj się na wyżyny. Unikaj wód i niżów. Strefa: obszar mesh."
)


@dataclass
class RcbBroadcast:
    station: int
    message: str
    target_nodes: set[int]
    received: set[int] = field(default_factory=set)
    hop_queue: list[tuple[int, int]] = field(default_factory=list)
    in_flight_to: set[int] = field(default_factory=set)
    counted: bool = False


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
            if edge[0] in pos and edge[1] in pos:
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
        raise ValueError("Podaj co najmniej jedną trasę, np. --routes 5:42")
    return routes


@dataclass
class PacketAnim:
    route: Route
    hop_from: int
    hop_to: int
    hop_t: float = 1.0


def _packet_xy(pkt: PacketAnim, pos: dict) -> tuple[float, float]:
    if pkt.hop_t < 1.0 and pkt.hop_from in pos and pkt.hop_to in pos:
        t = _smoothstep(pkt.hop_t)
        x1, y1 = pos[pkt.hop_from]
        x2, y2 = pos[pkt.hop_to]
        return x1 + (x2 - x1) * t, y1 + (y2 - y1) * t
    if pkt.route.delivered and pkt.route.destination in pos:
        return pos[pkt.route.destination]
    if pkt.route.current_node in pos:
        return pos[pkt.route.current_node]
    return 0.5, 0.5


def _trail_points(route: Route, pkt: PacketAnim, pos: dict) -> tuple[list[float], list[float]]:
    """Ślad po aktualnych pozycjach węzłów — rusza się z kulami start/cel."""
    tx, ty = [], []
    for n in route.path:
        if pkt.hop_t < 1.0 and n == pkt.hop_to:
            break
        if n in pos:
            tx.append(pos[n][0])
            ty.append(pos[n][1])
    if pkt.hop_t < 1.0:
        px, py = _packet_xy(pkt, pos)
        if not tx or abs(tx[-1] - px) > 1e-6 or abs(ty[-1] - py) > 1e-6:
            tx.append(px)
            ty.append(py)
    return tx, ty


def _norm_to_world(pos_norm: dict, scale_m: float) -> dict:
    return {n: (p[0] * scale_m, p[1] * scale_m) for n, p in pos_norm.items()}


def _format_distance(value_m: float) -> str:
    if value_m >= 1000:
        return f"{value_m / 1000:.2f} km"
    return f"{value_m:.0f} m"


def _format_duration(seconds: float) -> str:
    if seconds >= 60:
        return f"{seconds / 60:.1f} min"
    if seconds >= 10:
        return f"{seconds:.1f} s"
    return f"{seconds:.2f} s"


def render_multi():
    parser = argparse.ArgumentParser(
        description="Symulacja mesh — sekwencyjne dostarczenia na wspólnym grafie IRL",
    )
    parser.add_argument(
        "--routes",
        type=str,
        default="5:42",
        help="Trasa src:dst (domyślnie X→Y = 5:42)",
    )
    parser.add_argument(
        "--runs",
        type=int,
        default=3,
        help="1: wiadomość; 2: SOS→112; 3: fala alertu RCB ze stacji 112",
    )
    parser.add_argument("--weights", type=str, default=None)
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--hop-ms", type=int, default=180, help="Bazowy czas skoku pakietu (ms)")
    parser.add_argument("--frames", type=int, default=5000)
    parser.add_argument(
        "--speed",
        type=float,
        default=0.05,
        help="Tempo całej symulacji (1.0=normal, 0.05≈20× wolniej)",
    )
    parser.add_argument(
        "--router",
        choices=["greedy", "rl", "auto"],
        default="auto",
    )
    parser.add_argument("--static", action="store_true", help="Wyłącz ruch grafu")
    parser.add_argument("--mobility", type=float, default=0.9, help="Prędkość węzłów (j/s)")
    parser.add_argument(
        "--area-km",
        type=float,
        default=1.5,
        help="Rozmiar obszaru symulacji (km × km) — osie w metrach lub km",
    )
    parser.add_argument(
        "--same-endpoints",
        action="store_true",
        help="Każdy przebieg z tymi samymi węzłami src:dst (domyślnie: losowa nowa para)",
    )
    parser.add_argument("--seed", type=int, default=42, help="Seed dla powtarzalności")
    parser.add_argument(
        "--output", "-o",
        type=str,
        default=None,
        help="Zapisz animację do MP4 (wymaga ffmpeg)",
    )
    parser.add_argument("--dpi", type=int, default=120, help="Rozdzielczość eksportu MP4")
    args = parser.parse_args()

    if args.output:
        import matplotlib
        matplotlib.use("Agg")

    random.seed(args.seed)
    np.random.seed(args.seed)

    irl_mode = not args.static
    speed = max(0.02, min(2.0, args.speed))
    hop_frames = max(6, round(args.hop_ms * args.fps / 1000 / speed))
    frame_mobility = args.mobility * speed / args.fps if irl_mode else 0.0
    area_km = max(0.05, args.area_km)
    scale_m = area_km * 1000.0
    hop_duration_s = args.hop_ms / 1000.0
    ms_per_frame = hop_duration_s / hop_frames
    use_km_ticks = area_km >= 1.0

    route_specs = _parse_routes(args.routes)[:1]
    max_runs = max(1, args.runs)

    net = None
    if args.weights and args.router in ("rl", "auto"):
        net = TopologyAgent(input_dim=8, hidden_dim=128)
        net.load_state_dict(torch.load(args.weights, weights_only=True))
        net.eval()

    env = MultiMeshEnv(
        irl_mode=irl_mode,
        mobility_step=frame_mobility,
        max_reconnect_attempts=6,
        max_tx_retries=12,
    )
    env.reset(route_specs)
    radio_range_m = env.radius * scale_m

    route = env.routes[0]
    route.label = f"Wiadomość {route.source}→{route.destination}"
    route.color = "#22c55e"
    packet = PacketAnim(
        route=route,
        hop_from=route.source,
        hop_to=route.source,
        hop_t=1.0,
    )

    runs_completed = 0
    finish_hold = 0
    simulation_done = False
    pending_hop_to: int | None = None
    run_transport_s = 0.0
    last_delivery_s: float | None = None
    failed_runs = 0
    rcb_state: RcbBroadcast | None = None

    margin_m = scale_m * 0.05
    fig, ax = plt.subplots(figsize=(10, 10))
    fig.patch.set_facecolor("#0d1117")
    ax.set_facecolor("#0d1117")
    ax.set_xlim(-margin_m, scale_m + margin_m)
    ax.set_ylim(-margin_m, scale_m + margin_m)
    ax.set_aspect("equal")
    ax.tick_params(axis="both", colors="#9ca3af", labelsize=9)
    for spine in ax.spines.values():
        spine.set_color("#374151")
    if use_km_ticks:
        ax.xaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _p: f"{v / 1000:g}"))
        ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _p: f"{v / 1000:g}"))
        ax.set_xlabel("km", color="#9ca3af", fontsize=10)
        ax.set_ylabel("km", color="#9ca3af", fontsize=10)
    else:
        ax.set_xlabel("m", color="#9ca3af", fontsize=10)
        ax.set_ylabel("m", color="#9ca3af", fontsize=10)

    edge_tracker = EdgeTracker()
    node_scatter = None
    packet_scatter = None
    trail_line = None
    repeater_scatter = None
    station_scatter = None
    station_label = None
    wave_circle = None
    title = ax.set_title("", color="#e5e7eb", fontsize=11, pad=10)
    hud_text = ax.text(
        0.98, 0.02, "",
        transform=ax.transAxes,
        ha="right", va="bottom",
        color="#e5e7eb", fontsize=9,
        family="monospace",
        bbox=dict(boxstyle="round,pad=0.35", facecolor="#161b22", edgecolor="#374151", alpha=0.92),
        zorder=10,
    )
    endpoints = env.endpoint_nodes()

    def pick_action(state, neighbors):
        if args.router == "greedy" or net is None:
            return greedy_to(env.G, neighbors, route.destination, env.max_hops)
        action = rl_action(net, state)
        if args.router == "auto":
            try:
                rl_dist = nx.shortest_path_length(env.G, neighbors[action], route.destination)
                greedy = greedy_to(env.G, neighbors, route.destination, env.max_hops)
                gr_dist = nx.shortest_path_length(env.G, neighbors[greedy], route.destination)
                if rl_dist > gr_dist:
                    return greedy
            except nx.NetworkXNoPath:
                return greedy_to(env.G, neighbors, route.destination, env.max_hops)
        return action

    def _rcb_expand_from(node: int):
        if rcb_state is None:
            return
        for n in env.G.neighbors(node):
            if n in rcb_state.received or n in rcb_state.in_flight_to:
                continue
            rcb_state.hop_queue.append((node, n))
            rcb_state.in_flight_to.add(n)

    def _setup_rcb_run():
        nonlocal rcb_state, endpoints, pending_hop_to, run_transport_s
        env.setup_rcb_broadcast(route, random)
        station = route.source
        component = nx.node_connected_component(env.G, station)
        rcb_state = RcbBroadcast(
            station=station,
            message=RCB_MESSAGE,
            target_nodes=set(component),
            received={station},
        )
        _rcb_expand_from(station)
        pending_hop_to = None
        run_transport_s = 0.0
        endpoints = {station}
        packet.hop_from = station
        packet.hop_to = station
        packet.hop_t = 1.0
        packet.route = route

    def _start_next_run():
        nonlocal trail_line, pending_hop_to, endpoints, run_transport_s, failed_runs, rcb_state
        if trail_line is not None:
            trail_line.remove()
            trail_line = None
        pending_hop_to = None
        run_transport_s = 0.0
        rcb_state = None

        if runs_completed == EMERGENCY_RUN_INDEX:
            env.clear_emergency_markers()
            if not env.setup_emergency_route(route, random, scale_m):
                env.reroll_route_endpoints(route, random)
                route.label = "SOS→112"
                route.color = "#dc2626"
                route.is_emergency = True
        elif runs_completed == RCB_BROADCAST_RUN_INDEX:
            _setup_rcb_run()
            sync_artists()
            return
        elif args.same_endpoints:
            env.clear_emergency_markers()
            env.reset_route(route)
            route.color = "#22c55e"
            route.label = f"Wiadomość {route.source}→{route.destination}"
        else:
            env.reroll_route_endpoints(route, random)
            route.label = f"Wiadomość {route.source}→{route.destination}"

        for _ in range(env.gossip_warmup_steps // 2):
            env.spread_all_gossip()
        endpoints = env.endpoint_nodes()
        packet.hop_from = route.source
        packet.hop_to = route.source
        packet.hop_t = 1.0
        packet.route = route

    def _skip_failed_run():
        nonlocal failed_runs
        failed_runs += 1
        if runs_completed < max_runs and failed_runs < max_runs * 3:
            _start_next_run()
            return True
        return False

    def abort_inflight():
        nonlocal pending_hop_to
        packet.hop_t = 1.0
        packet.hop_to = packet.hop_from
        pending_hop_to = None
        env.abort_inflight_hop(route)

    def route_packet():
        nonlocal pending_hop_to
        if not route.active:
            return

        state, neighbors = env.get_state(route)
        if state is None or not neighbors:
            env._handle_disconnect(route)
            return

        action = pick_action(state, neighbors)
        from_node = route.current_node
        to_node = neighbors[action]
        if irl_mode and not env.hop_edge_ok(route, from_node, to_node):
            env._handle_disconnect(route)
            return

        packet.hop_from = from_node
        packet.hop_to = to_node
        packet.hop_t = 0.0
        pending_hop_to = to_node

    def _is_hopping() -> bool:
        return packet.hop_t < 1.0

    def _delivery_hop_just_finished(prev_t: float) -> bool:
        return route.delivered and prev_t < 1.0 <= packet.hop_t

    def _tick_transport_clock():
        nonlocal run_transport_s
        if not irl_mode or simulation_done:
            return
        if rcb_state is not None or route.active or _is_hopping():
            run_transport_s += ms_per_frame

    def _step_rcb():
        nonlocal runs_completed, finish_hold, simulation_done, pending_hop_to, last_delivery_s

        if not route.delivered or _is_hopping():
            env.tick_physics()
        _tick_transport_clock()

        if _is_hopping():
            if (
                irl_mode
                and pending_hop_to is not None
                and not env.hop_edge_ok(route, packet.hop_from, packet.hop_to)
            ):
                to_n = pending_hop_to
                rcb_state.in_flight_to.discard(to_n)
                rcb_state.hop_queue.insert(0, (packet.hop_from, to_n))
                packet.hop_t = 1.0
                packet.hop_to = packet.hop_from
                pending_hop_to = None
                sync_artists()
                return

            prev_t = packet.hop_t
            packet.hop_t = min(1.0, packet.hop_t + 1.0 / hop_frames)
            if prev_t < 1.0 <= packet.hop_t and pending_hop_to is not None:
                to_n = pending_hop_to
                rcb_state.received.add(to_n)
                rcb_state.in_flight_to.discard(to_n)
                if to_n not in route.path:
                    route.path.append(to_n)
                _rcb_expand_from(to_n)
                pending_hop_to = None
            sync_artists()
            return

        if (
            rcb_state
            and len(rcb_state.received) >= len(rcb_state.target_nodes)
            and not rcb_state.hop_queue
        ):
            if not route.delivered:
                route.delivered = True
                last_delivery_s = run_transport_s
                runs_completed += 1
                rcb_state.counted = True
                if runs_completed >= max_runs:
                    simulation_done = True
            sync_artists()
            return

        if rcb_state and rcb_state.hop_queue:
            from_n, to_n = rcb_state.hop_queue.pop(0)
            if to_n in rcb_state.received:
                rcb_state.in_flight_to.discard(to_n)
            elif env.G.has_edge(from_n, to_n):
                packet.hop_from = from_n
                packet.hop_to = to_n
                packet.hop_t = 0.0
                pending_hop_to = to_n
            else:
                rcb_state.in_flight_to.discard(to_n)
                _rcb_expand_from(from_n)
        elif (
            rcb_state
            and not _is_hopping()
            and len(rcb_state.received) < len(rcb_state.target_nodes)
        ):
            for n in list(rcb_state.received):
                _rcb_expand_from(n)
            if not rcb_state.hop_queue:
                route.delivered = True
                last_delivery_s = run_transport_s
                if not rcb_state.counted:
                    runs_completed += 1
                    rcb_state.counted = True
                if runs_completed >= max_runs:
                    simulation_done = True

        sync_artists()

    def step(_frame=0):
        nonlocal runs_completed, finish_hold, simulation_done, pending_hop_to, last_delivery_s

        if simulation_done:
            sync_artists()
            return

        if rcb_state is not None:
            _step_rcb()
            return

        if route.impossible and not route.delivered:
            if _skip_failed_run():
                sync_artists()
                return
            simulation_done = True
            sync_artists()
            return

        if not route.delivered or _is_hopping():
            env.tick_physics()

        _tick_transport_clock()

        if _is_hopping():
            if (
                irl_mode
                and pending_hop_to is not None
                and not env.hop_edge_ok(route, packet.hop_from, packet.hop_to)
            ):
                abort_inflight()
                sync_artists()
                return

            prev_t = packet.hop_t
            packet.hop_t = min(1.0, packet.hop_t + 1.0 / hop_frames)

            if prev_t < 1.0 <= packet.hop_t and pending_hop_to is not None:
                env.commit_hop(route, pending_hop_to)
                pending_hop_to = None

            if _delivery_hop_just_finished(prev_t):
                last_delivery_s = run_transport_s
                runs_completed += 1
                if runs_completed >= max_runs:
                    simulation_done = True
                else:
                    _start_next_run()

            sync_artists()
            return

        if route.active:
            route_packet()
            sync_artists()
            return

        sync_artists()

    def _clear_artists():
        nonlocal node_scatter, packet_scatter, trail_line, repeater_scatter
        nonlocal station_scatter, station_label, wave_circle
        edge_tracker.clear()
        if packet_scatter is not None:
            packet_scatter.remove()
            packet_scatter = None
        if trail_line is not None:
            trail_line.remove()
            trail_line = None
        if node_scatter is not None:
            node_scatter.remove()
            node_scatter = None
        if repeater_scatter is not None:
            repeater_scatter.remove()
            repeater_scatter = None
        if station_scatter is not None:
            station_scatter.remove()
            station_scatter = None
        if station_label is not None:
            station_label.remove()
            station_label = None
        if wave_circle is not None:
            wave_circle.remove()
            wave_circle = None

    def _format_coords(x_m: float, y_m: float) -> str:
        if use_km_ticks:
            return f"{x_m / 1000:.3f} km, {y_m / 1000:.3f} km"
        return f"{x_m:.0f} m, {y_m:.0f} m"

    def sync_artists():
        nonlocal node_scatter, packet_scatter, trail_line, repeater_scatter
        nonlocal station_scatter, station_label, wave_circle
        pos_norm = nx.get_node_attributes(env.G, "pos")
        pos = _norm_to_world(pos_norm, scale_m)
        edge_tracker.sync(ax, env.G, pos)

        xs, ys, colors, sizes = [], [], [], []
        for n in env.G.nodes:
            if n not in pos:
                continue
            is_station = env.G.nodes[n].get("is_112", False)
            got_rcb = rcb_state is not None and n in rcb_state.received
            xs.append(pos[n][0])
            ys.append(pos[n][1])
            if is_station:
                sizes.append(50)
                colors.append("#1f2937")
            elif got_rcb:
                sizes.append(100)
                colors.append("#fbbf24")
            elif n == route.source and not route.is_rcb_broadcast:
                sizes.append(160 if route.is_emergency else 140)
                colors.append("#3b82f6")
            elif n == route.destination and not route.is_emergency and not route.is_rcb_broadcast:
                sizes.append(140)
                colors.append("#ef4444")
            elif n in endpoints:
                sizes.append(140)
                colors.append("#4b5563")
            else:
                sizes.append(70)
                colors.append("#4b5563")

        if node_scatter is None:
            node_scatter = ax.scatter(xs, ys, c=colors, s=sizes, zorder=3)
        else:
            node_scatter.set_offsets(np.column_stack([xs, ys]))
            node_scatter.set_facecolors(colors)
            node_scatter.set_sizes(sizes)

        tx, ty = _trail_points(route, packet, pos)
        if tx:
            if trail_line is None:
                (trail_line,) = ax.plot(
                    tx, ty, color=route.color, alpha=0.45, linewidth=2, zorder=2
                )
            else:
                trail_line.set_data(tx, ty)
        elif trail_line is not None:
            trail_line.set_data([], [])

        px, py = _packet_xy(packet, pos)
        pkt_size = 220 if (route.is_emergency or route.is_rcb_broadcast) else 180
        if packet_scatter is None:
            packet_scatter = ax.scatter(
                [px], [py], s=pkt_size, c=route.color,
                edgecolors="#fff", linewidths=1.4 if route.is_emergency else 1.2,
                zorder=5,
            )
        else:
            packet_scatter.set_offsets(np.array([[px, py]]))
            packet_scatter.set_facecolors([route.color])
            packet_scatter.set_sizes([pkt_size])

        station_node = None
        if route.is_rcb_broadcast and route.source in pos:
            station_node = route.source
        elif route.is_emergency and route.destination in pos:
            station_node = route.destination

        if station_node is not None:
            sx, sy = pos[station_node]
            if station_scatter is None:
                station_scatter = ax.scatter(
                    [sx], [sy], s=STATION_112_SIZE, c="#dc2626",
                    edgecolors="#ffffff", linewidths=2.8, zorder=4, alpha=0.93,
                )
                station_label = ax.text(
                    sx, sy, "112",
                    ha="center", va="center",
                    color="#ffffff", fontsize=15, fontweight="bold", zorder=5,
                )
            else:
                station_scatter.set_offsets(np.array([[sx, sy]]))
                station_label.set_position((sx, sy))
        elif station_scatter is not None:
            station_scatter.remove()
            station_scatter = None
            station_label.remove()
            station_label = None

        if rcb_state is not None and route.source in pos:
            sx, sy = pos[route.source]
            if rcb_state.target_nodes:
                dists = [
                    float(np.hypot(pos[n][0] - sx, pos[n][1] - sy))
                    for n in rcb_state.target_nodes if n in pos
                ]
                max_r = max(dists) if dists else scale_m * 0.25
            else:
                max_r = scale_m * 0.25
            prog = len(rcb_state.received) / max(1, len(rcb_state.target_nodes))
            radius = max_r * (0.1 + 0.9 * prog)
            if wave_circle is None:
                wave_circle = mpatches.Circle(
                    (sx, sy), radius,
                    fill=False, edgecolor="#fbbf24", linewidth=2.2, alpha=0.5, zorder=1,
                )
                ax.add_patch(wave_circle)
            else:
                wave_circle.center = (sx, sy)
                wave_circle.set_radius(radius)
        elif wave_circle is not None:
            wave_circle.remove()
            wave_circle = None

        if route.repeater_sites:
            rx = [s["pos"][0] * scale_m for s in route.repeater_sites]
            ry = [s["pos"][1] * scale_m for s in route.repeater_sites]
            if repeater_scatter is None:
                repeater_scatter = ax.scatter(
                    rx, ry, s=350, marker="*", c="#f59e0b", edgecolors="#fff", zorder=6
                )
            else:
                repeater_scatter.set_offsets(np.column_stack([rx, ry]))
        elif repeater_scatter is not None:
            repeater_scatter.set_offsets(np.empty((0, 2)))

        mode = "IRL" if irl_mode else "static"
        if route.is_rcb_broadcast and rcb_state is not None:
            if route.delivered and not _is_hopping():
                st = "OK"
                phase = f"fala RCB · {len(rcb_state.received)}/{len(rcb_state.target_nodes)} story"
            elif _is_hopping():
                st = "~~~"
                phase = f"fala RCB · {len(rcb_state.received)}/{len(rcb_state.target_nodes)} story"
            else:
                st = "~~~"
                phase = f"fala RCB · {len(rcb_state.received)}/{len(rcb_state.target_nodes)} story"
        elif route.is_emergency:
            if route.delivered and not _is_hopping():
                st = "SOS OK"
                phase = "112 odebrał alert + lokalizacja"
            elif route.impossible:
                st = "★"
                phase = "brak kontaktu 112"
            elif _is_hopping():
                st = "SOS↺" if route.tx_retries else "SOS→"
                phase = "szukam kontaktu ratunkowego 112"
            else:
                st = "SOS"
                phase = "wysyłam SOS + GPS"
        elif route.delivered and not _is_hopping():
            st = "✓"
            phase = "dostarczono"
        elif route.impossible:
            st = "★"
            phase = "impossible"
        elif _is_hopping():
            st = "↺" if route.tx_retries else "→"
            phase = "routing"
        else:
            st = "…"
            phase = "routing"
        tx_info = f" | tx↺{route.tx_aborts}" if route.tx_aborts else ""
        title.set_text(
            f"{route.label}{st} | przebieg "
            f"{min(runs_completed + (1 if route.active else 0), max_runs)}/{max_runs} | {phase}{tx_info} | {mode}"
        )

        if irl_mode:
            dist_m = 0.0
            if len(route.path) >= 2:
                for a, b in zip(route.path[:-1], route.path[1:]):
                    if a in pos and b in pos:
                        ax_, ay_ = pos[a]
                        bx_, by_ = pos[b]
                        dist_m += float(np.hypot(bx_ - ax_, by_ - ay_))
            if _is_hopping() and packet.hop_from in pos and packet.hop_to in pos:
                px_h, py_h = _packet_xy(packet, pos)
                fx, fy = pos[packet.hop_from]
                dist_m += float(np.hypot(px_h - fx, py_h - fy))
            if route.is_rcb_broadcast and rcb_state is not None:
                hud_lines = [
                    "ALERT RCB → story (broadcast)",
                    RCB_MESSAGE,
                    f"odebrane: {len(rcb_state.received)}/{len(rcb_state.target_nodes)} · "
                    f"każdy węzeł raz",
                    f"transport: {_format_duration(run_transport_s)}",
                ]
            else:
                hud_lines = [
                    f"transport: {_format_duration(run_transport_s)}",
                    f"trasa: {_format_distance(dist_m)} · {route.hops} hop",
                    f"radio ~{_format_distance(radio_range_m)}",
                ]
                if route.is_emergency:
                    hud_lines.insert(0, "EMERGENCY CONTACT: 112")
                    hud_lines.insert(1, f"lokalizacja: {_format_coords(route.sos_x_m, route.sos_y_m)}")
            if last_delivery_s is not None and (route.delivered or simulation_done):
                hud_lines.append(f"poprz.: {_format_duration(last_delivery_s)}")
            hud_text.set_text("\n".join(hud_lines))
        else:
            hud_text.set_text("")

    _clear_artists()
    sync_artists()
    plt.tight_layout()

    if args.output:
        from matplotlib.animation import FFMpegWriter

        writer = FFMpegWriter(fps=args.fps, metadata={"artist": "greenhack-mesh"})
        try:
            with writer.saving(fig, args.output, dpi=args.dpi):
                for i in range(args.frames):
                    step(i)
                    writer.grab_frame()
                    if simulation_done:
                        finish_hold += 1
                        if finish_hold >= FINISH_HOLD_FRAMES:
                            break
        except FileNotFoundError as e:
            plt.close(fig)
            raise SystemExit(
                "ffmpeg nie znaleziony — zainstaluj: sudo pacman -S ffmpeg"
            ) from e
        plt.close(fig)
        print(f"Zapisano: {args.output} ({runs_completed} dostarczeń)")
        return None

    interval = max(1, 1000 // args.fps)
    anim = animation.FuncAnimation(
        fig, step, frames=args.frames, interval=interval, blit=False, cache_frame_data=False
    )
    plt.show()
    return anim


if __name__ == "__main__":
    render_multi()

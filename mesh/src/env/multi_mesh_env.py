from __future__ import annotations

from dataclasses import dataclass, field

import networkx as nx
import numpy as np
import torch


@dataclass
class Route:
    label: str
    source: int
    destination: int
    color: str
    current_node: int = 0
    path: list[int] = field(default_factory=list)
    hops: int = 0
    delivered: bool = False
    impossible: bool = False
    store_steps: int = 0
    reconnect_attempts: int = 0
    repeater_sites: list = field(default_factory=list)
    tx_retries: int = 0
    tx_aborts: int = 0
    is_emergency: bool = False
    sos_x_m: float = 0.0
    sos_y_m: float = 0.0
    is_rcb_broadcast: bool = False

    @property
    def active(self) -> bool:
        return not self.delivered and not self.impossible

    @property
    def mission_success(self) -> bool:
        return self.delivered or self.impossible


ROUTE_COLORS = ("#22c55e", "#f97316", "#a855f7", "#06b6d4", "#ec4899", "#eab308")


class MultiMeshEnv:
    """Wspólny graf, wiele wiadomości X→Y, A→B, M→N jednocześnie."""

    UNKNOWN_HOPS = 999

    def __init__(
        self,
        num_nodes=50,
        radius=0.25,
        max_hops=32,
        max_degree=4,
        irl_mode=True,
        mobility_step=0.02,
        node_drop_prob=0.0,
        max_store_steps=3,
        max_reconnect_attempts=3,
        max_tx_retries=8,
        gossip_warmup_steps=12,
    ):
        self.num_nodes = num_nodes
        self.radius = radius
        self.max_hops = max_hops
        self.max_degree = max_degree
        self.irl_mode = irl_mode
        self.mobility_step = mobility_step
        self.node_drop_prob = node_drop_prob
        self.max_store_steps = max_store_steps
        self.max_reconnect_attempts = max_reconnect_attempts
        self.max_tx_retries = max_tx_retries
        self.gossip_warmup_steps = gossip_warmup_steps
        self.routes: list[Route] = []
        self.gossip_by_dest: dict[int, dict[int, int]] = {}
        self.topology_events = 0
        self.G = nx.Graph()

    @property
    def all_done(self) -> bool:
        return all(not r.active for r in self.routes)

    @property
    def delivered_count(self) -> int:
        return sum(1 for r in self.routes if r.delivered)

    def reset(self, route_specs: list[tuple[str, int, int]] | None = None):
        if route_specs is None:
            route_specs = [
                ("X→Y", 5, 42),
                ("A→B", 8, 33),
                ("M→N", 12, 47),
            ]

        for attempt in range(80):
            self.G = nx.random_geometric_graph(self.num_nodes, self.radius)
            for i in self.G.nodes:
                self.G.nodes[i]["battery"] = float(np.random.uniform(0.2, 1.0))
                self.G.nodes[i]["mobility"] = float(np.random.uniform(0.0, 1.0))

            ok = True
            for _label, src, dst in route_specs:
                if src == dst or not nx.has_path(self.G, src, dst):
                    ok = False
                    break
            if ok:
                break

        self.routes = []
        for i, (label, src, dst) in enumerate(route_specs):
            self.routes.append(
                Route(
                    label=label,
                    source=src,
                    destination=dst,
                    color=ROUTE_COLORS[i % len(ROUTE_COLORS)],
                    current_node=src,
                    path=[src],
                )
            )

        self.topology_events = 0
        self._init_velocities()
        self._init_all_gossip()
        for _ in range(self.gossip_warmup_steps):
            self.spread_all_gossip()
        return self.routes

    def _init_velocities(self):
        self.velocities = {}
        for n in self.G.nodes:
            angle = np.random.uniform(0, 2 * np.pi)
            speed = np.random.uniform(0.5, 1.0) * self.G.nodes[n]["mobility"]
            self.velocities[n] = (float(np.cos(angle) * speed), float(np.sin(angle) * speed))

    def _init_all_gossip(self):
        self.gossip_by_dest = {}
        for route in self.routes:
            dest = route.destination
            if dest not in self.gossip_by_dest:
                table = {n: self.UNKNOWN_HOPS for n in self.G.nodes}
                table[dest] = 0
                self.gossip_by_dest[dest] = table

    def spread_all_gossip(self):
        if not self.irl_mode:
            return
        for dest, table in self.gossip_by_dest.items():
            updated = dict(table)
            for u in self.G.nodes:
                for v in self.G.neighbors(u):
                    candidate = table.get(u, self.UNKNOWN_HOPS) + 1
                    if candidate < updated.get(v, self.UNKNOWN_HOPS):
                        updated[v] = candidate
            self.gossip_by_dest[dest] = updated

    def tick_physics(self):
        if not self.irl_mode:
            return
        self._move_nodes()
        self._rebuild_edges()
        self.spread_all_gossip()

    def _pin_station(self, station: int):
        pos = nx.get_node_attributes(self.G, "pos")
        if station in pos:
            self.G.nodes[station]["pos_pin"] = tuple(pos[station])
        self.G.nodes[station]["mobility"] = 0.0
        self.G.nodes[station]["is_112"] = True
        self.velocities[station] = (0.0, 0.0)

    def _move_nodes(self):
        pos = nx.get_node_attributes(self.G, "pos")
        for n in self.G.nodes:
            if self.G.nodes[n].get("is_112"):
                pin = self.G.nodes[n].get("pos_pin")
                if pin is not None:
                    pos[n] = pin
                self.velocities[n] = (0.0, 0.0)
                continue
            mob = self.G.nodes[n]["mobility"]
            vx, vy = self.velocities.get(n, (0.3, 0.0))
            x, y = pos[n]
            step = self.mobility_step * mob

            x += vx * step
            y += vy * step

            if x <= 0.0:
                x = 0.0
                vx = abs(vx) * 0.92
            elif x >= 1.0:
                x = 1.0
                vx = -abs(vx) * 0.92
            if y <= 0.0:
                y = 0.0
                vy = abs(vy) * 0.92
            elif y >= 1.0:
                y = 1.0
                vy = -abs(vy) * 0.92

            # delikatna zmiana kierunku — momentum, nie losowy skok
            vx += (np.random.random() - 0.5) * 0.03 * mob
            vy += (np.random.random() - 0.5) * 0.03 * mob

            speed = float(np.hypot(vx, vy))
            max_speed = 0.75
            if speed > max_speed:
                vx, vy = vx / speed * max_speed, vy / speed * max_speed
            elif speed < 0.10:
                angle = np.random.uniform(0, 2 * np.pi)
                vx, vy = float(np.cos(angle) * 0.22), float(np.sin(angle) * 0.22)

            pos[n] = (float(x), float(y))
            self.velocities[n] = (float(vx), float(vy))
        nx.set_node_attributes(self.G, pos, "pos")

    def _rebuild_edges(self):
        pos = nx.get_node_attributes(self.G, "pos")
        nodes = list(self.G.nodes)
        self.G.remove_edges_from(list(self.G.edges()))
        for i, a in enumerate(nodes):
            ax, ay = pos[a]
            for b in nodes[i + 1 :]:
                bx, by = pos[b]
                if (ax - bx) ** 2 + (ay - by) ** 2 <= self.radius**2:
                    self.G.add_edge(a, b)

    def can_reach(self, route: Route) -> bool:
        if route.destination not in self.G or route.current_node not in self.G:
            return False
        return nx.has_path(self.G, route.current_node, route.destination)

    def _oracle_hops(self, node: int, destination: int) -> int:
        try:
            return nx.shortest_path_length(self.G, node, destination)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return self.max_hops + 1

    def _gossip_hops(self, node: int, destination: int) -> int:
        return self.gossip_by_dest.get(destination, {}).get(node, self.UNKNOWN_HOPS)

    def _dest_hint(self, node: int, destination: int) -> int:
        if self.irl_mode:
            return self._gossip_hops(node, destination)
        return self._oracle_hops(node, destination)

    def _normalize_hint(self, hops: int) -> float:
        if hops >= self.UNKNOWN_HOPS:
            return 1.0
        return min(hops / self.max_hops, 1.0)

    def get_state(self, route: Route):
        neighbors = list(self.G.neighbors(route.current_node))
        if not neighbors:
            return None, []

        bridge_nodes = {u for u, _ in nx.bridges(self.G)} if self.G.number_of_edges() else set()
        reachable = 1.0 if self.can_reach(route) else 0.0
        dest = route.destination
        states = []
        for n in neighbors:
            hint = self._dest_hint(n, dest)
            if self.irl_mode and hint >= self.UNKNOWN_HOPS:
                hint = self._oracle_hops(n, dest)
            states.append(
                [
                    self.G.nodes[route.current_node]["battery"],
                    self.G.nodes[n]["battery"],
                    self.G.degree(n) / self.max_degree,
                    self.G.nodes[n]["mobility"],
                    1.0 if n in bridge_nodes else 0.0,
                    route.hops / self.max_hops,
                    1.0 - self._normalize_hint(hint),
                    reachable,
                ]
            )
        return torch.tensor(states, dtype=torch.float32), neighbors

    def _suggest_repeaters(self, route: Route):
        if self.can_reach(route):
            return []
        if route.source not in self.G or route.destination not in self.G:
            return []
        comp_src = nx.node_connected_component(self.G, route.source)
        comp_dst = nx.node_connected_component(self.G, route.destination)
        pos = nx.get_node_attributes(self.G, "pos")
        best = None
        for a in comp_src:
            ax, ay = pos[a]
            for b in comp_dst:
                bx, by = pos[b]
                dist_sq = (ax - bx) ** 2 + (ay - by) ** 2
                if best is None or dist_sq < best[0]:
                    best = (dist_sq, a, b)
        if not best:
            return []
        _, node_a, node_b = best
        pa, pb = pos[node_a], pos[node_b]
        return [
            {
                "pos": ((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2),
                "bridge": (node_a, node_b),
                "kind": "municipal_repeater",
                "route": route.label,
            }
        ]

    def _heuristic_reconnect(self, route: Route) -> bool:
        if route.reconnect_attempts >= self.max_reconnect_attempts:
            return False
        pos = nx.get_node_attributes(self.G, "pos")
        cur = route.current_node
        if cur not in pos or self.G.degree(cur) >= self.max_degree:
            return False
        scan_r = self.radius * (1.5 if not self.can_reach(route) else 1.0)
        scan_r_sq = scan_r**2
        cx, cy = pos[cur]
        candidates = []
        for n in self.G.nodes:
            if n == cur or self.G.has_edge(cur, n) or self.G.degree(n) >= self.max_degree:
                continue
            nx_, ny_ = pos[n]
            if (cx - nx_) ** 2 + (cy - ny_) ** 2 > scan_r_sq:
                continue
            score = self.G.nodes[n]["battery"] - 0.05 * self._dest_hint(n, route.destination)
            candidates.append((score, n))
        if not candidates:
            return False
        _, best = max(candidates)
        self.G.add_edge(cur, best)
        route.reconnect_attempts += 1
        self.topology_events += 1
        return True

    def _mark_impossible(self, route: Route):
        route.impossible = True
        route.repeater_sites = self._suggest_repeaters(route)

    def _handle_disconnect(self, route: Route) -> bool:
        """Zwraca True gdy trasa zakończona."""
        cur = route.current_node
        if not list(self.G.neighbors(cur)):
            if self.irl_mode and route.store_steps < self.max_store_steps:
                route.store_steps += 1

        if not self.can_reach(route):
            while route.reconnect_attempts < self.max_reconnect_attempts:
                if not self._heuristic_reconnect(route):
                    break
                self.spread_all_gossip()
                if self.can_reach(route):
                    return False
            self._mark_impossible(route)
            return True

        return not list(self.G.neighbors(cur))

    def hop_edge_ok(self, route: Route, from_node: int, to_node: int) -> bool:
        if from_node not in self.G or to_node not in self.G:
            return False
        return self.G.has_edge(from_node, to_node)

    def commit_hop(self, route: Route, next_node: int) -> bool:
        """Zatwierdza hop po zakończeniu transmisji (animacja / RTT)."""
        if not route.active:
            return True

        if self.irl_mode and not self.hop_edge_ok(route, route.current_node, next_node):
            return self.abort_inflight_hop(route)

        route.tx_retries = 0
        route.hops += 1
        route.current_node = next_node
        route.path.append(next_node)

        if next_node == route.destination:
            route.delivered = True
            return True

        if route.hops >= self.max_hops:
            if not self.can_reach(route):
                self._mark_impossible(route)
            return True

        if not self.can_reach(route):
            return self._handle_disconnect(route)

        if not list(self.G.neighbors(route.current_node)):
            return self._handle_disconnect(route)

        return False

    def abort_inflight_hop(self, route: Route) -> bool:
        """Zerwana krawędź w trakcie hopu — rollback i ponowna próba."""
        route.tx_aborts += 1
        route.tx_retries += 1

        if route.tx_retries >= self.max_tx_retries:
            self._mark_impossible(route)
            return True

        return self._handle_disconnect(route)

    def step_route(self, route: Route, action_idx: int, neighbors: list[int]) -> bool:
        """Natychmiastowy hop (trening / testy bez animacji)."""
        if not route.active:
            return True

        if action_idx >= len(neighbors):
            return self._handle_disconnect(route)

        next_node = neighbors[action_idx]
        if self.irl_mode and not self.hop_edge_ok(route, route.current_node, next_node):
            return self._handle_disconnect(route)

        return self.commit_hop(route, next_node)

    def reset_route(self, route: Route):
        """Reset trasy na kolejny przebieg (ta sama para węzłów)."""
        route.current_node = route.source
        route.path = [route.source]
        route.hops = 0
        route.delivered = False
        route.impossible = False
        route.store_steps = 0
        route.reconnect_attempts = 0
        route.repeater_sites = []
        route.tx_retries = 0
        route.tx_aborts = 0
        route.is_emergency = False
        route.sos_x_m = 0.0
        route.sos_y_m = 0.0
        route.is_rcb_broadcast = False

    def _ensure_gossip_for_dest(self, dest: int):
        if dest not in self.gossip_by_dest:
            table = {n: self.UNKNOWN_HOPS for n in self.G.nodes}
            table[dest] = 0
            self.gossip_by_dest[dest] = table

    def setup_emergency_route(self, route: Route, rng, scale_m: float = 1500.0) -> bool:
        """Run 2: SOS z telefonu ofiary do stacji ratunkowej 112 (węzeł infrastruktury)."""
        nodes = list(self.G.nodes)
        if len(nodes) < 2:
            return False

        for _ in range(400):
            station = rng.choice(nodes)
            candidates = [
                n for n in nodes
                if n != station and nx.has_path(self.G, n, station)
            ]
            if not candidates:
                continue
            src = rng.choice(candidates)
            pos = nx.get_node_attributes(self.G, "pos")

            route.source = src
            route.destination = station
            route.label = "SOS→112"
            route.color = "#dc2626"
            route.is_emergency = True
            route.sos_x_m = float(pos[src][0] * scale_m)
            route.sos_y_m = float(pos[src][1] * scale_m)
            self.reset_route(route)
            route.is_emergency = True
            route.sos_x_m = float(pos[src][0] * scale_m)
            route.sos_y_m = float(pos[src][1] * scale_m)

            self.G.nodes[station]["mobility"] = 0.0
            self.G.nodes[station]["is_112"] = True
            self.velocities[station] = (0.0, 0.0)
            self._pin_station(station)
            self._ensure_gossip_for_dest(station)
            for _ in range(self.gossip_warmup_steps):
                self.spread_all_gossip()
            return True
        return False

    def clear_emergency_markers(self):
        for n in self.G.nodes:
            if self.G.nodes[n].get("is_112"):
                self.G.nodes[n]["is_112"] = False
                self.G.nodes[n].pop("pos_pin", None)
                self.G.nodes[n]["mobility"] = float(np.random.uniform(0.0, 1.0))

    def setup_rcb_broadcast(self, route: Route, rng) -> bool:
        """Run 3: alert RCB ze stacji 112 — flood do wszystkich węzłów w składowej."""
        nodes = list(self.G.nodes)
        if not nodes:
            return False

        self.clear_emergency_markers()
        station = rng.choice(nodes)
        route.source = station
        route.destination = station
        route.label = "RCB→ALL"
        route.color = "#f59e0b"
        route.is_rcb_broadcast = True
        route.is_emergency = False
        self.reset_route(route)
        route.is_rcb_broadcast = True
        route.current_node = station
        route.path = [station]

        self.G.nodes[station]["mobility"] = 0.0
        self.G.nodes[station]["is_112"] = True
        self.velocities[station] = (0.0, 0.0)
        self._pin_station(station)
        return True

    def reroll_route_endpoints(self, route: Route, rng) -> bool:
        """Nowa para start/cel na aktualnym grafie — węzły dalej się ruszają."""
        self.clear_emergency_markers()
        nodes = list(self.G.nodes)
        if len(nodes) < 2:
            return False
        for _ in range(300):
            src, dst = rng.sample(nodes, 2)
            if src != dst and nx.has_path(self.G, src, dst):
                route.source = src
                route.destination = dst
                route.label = f"{src}→{dst}"
                route.color = ROUTE_COLORS[0]
                self.reset_route(route)
                self._ensure_gossip_for_dest(dst)
                return True
        return False

    def endpoint_nodes(self) -> set[int]:
        nodes = set()
        for r in self.routes:
            nodes.add(r.source)
            nodes.add(r.destination)
        return nodes

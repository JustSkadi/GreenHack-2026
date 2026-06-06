import networkx as nx
import numpy as np
import torch


class MeshEnv:
    """Mesh IRL: routing X→Y, reconnect heurystyka, impossible + repeater gdy brak spójności."""

    UNKNOWN_HOPS = 999

    def __init__(
        self,
        num_nodes=50,
        radius=0.25,
        max_hops=20,
        max_degree=4,
        irl_mode=True,
        mobility_step=0.02,
        node_drop_prob=0.005,
        max_store_steps=3,
        max_reconnect_attempts=3,
        gossip_warmup_steps=8,
        physics_on_step=True,
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
        self.gossip_warmup_steps = gossip_warmup_steps
        self.physics_on_step = physics_on_step

        self.source = 0
        self.destination = 0
        self.delivered = False
        self.impossible = False
        self.stored = False
        self.store_steps = 0
        self.reconnect_attempts = 0
        self.path = []
        self.gossip = {}
        self.repeater_sites = []
        self.topology_events = 0
        self.reset()

    @property
    def mission_success(self):
        return self.delivered or self.impossible

    def reset(self, source=None, destination=None):
        self.G = nx.random_geometric_graph(self.num_nodes, self.radius)
        for i in self.G.nodes:
            self.G.nodes[i]["battery"] = np.random.uniform(0.2, 1.0)
            self.G.nodes[i]["mobility"] = np.random.uniform(0.0, 1.0)

        if source is not None and destination is not None:
            self.source = source
            self.destination = destination
            if not nx.has_path(self.G, self.source, self.destination):
                for _ in range(50):
                    self.G = nx.random_geometric_graph(self.num_nodes, self.radius)
                    for i in self.G.nodes:
                        self.G.nodes[i]["battery"] = np.random.uniform(0.2, 1.0)
                        self.G.nodes[i]["mobility"] = np.random.uniform(0.0, 1.0)
                    if nx.has_path(self.G, self.source, self.destination):
                        break
        else:
            for _ in range(100):
                self.source = np.random.randint(0, self.num_nodes)
                self.destination = np.random.randint(0, self.num_nodes)
                if (
                    self.source != self.destination
                    and nx.has_path(self.G, self.source, self.destination)
                ):
                    break

        self.current_node = self.source
        self.hops = 0
        self.delivered = False
        self.impossible = False
        self.stored = False
        self.store_steps = 0
        self.reconnect_attempts = 0
        self.path = [self.source]
        self.repeater_sites = []
        self.topology_events = 0
        self._init_gossip()
        for _ in range(self.gossip_warmup_steps):
            self._spread_gossip()
        return self._get_state()

    def can_reach_destination(self):
        if self.destination not in self.G or self.current_node not in self.G:
            return False
        return nx.has_path(self.G, self.current_node, self.destination)

    def suggest_repeater_sites(self):
        if self.can_reach_destination():
            return []

        if self.source not in self.G or self.destination not in self.G:
            return []

        comp_src = nx.node_connected_component(self.G, self.source)
        comp_dst = nx.node_connected_component(self.G, self.destination)
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
            }
        ]

    def _init_gossip(self):
        self.gossip = {n: self.UNKNOWN_HOPS for n in self.G.nodes}
        if self.destination in self.G:
            self.gossip[self.destination] = 0

    def _gossip_hops(self, node):
        if node not in self.G:
            return self.UNKNOWN_HOPS
        return self.gossip.get(node, self.UNKNOWN_HOPS)

    def _oracle_hops(self, node):
        try:
            return nx.shortest_path_length(self.G, node, self.destination)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return self.max_hops + 1

    def _dest_hint(self, node):
        if self.irl_mode:
            return self._gossip_hops(node)
        return self._oracle_hops(node)

    def _normalize_hint(self, hops):
        if hops >= self.UNKNOWN_HOPS:
            return 1.0
        return min(hops / self.max_hops, 1.0)

    def _spread_gossip(self):
        if not self.irl_mode:
            return
        updated = dict(self.gossip)
        for u in self.G.nodes:
            for v in self.G.neighbors(u):
                candidate = self._gossip_hops(u) + 1
                if candidate < updated.get(v, self.UNKNOWN_HOPS):
                    updated[v] = candidate
        self.gossip = updated

    def _rebuild_edges(self):
        pos = nx.get_node_attributes(self.G, "pos")
        nodes = list(self.G.nodes)
        self.G.remove_edges_from(list(self.G.edges()))

        candidates: list[tuple[float, int, int]] = []
        for i, a in enumerate(nodes):
            ax, ay = pos[a]
            for b in nodes[i + 1 :]:
                bx, by = pos[b]
                dist_sq = (ax - bx) ** 2 + (ay - by) ** 2
                if dist_sq <= self.radius**2:
                    candidates.append((dist_sq, a, b))

        candidates.sort(key=lambda item: item[0])
        degree = dict.fromkeys(nodes, 0)
        for _dist_sq, a, b in candidates:
            if degree[a] >= self.max_degree or degree[b] >= self.max_degree:
                continue
            self.G.add_edge(a, b)
            degree[a] += 1
            degree[b] += 1

    def _move_nodes(self):
        pos = nx.get_node_attributes(self.G, "pos")
        for n in self.G.nodes:
            mob = self.G.nodes[n]["mobility"]
            x, y = pos[n]
            dx = (np.random.random() - 0.5) * mob * self.mobility_step
            dy = (np.random.random() - 0.5) * mob * self.mobility_step
            pos[n] = (float(np.clip(x + dx, 0, 1)), float(np.clip(y + dy, 0, 1)))
        nx.set_node_attributes(self.G, pos, "pos")

    def _maybe_drop_node(self):
        if np.random.random() >= self.node_drop_prob:
            return
        protected = {self.current_node, self.source, self.destination}
        candidates = [n for n in self.G.nodes if n not in protected]
        if not candidates:
            return
        node = candidates[np.random.randint(len(candidates))]
        self.G.remove_node(node)
        self.gossip.pop(node, None)
        self.topology_events += 1

    def _update_physics(self):
        if not self.irl_mode:
            return
        self._move_nodes()
        self._rebuild_edges()
        self._maybe_drop_node()

    def _heuristic_reconnect(self):
        """WiFi Direct rediscovery — szukaj nowego peer'a w zasięgu."""
        if self.reconnect_attempts >= self.max_reconnect_attempts:
            return False

        pos = nx.get_node_attributes(self.G, "pos")
        if self.current_node not in pos:
            return False

        cx, cy = pos[self.current_node]
        if self.G.degree(self.current_node) >= self.max_degree:
            return False

        scan_radius = self.radius * (1.5 if not self.can_reach_destination() else 1.0)
        scan_r_sq = scan_radius**2

        candidates = []
        for n in self.G.nodes:
            if n == self.current_node or self.G.has_edge(self.current_node, n):
                continue
            if self.G.degree(n) >= self.max_degree:
                continue
            nx_, ny_ = pos[n]
            if (cx - nx_) ** 2 + (cy - ny_) ** 2 > scan_r_sq:
                continue
            score = self.G.nodes[n]["battery"] - 0.05 * self._dest_hint(n)
            candidates.append((score, n))

        if not candidates:
            return False

        _, best = max(candidates)
        self.G.add_edge(self.current_node, best)
        self.reconnect_attempts += 1
        self.topology_events += 1
        return True

    def _mark_impossible(self):
        self.impossible = True
        self.repeater_sites = self.suggest_repeater_sites()
        return 35.0

    def _handle_disconnect(self, reward):
        """Store → reconnect → impossible gdy X nie może dotrzeć do Y."""
        if not list(self.G.neighbors(self.current_node)):
            if self.irl_mode and self.store_steps < self.max_store_steps:
                self.stored = True
                self.store_steps += 1
                reward -= 0.5
                self._update_physics()
                self._spread_gossip()

        if not self.can_reach_destination():
            while self.reconnect_attempts < self.max_reconnect_attempts:
                if not self._heuristic_reconnect():
                    break
                self._spread_gossip()
                if self.can_reach_destination():
                    state, neighbors = self._get_state()
                    return state, neighbors, reward + 2.0, False

            reward += self._mark_impossible()
            return None, [], reward, True

        state, neighbors = self._get_state()
        if neighbors:
            return state, neighbors, reward, False

        return None, [], reward - 10.0, True

    def _get_state(self):
        neighbors = list(self.G.neighbors(self.current_node))
        if not neighbors:
            return None, []

        bridge_nodes = {u for u, _ in nx.bridges(self.G)} if self.G.number_of_edges() else set()
        reachable = 1.0 if self.can_reach_destination() else 0.0
        states = []
        for n in neighbors:
            hint = self._dest_hint(n)
            if self.irl_mode and hint >= self.UNKNOWN_HOPS:
                hint = self._oracle_hops(n)
            states.append(
                [
                    self.G.nodes[self.current_node]["battery"],
                    self.G.nodes[n]["battery"],
                    self.G.degree(n) / self.max_degree,
                    self.G.nodes[n]["mobility"],
                    1.0 if n in bridge_nodes else 0.0,
                    self.hops / self.max_hops,
                    1.0 - self._normalize_hint(hint),
                    reachable,
                ]
            )

        return torch.tensor(states, dtype=torch.float32), neighbors

    def step(self, action_idx, neighbors):
        if action_idx >= len(neighbors):
            return self._handle_disconnect(-8.0)

        next_node = neighbors[action_idx]
        prev_oracle = self._oracle_hops(self.current_node)

        if self.irl_mode and not self.G.has_edge(self.current_node, next_node):
            return self._handle_disconnect(-5.0)

        self.hops += 1
        reward = -0.1
        done = False

        next_oracle = self._oracle_hops(next_node)
        if next_oracle < prev_oracle:
            reward += 2.5
        elif next_oracle > prev_oracle:
            reward -= 1.0

        if next_node in self.path:
            reward -= 2.0

        bridges = {(min(u, v), max(u, v)) for u, v in nx.bridges(self.G)} if self.G.number_of_edges() else set()
        edge = (min(self.current_node, next_node), max(self.current_node, next_node))
        if edge in bridges:
            reward -= 1.0

        self.current_node = next_node
        self.path.append(next_node)
        self.stored = False

        if next_node == self.destination:
            reward += 50.0
            done = True
            self.delivered = True
        elif self.hops >= self.max_hops:
            if not self.can_reach_destination():
                reward += self._mark_impossible()
            else:
                reward -= 10.0
            done = True

        if not done and self.irl_mode and self.physics_on_step:
            self._update_physics()
            self._spread_gossip()

        if not done and not self.can_reach_destination():
            return self._handle_disconnect(reward)

        next_state, next_neighbors = self._get_state()
        if not next_neighbors and not done:
            return self._handle_disconnect(reward)

        return next_state, next_neighbors, reward, done

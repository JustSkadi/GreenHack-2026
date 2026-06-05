import networkx as nx
import numpy as np
import torch


class MeshEnv:
    def __init__(
        self,
        num_nodes=50,
        radius=0.25,
        max_hops=15,
        max_degree=4,
        target_degree=3,
        edge_drop_prob=0.05,
        edge_add_prob=0.03,
    ):
        self.num_nodes = num_nodes
        self.radius = radius
        self.max_hops = max_hops
        self.max_degree = max_degree
        self.target_degree = target_degree
        self.edge_drop_prob = edge_drop_prob
        self.edge_add_prob = edge_add_prob
        self.reached_destination = False
        self.reset()

    def reset(self):
        self.G = self._build_graph()
        for i in self.G.nodes:
            self.G.nodes[i]["battery"] = np.random.uniform(0.1, 1.0)
        self.current_node = np.random.randint(1, self.num_nodes)
        self.priority = np.random.choice([1, 10])
        self.hops = 0
        self.reached_destination = False
        return self._get_state()

    def _build_graph(self):
        G = nx.random_geometric_graph(self.num_nodes, self.radius)
        self._cap_degree(G)
        self._ensure_command_node_connected(G)
        return G

    def _cap_degree(self, G):
        pos = nx.get_node_attributes(G, "pos")

        while True:
            over = [n for n, d in G.degree() if d > self.max_degree]
            if not over:
                break

            node = max(over, key=lambda n: G.degree(n))
            neighbors = list(G.neighbors(node))
            if not neighbors:
                break

            def edge_distance(other):
                x1, y1 = pos[node]
                x2, y2 = pos[other]
                return (x1 - x2) ** 2 + (y1 - y2) ** 2

            farthest = max(neighbors, key=edge_distance)
            G.remove_edge(node, farthest)

    def _ensure_command_node_connected(self, G):
        if 0 not in G or G.number_of_nodes() == 0:
            return

        pos = nx.get_node_attributes(G, "pos")
        components = list(nx.connected_components(G))
        if len(components) <= 1:
            return

        main = next(c for c in components if 0 in c)
        for comp in components:
            if comp is main:
                continue

            best = None
            for a in comp:
                for b in main:
                    if G.degree(a) >= self.max_degree or G.degree(b) >= self.max_degree:
                        continue
                    ax, ay = pos[a]
                    bx, by = pos[b]
                    dist = (ax - bx) ** 2 + (ay - by) ** 2
                    if best is None or dist < best[0]:
                        best = (dist, a, b)

            if best:
                G.add_edge(best[1], best[2])

    def _maybe_mutate_edges(self):
        pos = nx.get_node_attributes(self.G, "pos")

        if np.random.random() < self.edge_drop_prob:
            edges = list(self.G.edges())
            if edges:
                u, v = edges[np.random.randint(len(edges))]
                if self.G.degree(u) > 1 and self.G.degree(v) > 1:
                    self.G.remove_edge(u, v)

        if np.random.random() < self.edge_add_prob:
            nodes = list(self.G.nodes())
            a = nodes[np.random.randint(len(nodes))]
            ax, ay = pos[a]
            if self.G.degree(a) >= self.max_degree:
                return

            candidates = []
            for b in nodes:
                if b == a or self.G.has_edge(a, b):
                    continue
                if self.G.degree(b) >= self.max_degree:
                    continue
                bx, by = pos[b]
                dist = np.hypot(ax - bx, ay - by)
                if dist <= self.radius:
                    candidates.append((dist, b))

            if candidates:
                _, b = min(candidates)
                self.G.add_edge(a, b)

    def _get_state(self):
        neighbors = list(self.G.neighbors(self.current_node))
        if not neighbors:
            return None, []

        states = []
        for n in neighbors:
            deg = self.G.degree(n)
            bat = self.G.nodes[n]["battery"]
            try:
                dist = nx.shortest_path_length(self.G, n, 0)
            except nx.NetworkXNoPath:
                dist = 20
            states.append(
                [
                    self.G.nodes[self.current_node]["battery"],
                    bat,
                    deg / self.max_degree,
                    dist / self.max_hops,
                    self.priority / 10.0,
                ]
            )

        return torch.tensor(states, dtype=torch.float32), neighbors

    def _degree_reward(self, deg):
        if deg > self.max_degree:
            return -1.0
        if deg > self.target_degree:
            return -0.3
        if deg < 2:
            return -0.2
        if deg == self.target_degree:
            return 0.1
        return 0.0

    def step(self, action_idx, neighbors):
        next_node = neighbors[action_idx]
        self.hops += 1
        self.G.nodes[self.current_node]["battery"] -= 0.02

        reward = -0.1
        done = False
        deg = self.G.degree(next_node)
        bat = self.G.nodes[next_node]["battery"]

        reward += self._degree_reward(deg)
        if bat < 0.15:
            reward -= 5.0

        if next_node == 0:
            reward += 10.0 * self.priority
            done = True
            self.reached_destination = True
        elif self.hops > self.max_hops:
            reward -= 5.0
            done = True

        self.current_node = next_node
        self._maybe_mutate_edges()
        next_state, next_neighbors = self._get_state()
        if not next_neighbors and not done:
            reward -= 10.0
            done = True

        return next_state, next_neighbors, reward, done

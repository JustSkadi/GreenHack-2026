from __future__ import annotations
from collections import deque

import networkx as nx


class GovernmentServer:
    """Centralny serwer rządowy (węzeł ID=0, hop_count=0)."""

    def __init__(self):
        self.node_id: int = 0
        self.parent_id: int | None = None
        self.hop_count: int = 0
        self.neighbors: list[int] = []
        self.active: bool = True

    def build_routing_tree(self, physical_graph: nx.Graph, all_nodes: dict) -> dict:
        """BFS natychmiastowy (bez animacji) — używany do testów."""
        assignments = {}
        for node_id, parent_id, hop_count in self.build_routing_tree_steps(
            physical_graph, all_nodes
        ):
            assignments[node_id] = (parent_id, hop_count)
        return assignments

    def build_routing_tree_steps(self, physical_graph: nx.Graph, all_nodes: dict):
        """
        Generator BFS — yields (node_id, parent_id, hop_count) dla każdego
        odkrytego węzła. Na bieżąco ustawia parent_id i hop_count w all_nodes.
        Nie produkuje żadnego wyjścia — logowanie należy do simulation.py.
        """
        visited: set[int] = {self.node_id}
        queue: deque[tuple[int, int]] = deque([(self.node_id, 0)])

        while queue:
            current_id, current_hop = queue.popleft()
            for nbr in list(physical_graph.neighbors(current_id)):
                if nbr not in visited:
                    visited.add(nbr)
                    new_hop = current_hop + 1
                    node = all_nodes.get(nbr)
                    if node is not None:
                        node.parent_id = current_id
                        node.hop_count = new_hop
                    yield nbr, current_id, new_hop
                    queue.append((nbr, new_hop))

    def __repr__(self) -> str:
        return "GovernmentServer(id=0, hop=0, aktywny)"

import networkx as nx
import torch

from agent.net import TopologyAgent


def greedy_action(env, neighbors) -> int:
    """Heurystyka: sąsiad najbliżej Y (Dijkstra) — zawsze dostarcza gdy ścieżka istnieje."""
    return greedy_to(env.G, neighbors, env.destination, env.max_hops)


def greedy_to(G, neighbors, destination: int, max_hops: int) -> int:
    best_idx = 0
    best_dist = max_hops + 1
    for i, n in enumerate(neighbors):
        try:
            dist = nx.shortest_path_length(G, n, destination)
        except nx.NetworkXNoPath:
            dist = max_hops + 1
        if dist < best_dist:
            best_dist = dist
            best_idx = i
    return best_idx


def rl_action(net: TopologyAgent, state: torch.Tensor) -> int:
    with torch.no_grad():
        return int(torch.argmax(net(state)).item())

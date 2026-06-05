import networkx as nx
import numpy as np
import torch

class MeshEnv:
    def __init__(self, num_nodes=50, radius=0.25, max_hops=15):
        self.num_nodes = num_nodes
        self.radius = radius
        self.max_hops = max_hops
        self.reset()

    def reset(self):
        self.G = nx.random_geometric_graph(self.num_nodes, self.radius)
        for i in self.G.nodes:
            self.G.nodes[i]['battery'] = np.random.uniform(0.1, 1.0)
        self.current_node = np.random.randint(1, self.num_nodes)
        self.priority = np.random.choice([1, 10])
        self.hops = 0
        return self._get_state()

    def _get_state(self):
        neighbors = list(self.G.neighbors(self.current_node))
        if not neighbors: return None, []
        
        states = []
        for n in neighbors:
            deg = self.G.degree(n)
            bat = self.G.nodes[n]['battery']
            try:
                dist = nx.shortest_path_length(self.G, n, 0)
            except nx.NetworkXNoPath:
                dist = 20 
            states.append([self.G.nodes[self.current_node]['battery'], bat, deg, dist, self.priority])
            
        return torch.tensor(states, dtype=torch.float32), neighbors

    def step(self, action_idx, neighbors):
        next_node = neighbors[action_idx]
        self.hops += 1
        self.G.nodes[self.current_node]['battery'] -= 0.02
        
        reward = -0.1
        done = False
        deg = self.G.degree(next_node)
        bat = self.G.nodes[next_node]['battery']
        
        if deg > 3: reward -= 0.5
        if deg < 2: reward -= 0.2
        if bat < 0.15: reward -= 5.0
        
        if next_node == 0:
            reward += 10.0 * self.priority
            done = True
        elif self.hops > self.max_hops:
            reward -= 5.0
            done = True
            
        self.current_node = next_node
        next_state, next_neighbors = self._get_state()
        if not next_neighbors and not done:
            reward -= 10.0 
            done = True
            
        return next_state, next_neighbors, reward, done

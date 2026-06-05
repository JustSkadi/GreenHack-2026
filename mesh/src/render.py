import torch
import networkx as nx
import matplotlib.pyplot as plt
import matplotlib.animation as animation
import argparse
from env.mesh_env import MeshEnv
from agent.net import RouterMLP

def render():
    parser = argparse.ArgumentParser()
    # Pamiętaj, żeby przy odpalaniu podać ścieżkę do folderu wygenerowanego przez Hydrę!
    parser.add_argument('--weights', type=str, required=True, help="Ścieżka do np. outputs/baseline_mlp/2026-06-05_16-00-00/best_model.pt")
    parser.add_argument('--fps', type=int, default=10)
    args = parser.parse_args()

    net = RouterMLP(input_dim=5, hidden_dim=64)
    net.load_state_dict(torch.load(args.weights))
    net.eval()

    env = MeshEnv()
    state, neighbors = env.reset()
    
    fig, ax = plt.subplots(figsize=(10, 10))
    pos = nx.get_node_attributes(env.G, 'pos')

    def update(frame):
        nonlocal state, neighbors
        ax.clear()
        colors = ['red' if n == 0 else '#cccccc' for n in env.G.nodes]
        if env.current_node in env.G.nodes:
            colors[env.current_node] = '#00ff00' 
            
        nx.draw(env.G, pos, ax=ax, node_color=colors, node_size=100, edge_color='#eeeeee')
        ax.set_title(f"VoltMesh P2P Routing | Hops: {env.hops} | Priority: {env.priority}", fontsize=14)

        if state is not None:
            with torch.no_grad():
                action = torch.argmax(net(state)).item()
            state, neighbors, reward, done = env.step(action, neighbors)
            if done:
                state, neighbors = env.reset()

    ani = animation.FuncAnimation(fig, update, frames=300, interval=1000//args.fps)
    plt.show()

if __name__ == "__main__":
    render()

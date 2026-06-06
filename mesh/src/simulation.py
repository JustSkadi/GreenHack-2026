"""
Symulacja ratunkowej sieci ad-hoc z BFS routing tree i self-healing.

Uruchomienie:
    cd mesh
    uv run src/simulation.py
"""
from __future__ import annotations

import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import random
import time
from collections import deque

import matplotlib
if "--record" in sys.argv:
    matplotlib.use("Agg")   # headless przed import pyplot
    import imageio_ffmpeg
    matplotlib.rcParams["animation.ffmpeg_path"] = imageio_ffmpeg.get_ffmpeg_exe()
import matplotlib.animation as animation
import matplotlib.pyplot as plt
import networkx as nx
import numpy as np

from government_server import GovernmentServer
from network_node import NetworkNode

RECORD_MODE: bool = "--record" in sys.argv
RECORD_FPS:  int  = 60
RECORD_SECS: int  = 56
RECORD_OUT:  str  = "simulation_56s.mp4"

# Fake-zegar dla trybu nagrywania — wspólna komórka modyfikowana przez update()
_FAKE_T: list[float] = [0.0]


def _now() -> float:
    """Zwraca czas monotoniczny (realny lub symulowany w trybie --record)."""
    if RECORD_MODE:
        return _FAKE_T[0]
    return time.monotonic()


# ── Konfiguracja ──────────────────────────────────────────────────────────────
NUM_NODES: int = 150
RANGE_RADIUS: float = 0.22          # zasięg węzłów
SERVER_RANGE_RADIUS: float = 0.32   # większy zasięg serwera (widzi dalej)
RANDOM_SEED: int = 42
SERVER_POS: tuple[float, float] = (0.5, 0.5)   # serwer w centrum — węzły go otaczają

BFS_STEP_PAUSE: float = 0.13        # pauza animacji BFS [s]
FAILURE_DELAY_S: int = 3            # odliczanie przed awarią [s]
HEAL_STEP_PAUSE: float = 0.10       # pauza między krokami self-healing [s]

# Kolory wg poziomu hop (7 poziomów) — każdy hop wyraźnie inny kolor
HOP_COLORS = [
    "#00cfff",  # hop 1 – błękit (blisko serwera)
    "#00e676",  # hop 2 – szmaragdowa zieleń
    "#c6ff00",  # hop 3 – limonkowy żółtozielony
    "#ffd600",  # hop 4 – złoty
    "#ff6d00",  # hop 5 – głęboki pomarańcz
    "#d50000",  # hop 6 – głęboka czerwień
    "#aa00ff",  # hop 7+ – fiolet
]

MAX_CONNECTIONS: int = 4        # maks. połączeń zwykłego węzła
SERVER_MAX_CONNECTIONS: int = 50  # maks. połączeń serwera głównego (ID=0)
BG_DARK = "#0d1117"
BG_WINDOW = "#0d1117"
COLOR_UNDISCOVERED = "#1f2937"
COLOR_HEAL_FLASH = "#f39c12"   # flash węzła podczas naprawy
COLOR_AUTO_SPAWN = "#3b82f6"   # cyjan — auto-spawn

# Animacje krawędzi (render_multi style)
EDGE_NORMAL   = "#374151"      # kolor fizycznych krawędzi
EDGE_NEW      = "#3b82f6"      # nowa krawędź — niebieski flash
EDGE_GHOST    = "#ef4444"      # usunięta krawędź — czerwony zanik

# Auto-zdarzenia czasowe
AUTO_EVENT_INTERVAL: float = 2.8   # sekundy spokoju między kolejnymi auto-zdarzeniami
AUTO_SPAWN_PROB: float = 0.55      # prawdopodobieństwo spawnu (vs kill)
AUTO_MIN_NODES: int = 20           # poniżej tej liczby wymuszony spawn
AUTO_MAX_NODES: int = 151          # powyżej tej liczby wymuszony kill

SIM_TIME_SCALE: float = 0.1       # sek. symulacji na sek. rzeczywisty (10× spowolnienie)
OPTIMIZE_INTERVAL: float = 4.5    # sekundy między skanami optymalizacji routingu
AUTO_MSG_FIRST_DELAY: float = 5.0   # s od startu do pierwszej auto-wiadomości
AUTO_MSG_GAP: float = 1.8           # s przerwy między kolejnymi auto-wiadomościami
AUTO_MSG_SEQUENCE: int = 2          # liczba p2p przed broadcastem
BROADCAST_GAP: float = 2.0          # s po ostatniej p2p przed broadcastem
BROADCAST_EDGE_FRAMES: int = 28     # klatki na jeden hop broadcastu
BROADCAST_RESET_DELAY: float = 2.0  # s po zakończeniu broadcastu przed resetem
MSG_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"]

# FuncAnimation — ~60 FPS (jak render_multi)
INTERVAL_MS: int = 16             # ms między klatkami (~60 fps)
KILL_FLASH_FRAMES: int = 90       # klatki podświetlenia po kill+heal (~1.4 s)
DEAD_FADE_FRAMES: int = 125       # klatki zanim martwy węzeł zniknie (~2 s)
SPAWN_FLASH_FRAMES: int = 75      # klatki podświetlenia po spawn (~1.2 s)
OPT_FLASH_FRAMES: int = 90        # klatki komunikatu po optymalizacji (~1.4 s)
MSG_FRAMES_PER_EDGE: int = 28     # klatki na jeden przeskok pakietu
AREA_KM: float = 1.5              # rozmiar obszaru symulacji (km × km) — jak w render_multi
MSG_SRC_COLOR = "#f1c40f"         # żółty — węzeł nadawcy
MSG_DST_COLOR = "#e67e22"         # pomarańczowy — węzeł odbiorcy
MSG_PATH_COLOR = "#f1c40f"        # kolor podświetlenia ścieżki
MSG_P2P_COLOR = "#f59e0b"         # żółto-pomarańczowy — kolor sygnału p2p

# Animacje krawędzi — skalowane do 60 FPS
NEW_EDGE_FRAMES: int   = 90       # klatki niebieskiego podświetlenia nowej krawędzi
GHOST_EDGE_FRAMES: int = 110      # klatki zaniku usuniętej krawędzi

# Fizyka ruchu węzłów — dostosowana do kroku 16 ms
PHYSICS_DAMPING: float = 0.987    # tłumienie/klatkę (≈ 0.94^(80/16) w skali sekundy)
PHYSICS_FORCE: float   = 0.000135 # std losowej siły (skalowane √(16/80) × 0.00030)
PHYSICS_MAX_SPD: float = 0.00028  # maks. prędkość [j/klatkę] (0.0014 × 16/80)
EDGE_HYSTERESIS: float = 0.015    # bufor histerezji (niezależny od dt)


# ── Helpers grafu ────────────────────────────────────────────────────────────
def _can_add_edge(G: nx.Graph, u: int, v: int) -> bool:
    """True gdy obie strony mają jeszcze wolny slot."""
    limit_u = SERVER_MAX_CONNECTIONS if u == 0 else MAX_CONNECTIONS
    limit_v = SERVER_MAX_CONNECTIONS if v == 0 else MAX_CONNECTIONS
    return G.degree(u) < limit_u and G.degree(v) < limit_v


# ── Generowanie grafu ─────────────────────────────────────────────────────────
def generate_physical_graph(
    num_nodes: int, radius: float, seed: int
) -> tuple[nx.Graph, dict[int, tuple[float, float]]]:
    """
    Rozmieszcza węzły losowo w [0,1]², serwer (ID=0) stały w lewym-dolnym rogu.
    Łączy pary w zasięgu `radius`. Gwarantuje spójność grafu.
    """
    random.seed(seed)
    np.random.seed(seed)

    positions: dict[int, tuple[float, float]] = {0: SERVER_POS}
    for i in range(1, num_nodes):
        positions[i] = (
            random.random() * 0.93 + 0.04,
            random.random() * 0.93 + 0.04,
        )

    G = nx.Graph()
    G.add_nodes_from(range(num_nodes))

    for i in range(num_nodes):
        xi, yi = positions[i]
        for j in range(i + 1, num_nodes):
            xj, yj = positions[j]
            r = SERVER_RANGE_RADIUS if (i == 0 or j == 0) else radius
            if np.hypot(xi - xj, yi - yj) <= r and _can_add_edge(G, i, j):
                G.add_edge(i, j)

    while not nx.is_connected(G):
        comps = list(nx.connected_components(G))
        c1, c2 = list(comps[0]), list(comps[1])
        u, v = min(
            ((a, b) for a in c1 for b in c2),
            key=lambda p: np.hypot(
                positions[p[0]][0] - positions[p[1]][0],
                positions[p[0]][1] - positions[p[1]][1],
            ),
        )
        G.add_edge(u, v)
        print(f"[GRAPH] Dodano krawędź ({u},{v}) dla spójności.")

    return G, positions


# ── Inicjalizacja węzłów ──────────────────────────────────────────────────────
def build_node_dict(server: GovernmentServer, num_nodes: int) -> dict:
    nodes: dict = {0: server}
    for i in range(1, num_nodes):
        nodes[i] = NetworkNode(node_id=i)
    return nodes


def sync_neighbors(G: nx.Graph, node_dict: dict) -> None:
    for nid, node in node_dict.items():
        node.neighbors = list(G.neighbors(nid))


# ── Routing helpers ───────────────────────────────────────────────────────────
def get_routing_edges(node_dict: dict) -> list[tuple[int, int]]:
    return [
        (nid, node.parent_id)
        for nid, node in node_dict.items()
        if nid != 0 and node.active and node.parent_id is not None
    ]


def count_descendants(node_id: int, node_dict: dict) -> int:
    """Zlicza wszystkich potomków węzła w drzewie routingu (BFS po dzieciach)."""
    count = 0
    visited: set[int] = {node_id}
    queue: deque[int] = deque([node_id])
    while queue:
        nid = queue.popleft()
        for child_id, nd in node_dict.items():
            if nd.parent_id == nid and child_id not in visited:
                visited.add(child_id)
                count += 1
                queue.append(child_id)
    return count


# ── Wizualizacja ──────────────────────────────────────────────────────────────
def _smoothstep(t: float) -> float:
    return t * t * (3 - 2 * t)


def draw_network(
    ax: plt.Axes,
    G: nx.Graph,
    node_dict: dict,
    positions: dict,
    undiscovered: set | None = None,
    highlight_node: int | None = None,
    highlight_color: str = "white",
) -> None:
    """
    Rysuje sieć. Obsługuje trzy fazy wizualnie:
      BFS   : undiscovered=set()  + highlight_node = właśnie odkryty (biały flash)
      Awaria: highlight_node = zabity węzeł (czerwony flash)
      Heal  : highlight_node = uzdrawiany węzeł (pomarańczowy flash)
    """
    ax.clear()
    ax.set_facecolor(BG_DARK)
    ax.set_xlim(-0.02, 1.02)
    ax.set_ylim(-0.02, 1.02)

    if undiscovered is None:
        undiscovered = set()

    # Krawędzie fizyczne — niewidoczne (zasięg to wewnętrzny mechanizm, nie wizualizacja)

    # ── Krawędzie routingu (cienkie, szare) — tylko odkryte węzły
    routing_edges = [
        e for e in get_routing_edges(node_dict)
        if G.has_edge(*e) and e[0] not in undiscovered
    ]
    if routing_edges:
        nx.draw_networkx_edges(
            G, positions, ax=ax,
            edgelist=routing_edges, edge_color=EDGE_NORMAL, width=1.2, alpha=0.75,
        )

    # ── Serwer (większy okrągły węzeł)
    nx.draw_networkx_nodes(
        G, positions, ax=ax,
        nodelist=[0], node_color="gray", node_size=500,
    )

    # ── Węzły nieodkryte (faza BFS)
    undiscov_list = [n for n in undiscovered if n != highlight_node]
    if undiscov_list:
        nx.draw_networkx_nodes(
            G, positions, ax=ax,
            nodelist=undiscov_list, node_color=COLOR_UNDISCOVERED,
            node_size=70, alpha=0.70,
        )

    # ── Highlight: halo + wypełnienie (pomiń jeśli węzeł już usunięty)
    if highlight_node is not None and highlight_node in positions:
        nx.draw_networkx_nodes(
            G, positions, ax=ax,
            nodelist=[highlight_node], node_color=highlight_color,
            node_size=350, alpha=0.25,
        )
        nx.draw_networkx_nodes(
            G, positions, ax=ax,
            nodelist=[highlight_node], node_color=highlight_color,
            node_size=70, alpha=1.0,
        )

    # ── Węzły w drzewie (aktywne, odkryte, nie-highlight)
    in_tree = [
        n for n in node_dict
        if n != 0
        and node_dict[n].active
        and n not in undiscovered
        and n != highlight_node
    ]
    if in_tree:
        nx.draw_networkx_nodes(
            G, positions, ax=ax,
            nodelist=in_tree, node_color="#4b5563", node_size=70, alpha=1.0,
        )

    # ── Etykiety — tylko serwer
    labels: dict[int, str] = {0: "SRV"}
    nx.draw_networkx_labels(
        G, positions, labels, ax=ax, font_size=7, font_color="#9ca3af",
    )

    # Osie — styl identyczny jak render_multi (wartości w km)
    # labelbottom/labelleft=True przywraca widoczność po tym jak nx.draw_networkx_*
    # wywołuje _prepare_ax() ustawiające je na False
    ax.set_aspect("equal")
    ax.tick_params(
        axis="both", colors="#9ca3af", labelsize=9,
        bottom=True, left=True, labelbottom=True, labelleft=True,
    )
    for _spine in ax.spines.values():
        _spine.set_color("#374151")
    # Ticki co 0.2 km — identyczny interwał jak render_multi dla obszaru 1.5 km
    _km_step  = 0.2
    _tick_km  = np.arange(0.0, AREA_KM + _km_step * 0.5, _km_step)
    _tick_pos = _tick_km / AREA_KM
    ax.set_xticks(_tick_pos)
    ax.set_yticks(_tick_pos)
    ax.set_xticklabels([f"{k:g}" for k in _tick_km])
    ax.set_yticklabels([f"{k:g}" for k in _tick_km])
    ax.set_xlabel("km", color="#9ca3af", fontsize=10)
    ax.set_ylabel("km", color="#9ca3af", fontsize=10)


# ── Animacja BFS ──────────────────────────────────────────────────────────────
def animate_bfs(
    server: GovernmentServer,
    node_dict: dict,
    G: nx.Graph,
    positions: dict,
    ax: plt.Axes,
) -> None:
    total = len(node_dict) - 1
    undiscovered: set[int] = set(range(1, NUM_NODES))

    print(f"\n[BFS] === Animacja budowania drzewa ({total} węzłów) ===")

    # Stan zerowy: cała sieć "czeka"
    draw_network(
        ax, G, node_dict, positions,
        f"Inicjalizacja — serwer wysyła sygnał BFS do {total} węzłów",
        undiscovered=undiscovered,
    )
    plt.draw()
    plt.pause(1.2)

    step = 0
    for node_id, parent_id, hop_count in server.build_routing_tree_steps(G, node_dict):
        step += 1
        undiscovered.discard(node_id)
        remaining = len(undiscovered)

        print(
            f"  [{step:>2}/{total}]  węzeł {node_id:>2}  →  "
            f"rodzic: {parent_id:>2},  hop: {hop_count}  |  nieodkryte: {remaining}"
        )

        draw_network(
            ax, G, node_dict, positions,
            f"BFS [{step}/{total}]   węzeł {node_id} odkryty  "
            f"(hop={hop_count}, rodzic={parent_id})   nieodkryte: {remaining}",
            undiscovered=undiscovered,
            highlight_node=node_id,
            highlight_color="white",
        )
        plt.draw()
        plt.pause(BFS_STEP_PAUSE)

    max_hop = max(
        nd.hop_count for nid, nd in node_dict.items()
        if nid != 0 and nd.hop_count != float("inf")
    )
    print(f"[BFS] Zakończono — {step} węzłów, max hop_count: {int(max_hop)}\n")

    draw_network(
        ax, G, node_dict, positions,
        f"Drzewo BFS gotowe — {step} węzłów osiągalnych, max głębokość: {int(max_hop)}",
    )
    plt.draw()
    plt.pause(2.0)


# ── Self-healing ──────────────────────────────────────────────────────────────
def _needs_healing(nid: int, node_dict: dict) -> bool:
    node = node_dict[nid]
    if not node.active or nid == 0:
        return False
    if node.parent_id is None:
        return True
    parent = node_dict.get(node.parent_id)
    if parent is None or not parent.active or parent.hop_count == float("inf"):
        return True
    # Sprawdź czy fizyczna krawędź do rodzica jeszcze istnieje
    return node.parent_id not in node.neighbors


def run_self_healing(
    node_to_kill: int,
    node_dict: dict,
    ax: plt.Axes,
    G: nx.Graph,
    positions: dict,
) -> None:
    hop_k = int(node_dict[node_to_kill].hop_count)
    desc = count_descendants(node_to_kill, node_dict)
    orphans = [
        nid for nid, nd in node_dict.items()
        if nid != 0 and nd.active and nd.parent_id == node_to_kill
    ]

    print(f"\n{'═'*60}")
    print(f"  [AWARIA] Węzeł {node_to_kill} (hop={hop_k}) przestaje działać!")
    print(f"  Bezpośrednie dzieci: {orphans}")
    print(f"  Łączna liczba odciętych potomków: {desc}")
    print(f"{'═'*60}")

    # Zabij węzeł
    node_dict[node_to_kill].active = False
    node_dict[node_to_kill].parent_id = None
    node_dict[node_to_kill].hop_count = float("inf")

    draw_network(
        ax, G, node_dict, positions,
        f"AWARIA węzła {node_to_kill} (hop={hop_k}) — {desc} potomków odcięte!",
        highlight_node=node_to_kill,
        highlight_color="#e74c3c",
    )
    plt.draw()
    plt.pause(1.5)

    # Iteracyjne rundy naprawy
    changed = True
    round_num = 0

    while changed:
        round_num += 1
        changed = False
        print(f"\n  [RUNDA {round_num}] Szukam węzłów wymagających naprawy...")

        # Sortuj od najniższego hop do najwyższego (najpierw bliżej serwera)
        ordered = sorted(
            [nid for nid in node_dict if nid != 0],
            key=lambda nid: (
                node_dict[nid].hop_count
                if node_dict[nid].hop_count != float("inf")
                else 99_999
            ),
        )

        for nid in ordered:
            if not _needs_healing(nid, node_dict):
                continue

            old_parent = node_dict[nid].parent_id
            old_hop = node_dict[nid].hop_count

            node_dict[nid].handle_disconnection(node_dict)

            new_parent = node_dict[nid].parent_id
            new_hop = node_dict[nid].hop_count

            # Pomiń jeśli stan się nie zmienił
            if old_parent == new_parent and old_hop == new_hop:
                continue

            changed = True

            if new_parent is not None:
                h_color = COLOR_HEAL_FLASH
                status_txt = (
                    f"przepięty  →  rodzic: {new_parent},  hop: {int(new_hop)}"
                )
            else:
                h_color = "#e74c3c"
                status_txt = "IZOLOWANY — brak ścieżki do serwera"

            draw_network(
                ax, G, node_dict, positions,
                f"Self-healing  |  węzeł {nid}  {status_txt}",
                highlight_node=nid,
                highlight_color=h_color,
            )
            plt.draw()
            plt.pause(HEAL_STEP_PAUSE)

    # Raport końcowy
    final_healed = sum(
        1 for nid, nd in node_dict.items()
        if nid != 0 and nd.active and nd.hop_count != float("inf")
    )
    final_isolated = sum(
        1 for nid, nd in node_dict.items()
        if nid != 0 and nd.active and nd.hop_count == float("inf")
    )

    print(f"\n[WYNIK] Self-healing zakończony po {round_num} rundach:")
    for nid in sorted(node_dict):
        if nid == 0:
            continue
        nd = node_dict[nid]
        if not nd.active:
            print(f"  Węzeł {nid:>3}: ✗ MARTWY")
        elif nd.hop_count == float("inf"):
            print(f"  Węzeł {nid:>3}: ⚠ IZOLOWANY")
        else:
            print(
                f"  Węzeł {nid:>3}: ✓  rodzic: {nd.parent_id:>3}  "
                f"hop: {int(nd.hop_count)}"
            )
    print(
        f"\n  Aktywne w sieci: {final_healed}  |  Izolowane: {final_isolated}  "
        f"|  Martwe: 1"
    )

    return final_healed, final_isolated


# ── Tryb interaktywny ────────────────────────────────────────────────────────
def _find_nearest_node(
    cx: float, cy: float, positions: dict, threshold: float = 0.06
) -> int | None:
    """Zwraca ID węzła najbliższego kliknięciu lub None jeśli za daleko."""
    nid = min(positions, key=lambda n: np.hypot(cx - positions[n][0], cy - positions[n][1]))
    return nid if np.hypot(cx - positions[nid][0], cy - positions[nid][1]) <= threshold else None


def _status_title(node_dict: dict) -> str:
    active = sum(1 for n, nd in node_dict.items() if n != 0 and nd.active and nd.hop_count != float("inf"))
    dead   = sum(1 for nd in node_dict.values() if not nd.active)
    iso    = sum(1 for n, nd in node_dict.items() if n != 0 and nd.active and nd.hop_count == float("inf"))
    return (
        f"LPM: wyłącz węzeł  |  PPM: dodaj węzeł  —  "
        f"aktywne: {active}  |  izolowane: {iso}  |  martwe: {dead}"
    )


def add_node(
    cx: float,
    cy: float,
    node_dict: dict,
    G: nx.Graph,
    positions: dict,
    next_id: list[int],
) -> int:
    """
    Tworzy nowy węzeł w (cx, cy), łączy krawędziami fizycznymi ze wszystkimi
    istniejącymi węzłami w zasięgu RANGE_RADIUS i aktualizuje listy sąsiadów.
    Routing (handle_disconnection) musi być wywołany osobno przez caller.
    """
    new_id = next_id[0]
    next_id[0] += 1

    new_node = NetworkNode(node_id=new_id)
    node_dict[new_id] = new_node
    positions[new_id] = (cx, cy)
    G.add_node(new_id)

    # Kandydaci w zasięgu z wolnym slotem; sortuj po hop_count (im bliżej serwera, tym lepszy)
    candidates = sorted(
        [
            nid for nid, pos in positions.items()
            if nid != new_id
            and np.hypot(cx - pos[0], cy - pos[1]) <= RANGE_RADIUS
            and G.degree(nid) < (SERVER_MAX_CONNECTIONS if nid == 0 else MAX_CONNECTIONS)
        ],
        key=lambda n: node_dict[n].hop_count if n in node_dict else float("inf"),
    )
    in_range = candidates[:MAX_CONNECTIONS]   # nowy węzeł też ma limit MAX_CONNECTIONS
    for nid in in_range:
        G.add_edge(new_id, nid)

    new_node.neighbors = in_range
    for nid in in_range:
        if nid in node_dict:
            node_dict[nid].neighbors = list(G.neighbors(nid))

    print(f"\n[DODANO] Węzeł {new_id} w ({cx:.2f}, {cy:.2f})")
    print(f"  Sąsiedzi w zasięgu {RANGE_RADIUS}: {in_range}")
    return new_id


# ── Aktywne podpinanie izolowanych węzłów ────────────────────────────────────
def reconnect_isolated_nodes(
    node_dict: dict, positions: dict, G: nx.Graph
) -> list[int]:
    """
    Dla każdego aktywnego węzła z hop_count=inf i wolnym slotem fizycznym:
    szuka węzłów w zasięgu posortowanych rosnąco po G.degree() i łączy do
    pierwszego który (a) jest w sieci (hop_count < inf) i (b) ma wolny slot.
    Zwraca listę ID węzłów, które dostały nowe połączenie fizyczne.
    """
    reconnected: list[int] = []
    for nid in list(node_dict.keys()):
        nd = node_dict.get(nid)
        if nd is None or not nd.active or nid == 0:
            continue
        if nd.hop_count != float("inf"):
            continue
        if G.degree(nid) >= MAX_CONNECTIONS:
            continue
        cx, cy = positions[nid]
        candidates = sorted(
            [
                other_id
                for other_id in positions
                if other_id != nid
                and node_dict.get(other_id) is not None
                and node_dict[other_id].active
                and node_dict[other_id].hop_count != float("inf")
                and G.degree(other_id) < (SERVER_MAX_CONNECTIONS if other_id == 0 else MAX_CONNECTIONS)
                and np.hypot(
                    cx - positions[other_id][0], cy - positions[other_id][1]
                ) <= (SERVER_RANGE_RADIUS if other_id == 0 else RANGE_RADIUS)
            ],
            key=lambda oid: G.degree(oid),  # od najmniejszego do największego stopnia
        )
        if candidates:
            target = candidates[0]
            G.add_edge(nid, target)
            node_dict[nid].neighbors    = list(G.neighbors(nid))
            node_dict[target].neighbors = list(G.neighbors(target))
            reconnected.append(nid)
    return reconnected


# ── Optymalizacja routingu ────────────────────────────────────────────────────
def optimize_all_routes(node_dict: dict) -> list[tuple[int, float, float]]:
    """
    Pełen skan sieci: każdy aktywny węzeł sprawdza czy nie pojawiła się krótsza
    ścieżka do serwera (mniejszy hop_count). Naprawia też izolowane węzły, które
    mają teraz dostępnych sąsiadów z połączeniem do serwera.

    Działa w pętli aż do stabilizacji — poprawki kaskadują wzdłuż drzewa.
    Zwraca listę zmian: [(node_id, stary_hop, nowy_hop), ...].

    Warunek poprawy: new_hop < old_hop (działa też dla izolowanych, bo inf > każda liczba).
    Przetwarza od najniższego hop do najwyższego, dzięki czemu węzeł, który właśnie
    odzyskał połączenie, może w tej samej rundzie poprawić hop swoich dzieci.
    """
    all_changes: list[tuple[int, float, float]] = []
    changed = True

    while changed:
        changed = False
        ordered = sorted(
            [nid for nid in node_dict if nid != 0 and node_dict[nid].active],
            key=lambda nid: (
                node_dict[nid].hop_count
                if node_dict[nid].hop_count != float("inf")
                else 99_999
            ),
        )
        for nid in ordered:
            node = node_dict[nid]
            best_parent_id: int | None = None
            best_hop = float("inf")

            for nbr_id in node.neighbors:
                nbr = node_dict.get(nbr_id)
                if nbr is None or not nbr.active or nbr.hop_count == float("inf"):
                    continue
                candidate = nbr.hop_count + 1
                if candidate < best_hop:
                    best_hop = candidate
                    best_parent_id = nbr_id

            # float("inf") > best_hop dla każdej skończonej wartości →
            # warunek automatycznie obejmuje izolowane węzły
            if best_parent_id is not None and best_hop < node.hop_count:
                old_hop = node.hop_count
                node.parent_id = best_parent_id
                node.hop_count = best_hop
                all_changes.append((nid, old_hop, best_hop))
                changed = True

    return all_changes


# ── Fizyka ruchu ─────────────────────────────────────────────────────────────
def physics_step(
    node_dict: dict,
    positions: dict,
    velocities: dict,
    G: nx.Graph,
) -> tuple[list[tuple[int, int]], list[tuple[int, int]]]:
    """
    Jeden krok fizyki (50 ms):
    • Przesuwa aktywne węzły (losowe siły + momentum + odbicia od granic).
    • Przelicza krawędzie fizyczne z histerezą (EDGE_HYSTERESIS) — zapobiega
      migotaniu połączeń gdy węzeł jest dokładnie na granicy zasięgu.
    • Aktualizuje listy sąsiadów dotkniętych węzłów.
    Zwraca (usunięte_krawędzie, dodane_krawędzie).
    """
    # Ruch
    for nid, node in node_dict.items():
        if nid == 0 or not node.active:
            continue
        if nid not in velocities:
            velocities[nid] = [0.0, 0.0]

        vx, vy = velocities[nid]
        vx = vx * PHYSICS_DAMPING + random.gauss(0, PHYSICS_FORCE)
        vy = vy * PHYSICS_DAMPING + random.gauss(0, PHYSICS_FORCE)

        spd = np.hypot(vx, vy)
        if spd > PHYSICS_MAX_SPD:
            vx, vy = vx / spd * PHYSICS_MAX_SPD, vy / spd * PHYSICS_MAX_SPD

        x, y = positions[nid]
        x += vx
        y += vy

        if x < 0.02:   x, vx = 0.02,  abs(vx)
        elif x > 0.98: x, vx = 0.98, -abs(vx)
        if y < 0.02:   y, vy = 0.02,  abs(vy)
        elif y > 0.98: y, vy = 0.98, -abs(vy)

        velocities[nid] = [vx, vy]
        positions[nid]  = (x, y)

    # Przelicz krawędzie (histereza: połącz ≤ RANGE_RADIUS, rozłącz > +HYSTERESIS)
    removed: list[tuple[int, int]] = []
    added:   list[tuple[int, int]] = []
    ids = list(positions.keys())

    for i in range(len(ids)):
        u = ids[i]
        xu, yu = positions[u]
        for j in range(i + 1, len(ids)):
            v = ids[j]
            xv, yv = positions[v]
            dist     = np.hypot(xu - xv, yu - yv)
            had_edge = G.has_edge(u, v)
            r = SERVER_RANGE_RADIUS if (u == 0 or v == 0) else RANGE_RADIUS

            if had_edge and dist > r + EDGE_HYSTERESIS:
                G.remove_edge(u, v)
                removed.append((u, v))
            elif not had_edge and dist <= r and _can_add_edge(G, u, v):
                # Martwy węzeł nie nawiązuje nowych połączeń
                u_active = node_dict.get(u, None)
                v_active = node_dict.get(v, None)
                if (u_active is None or u_active.active) and (v_active is None or v_active.active):
                    G.add_edge(u, v)
                    added.append((u, v))

    # Odśwież neighbors tylko dla dotkniętych węzłów
    if removed or added:
        touched: set[int] = set()
        for a, b in removed + added:
            touched.add(a)
            touched.add(b)
        for nid in touched:
            if nid in node_dict:
                node_dict[nid].neighbors = list(G.neighbors(nid))

    return removed, added


def silent_routing_update(
    removed: list[tuple[int, int]],
    added:   list[tuple[int, int]],
    node_dict: dict,
) -> None:
    """
    Cicha aktualizacja routingu po fizycznej zmianie grafu (brak animacji).
    • Zerwane krawędzie → iteracyjne handle_disconnection dla osieroconych węzłów.
    • Nowe krawędzie  → optimize_all_routes (krótsze ścieżki + przywracanie izolowanych).
    Loguje tylko przejścia między stanami: połączony ↔ izolowany.
    """
    if removed:
        changed = True
        while changed:
            changed = False
            ordered = sorted(
                [nid for nid in node_dict if nid != 0 and node_dict[nid].active],
                key=lambda nid: (
                    node_dict[nid].hop_count if node_dict[nid].hop_count != float("inf") else 99_999
                ),
            )
            for nid in ordered:
                if not _needs_healing(nid, node_dict):
                    continue
                was_iso = node_dict[nid].hop_count == float("inf")
                reconnected = node_dict[nid].handle_disconnection(node_dict)
                now_iso = node_dict[nid].hop_count == float("inf")
                if not was_iso and now_iso:
                    print(f"  [RUCH] Węzeł {nid} — sygnał zerwany")
                # changed=True tylko gdy węzeł faktycznie się przepiął;
                # izolowany (reconnected=False) nic nie zmienił → nie pętlimy
                if reconnected:
                    changed = True

    if added:
        changes = optimize_all_routes(node_dict)
        for nid, old_h, new_h in changes:
            if old_h == float("inf"):
                print(f"  [RUCH] Węzeł {nid} — przywrócony do sieci (hop {int(new_h)})")


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    random.seed(RANDOM_SEED)
    np.random.seed(RANDOM_SEED)
    print("=" * 60)
    print("   SYSTEM RATUNKOWEJ SIECI AD-HOC — BFS + SELF-HEALING")
    print("=" * 60)

    G, positions = generate_physical_graph(NUM_NODES, RANGE_RADIUS, RANDOM_SEED)
    avg_deg = 2 * G.number_of_edges() / G.number_of_nodes()
    print(
        f"\n[INIT] Graf: {G.number_of_nodes()} węzłów, "
        f"{G.number_of_edges()} krawędzi, śr. stopień: {avg_deg:.1f}"
    )

    server = GovernmentServer()
    node_dict = build_node_dict(server, NUM_NODES)
    sync_neighbors(G, node_dict)

    velocities: dict[int, list[float]] = {
        nid: [0.0, 0.0] if nid == 0 else [
            random.gauss(0, PHYSICS_MAX_SPD * 0.25),
            random.gauss(0, PHYSICS_MAX_SPD * 0.25),
        ]
        for nid in node_dict
    }

    fig, ax = plt.subplots(figsize=(10, 10))
    fig.patch.set_facecolor(BG_WINDOW)
    plt.tight_layout(pad=1.5)

    # Uruchom BFS natychmiastowo (bez animacji)
    for _ in server.build_routing_tree_steps(G, node_dict):
        pass

    # Współdzielony stan animacji (dict pozwala na mutację wewnątrz domknięcia)
    state: dict = {
        "phase": "interactive",  # zawsze interaktywny (BFS uruchomiony przed animacją)
        "flash_title": "",
        "flash_frames": 0,       # pozostałe klatki komunikatu flash
        "hl_node": None,         # podświetlony węzeł
        "hl_color": "white",
        "hl_frames": 0,          # pozostałe klatki podświetlenia
        "pending_kill": [],
        "pending_add": [],
        "next_node_id": [NUM_NODES],
        "last_auto_t": _now(),
        "last_optimize_t": _now(),
        "last_auto_msg_t": _now(),            # czas ostatniego zakończenia/startu
        "msg_auto_count": 0,                   # ile p2p wiadomości ukończono
        "msg_is_auto": False,                  # czy bieżąca wiadomość to auto
        "broadcast_active": False,
        "broadcast_done": set(),               # węzły już "żółte"
        "broadcast_inflight": [],              # [{src, dst, t}] — pakiety w locie
        "broadcast_reset_t": None,             # czas zakończenia broadcastu
        "bc_pulse": {},              # {nid: klatki_pulsu} przy odbiorze broadcast
        "sim_start_t": _now(),                   # bazowy czas do timera symulacji
        "dead_timers": {},           # {nid: klatki_do_usunięcia}
        "new_edges":   {},           # {(u,v): klatki_niebieskiego_flashu}
        "ghost_edges": {},           # {(u,v): klatki_czerwonego_zaniku}
        # Wysyłanie wiadomości — routing dynamiczny hop-by-hop
        "selected": [],        # zaznaczone węzły (max 2)
        "msg_current": None,   # węzeł, przy którym pakiet aktualnie jest
        "msg_next": None,      # węzeł, do którego pakiet leci w tej chwili
        "msg_target": None,    # cel końcowy
        "msg_src": None,       # nadawca (do logów/wyświetlania)
        "msg_phase": "up",     # "up" → serwer | "down" → cel
        "msg_traversed": [],   # krawędzie (from,to) już przebyte
        "msg_edge_frame": 0,   # interpolacja 0..MSG_FRAMES_PER_EDGE
        "msg_reroutes": 0,     # licznik przekierowań przez serwer
        "msg_color": MSG_P2P_COLOR,  # kolor bieżącej wiadomości
    }

    # ── Pomocnicze ────────────────────────────────────────────────────────────

    def flash(
        title: str, frames: int,
        node: int | None = None, color: str = "white",
    ) -> None:
        state["flash_title"] = title
        state["flash_frames"] = frames
        if node is not None:
            state["hl_node"] = node
            state["hl_color"] = color
            state["hl_frames"] = frames

    def _track_edges(removed: list, added: list) -> None:
        """Aktualizuje ghost_edges i new_edges po zmianie grafu fizycznego."""
        for u, v in added:
            key = (min(u, v), max(u, v))
            state["new_edges"][key]   = NEW_EDGE_FRAMES
            state["ghost_edges"].pop(key, None)
        for u, v in removed:
            key = (min(u, v), max(u, v))
            state["ghost_edges"][key] = GHOST_EDGE_FRAMES
            state["new_edges"].pop(key, None)

    def _draw_edge_overlays() -> None:
        """Rysuje nowe krawędzie (niebieski flash) i ghost-edges (czerwony zanik)."""
        # Nowe krawędzie — niebieski, zanika do normalnego
        to_del = []
        for (u, v), frames in list(state["new_edges"].items()):
            if u in positions and v in positions and G.has_edge(u, v):
                t = frames / NEW_EDGE_FRAMES
                ax.plot(
                    [positions[u][0], positions[v][0]],
                    [positions[u][1], positions[v][1]],
                    color=EDGE_NEW, alpha=t * 0.85, linewidth=2.2, zorder=2,
                )
            state["new_edges"][(u, v)] -= 1
            if state["new_edges"][(u, v)] <= 0:
                to_del.append((u, v))
        for k in to_del:
            del state["new_edges"][k]

        # Ghost-edges — czerwony, zanika do zera
        to_del = []
        for (u, v), frames in list(state["ghost_edges"].items()):
            if u in positions and v in positions:
                t = frames / GHOST_EDGE_FRAMES
                ax.plot(
                    [positions[u][0], positions[v][0]],
                    [positions[u][1], positions[v][1]],
                    color=EDGE_GHOST, alpha=t * 0.65, linewidth=1.6, zorder=2,
                )
            state["ghost_edges"][(u, v)] -= 1
            if state["ghost_edges"][(u, v)] <= 0:
                to_del.append((u, v))
        for k in to_del:
            del state["ghost_edges"][k]

    def instant_kill_heal(nid: int) -> None:
        """Natychmiastowe wyłączenie węzła + iteracyjne self-healing (bez animacji)."""
        if not node_dict[nid].active:
            return
        node_dict[nid].active = False
        node_dict[nid].parent_id = None
        node_dict[nid].hop_count = float("inf")
        # Usuń wszystkie krawędzie fizyczne natychmiast — wolne sloty dla żywych węzłów
        for nbr in list(G.neighbors(nid)):
            G.remove_edge(nid, nbr)
            if nbr in node_dict:
                node_dict[nbr].neighbors = list(G.neighbors(nbr))
        node_dict[nid].neighbors = []
        # Zaplanuj całkowite usunięcie węzła po DEAD_FADE_FRAMES klatkach
        state["dead_timers"][nid] = DEAD_FADE_FRAMES
        changed = True
        while changed:
            changed = False
            for hid in sorted(
                [n for n in node_dict if n != 0 and node_dict[n].active],
                key=lambda n: (
                    node_dict[n].hop_count
                    if node_dict[n].hop_count != float("inf")
                    else 99_999
                ),
            ):
                if _needs_healing(hid, node_dict):
                    if node_dict[hid].handle_disconnection(node_dict):
                        changed = True

    def _path_to_server(start: int) -> list[int] | None:
        """Ścieżka od start do serwera (0) idąc po parent_id. None gdy izolowany."""
        path: list[int] = [start]
        current = start
        seen: set[int] = {start}
        while current != 0:
            p = node_dict[current].parent_id
            if p is None or p in seen:
                return None
            path.append(p)
            seen.add(p)
            current = p
        return path  # [start, ..., 0]

    # ── Helpery animacji wiadomości ───────────────────────────────────────────

    def _msg_clear() -> None:
        if state["msg_is_auto"]:
            state["last_auto_msg_t"] = _now()
        state["msg_is_auto"]    = False
        state["msg_current"]    = None
        state["msg_next"]       = None
        state["msg_target"]     = None
        state["msg_src"]        = None
        state["msg_phase"]      = "up"
        state["msg_traversed"]  = []
        state["msg_edge_frame"] = 0
        state["msg_reroutes"]   = 0
        state["selected"].clear()

    def _msg_complete() -> None:
        src   = state["msg_src"]
        dst   = state["msg_target"]
        hops  = len(state["msg_traversed"])
        rer   = state["msg_reroutes"]
        r_str = f", {rer} przekier." if rer else ""
        print(f"[MSG] Dostarczona: {src} → {dst}  ({hops} przeskoków{r_str})")
        if state["msg_is_auto"]:
            state["msg_auto_count"] += 1
            state["last_auto_msg_t"] = _now()
            state["msg_is_auto"] = False
        _msg_clear()


    def _msg_compute_down_next() -> None:
        """Wyznacza msg_next dla fazy 'down' na podstawie bieżącego routingu."""
        dst = state["msg_target"]
        cur = state["msg_current"]
        if cur == dst:
            _msg_complete()
            return
        p = _path_to_server(dst)          # [dst, ..., server]
        if p is None:
            print(f"[MSG] Węzeł {dst} izolowany — wiadomosc utracona")
            flash(f"Blad: węzeł {dst} izolowany — wiadomosc utracona",
                  KILL_FLASH_FRAMES, dst, "#e74c3c")
            _msg_clear()
            return
        if cur not in p:
            # Wypadliśmy ze ścieżki — wróć do serwera
            state["msg_reroutes"] += 1
            state["msg_current"] = 0
            cur = 0
        if cur not in p:
            _msg_clear()
            return
        idx = p.index(cur)
        if idx == 0:
            _msg_complete()
            return
        state["msg_next"] = p[idx - 1]

    def _msg_reroute(reason: str) -> None:
        state["msg_reroutes"] += 1
        dst = state["msg_target"]
        print(f"[MSG] Przekierowanie ({reason}) — serwer wyznacza nową trasę")
        flash(f"Przekierowanie: {reason}",
              MSG_FRAMES_PER_EDGE * 2)
        state["msg_current"]    = 0
        state["msg_phase"]      = "down"
        state["msg_edge_frame"] = 0
        _msg_compute_down_next()

    def _start_message() -> None:
        src, dst = state["selected"][0], state["selected"][1]
        nd_src = node_dict.get(src)
        nd_dst = node_dict.get(dst)
        if nd_src is None or not nd_src.active:
            print(f"[MSG] Węzeł {src} nieaktywny.")
            state["selected"].clear()
            return
        if nd_dst is None or not nd_dst.active:
            print(f"[MSG] Węzeł {dst} nieaktywny.")
            state["selected"].clear()
            return
        first_hop = nd_src.parent_id
        if first_hop is None or not G.has_edge(src, first_hop):
            print(f"[MSG] Węzeł {src} izolowany — nie może wysłać wiadomości.")
            state["selected"].clear()
            return
        if _path_to_server(dst) is None:
            print(f"[MSG] Węzeł {dst} izolowany — nie może odebrać wiadomości.")
            state["selected"].clear()
            return
        # Inicjalizacja
        state["msg_current"]    = src
        state["msg_next"]       = first_hop
        state["msg_target"]     = dst
        state["msg_src"]        = src
        state["msg_phase"]      = "up"
        state["msg_traversed"]  = []
        state["msg_edge_frame"] = 0
        state["msg_reroutes"]   = 0
        print(f"[MSG] Wysyłanie: {src} → serwer → {dst}  "
              f"(pierwszy hop: {first_hop})")
        flash(f"Wysyłanie: węzeł {src} → serwer → węzeł {dst}",
              MSG_FRAMES_PER_EDGE * 2, src, state["msg_color"])

    # ── FuncAnimation update ──────────────────────────────────────────────────

    def update(_frame: int) -> list:
        if RECORD_MODE:
            _FAKE_T[0] = state["sim_start_t"] + _frame * (INTERVAL_MS / 1000.0)
        _sim_t = (_now() - state["sim_start_t"]) * SIM_TIME_SCALE
        # ── Usuwanie martwych węzłów (po upływie timera) ──────────────────────
        for dead_nid in [n for n, t in state["dead_timers"].items() if t <= 0]:
            del state["dead_timers"][dead_nid]
            node_dict.pop(dead_nid, None)
            positions.pop(dead_nid, None)
            velocities.pop(dead_nid, None)
            if G.has_node(dead_nid):
                G.remove_node(dead_nid)
            # Wyczyść wszystkie referencje do usuniętego węzła w stanie animacji
            if state["hl_node"] == dead_nid:
                state["hl_node"] = None
                state["hl_frames"] = 0
            if dead_nid in state["selected"]:
                state["selected"].remove(dead_nid)
            if state["msg_current"] == dead_nid:
                _msg_clear()
            if state["msg_target"] == dead_nid or state["msg_src"] == dead_nid:
                _msg_clear()
        for dead_nid in state["dead_timers"]:
            state["dead_timers"][dead_nid] -= 1

        # ── Faza interaktywna ─────────────────────────────────────────────────
        now = _now()

        # Fizyka (każda klatka)
        removed_e, added_e = physics_step(node_dict, positions, velocities, G)
        _track_edges(removed_e, added_e)
        if removed_e or added_e:
            silent_routing_update(removed_e, added_e, node_dict)

        # Optymalizacja routingu (timer)
        if now - state["last_optimize_t"] >= OPTIMIZE_INTERVAL:
            state["last_optimize_t"] = now
            # Aktywne podpinanie węzłów izolowanych (brak połączenia fizycznego do sieci)
            recon = reconnect_isolated_nodes(node_dict, positions, G)
            for nid in recon:
                node_dict[nid].handle_disconnection(node_dict)
            changes = optimize_all_routes(node_dict)
            if changes and state["flash_frames"] <= 0:
                rec = sum(1 for _, old, _ in changes if old == float("inf"))
                srt = len(changes) - rec
                print(f"[OPT] {rec} przywrócone, {srt} skrócone ścieżki")
                flash(
                    f"[OPT] {rec} węzłów przywrócono  +  {srt} skróciło ścieżkę",
                    OPT_FLASH_FRAMES,
                )

        # Auto-zdarzenia (timer)
        if (now - state["last_auto_t"] >= AUTO_EVENT_INTERVAL
                and not state["pending_kill"] and not state["pending_add"]):
            state["last_auto_t"] = now
            active = [n for n, nd in node_dict.items() if n != 0 and nd.active]
            must_spawn = len(active) <= AUTO_MIN_NODES
            must_kill  = len(active) >= AUTO_MAX_NODES
            do_spawn   = must_spawn or (not must_kill and random.random() < AUTO_SPAWN_PROB)
            if do_spawn:
                cx, cy = random.uniform(0.04, 0.96), random.uniform(0.04, 0.96)
                state["pending_add"].append((cx, cy))
                print(f"[AUTO] Spawn w ({cx:.2f}, {cy:.2f})  [aktywnych: {len(active)}]")
            else:
                victim = random.choice(active)
                state["pending_kill"].append(victim)
                h = node_dict[victim].hop_count
                print(f"[AUTO] Kill węzła {victim} "
                      f"(hop={'∞' if h == float('inf') else int(h)})  "
                      f"[aktywnych: {len(active)}]")

        # Przetwarzanie kolejek — tylko gdy poprzedni flash wygasł
        if state["flash_frames"] <= 0:
            if state["pending_kill"]:
                nid = state["pending_kill"].pop(0)
                if nid in node_dict and node_dict[nid].active:
                    h    = node_dict[nid].hop_count
                    hop_k = int(h) if h != float("inf") else "∞"
                    desc  = count_descendants(nid, node_dict)
                    print(f"[KILL] Węzeł {nid} (hop={hop_k}, {desc} potomków)")
                    instant_kill_heal(nid)
                    flash(
                        f"Węzeł {nid} wyłączony — sieć przepięta",
                        KILL_FLASH_FRAMES, nid, "#e74c3c",
                    )

            elif state["pending_add"]:
                cx, cy = state["pending_add"].pop(0)
                new_id = add_node(cx, cy, node_dict, G, positions, state["next_node_id"])
                velocities[new_id] = [
                    random.gauss(0, PHYSICS_FORCE * 2),
                    random.gauss(0, PHYSICS_FORCE * 2),
                ]
                node_dict[new_id].handle_disconnection(node_dict)
                # Jeśli nadal izolowany — aktywnie szukaj sąsiada o najmniejszym stopniu
                if node_dict[new_id].hop_count == float("inf"):
                    recon = reconnect_isolated_nodes(node_dict, positions, G)
                    if new_id in recon:
                        node_dict[new_id].handle_disconnection(node_dict)
                if node_dict[new_id].parent_id is not None:
                    hop = int(node_dict[new_id].hop_count)
                    par = node_dict[new_id].parent_id
                    print(f"[SPAWN] Węzeł {new_id} → rodzic: {par}, hop: {hop}")
                    t = f"Węzeł {new_id} dołączył  →  rodzic: {par}, hop: {hop}"
                else:
                    print(f"[SPAWN] Węzeł {new_id} — izolowany")
                    t = f"Węzeł {new_id} izolowany — brak ścieżki do serwera"
                flash(t, SPAWN_FLASH_FRAMES, new_id, COLOR_AUTO_SPAWN)

        # Auto-wiadomości sekwencja (3× p2p → broadcast)
        _count = state["msg_auto_count"]
        if (state["msg_current"] is None and not state["selected"]
                and not state["broadcast_active"]):
            if _count < AUTO_MSG_SEQUENCE:
                _delay = AUTO_MSG_FIRST_DELAY if _count == 0 else AUTO_MSG_GAP
                if now - state["last_auto_msg_t"] >= _delay:
                    _cands = [n for n, nd in node_dict.items()
                               if n != 0 and nd.active and nd.hop_count != float("inf")]
                    if len(_cands) >= 2:
                        _src, _dst = random.sample(_cands, 2)
                        state["msg_color"]  = MSG_P2P_COLOR
                        state["msg_is_auto"] = True
                        state["selected"]   = [_src, _dst]
                        _start_message()
            elif (_count == AUTO_MSG_SEQUENCE
                  and not state["broadcast_done"]
                  and state["broadcast_reset_t"] is None
                  and now - state["last_auto_msg_t"] >= BROADCAST_GAP):
                # Inicjuj broadcast — pakiety z serwera do jego dzieci
                _children0 = [n for n, nd in node_dict.items()
                               if n != 0 and nd.active and nd.parent_id == 0]
                state["broadcast_done"]     = {0}
                state["broadcast_inflight"] = [
                    {"src": 0, "dst": c, "t": 0.0} for c in _children0
                ]
                state["broadcast_active"] = True
                print("[BROADCAST] Serwer nadaje do całej sieci!")

        # Broadcast — płynne pakiety krawędź po krawędzi
        if state["broadcast_active"]:
            _arrived = []
            for _pkt in state["broadcast_inflight"]:
                _pkt["t"] += 1.0 / BROADCAST_EDGE_FRAMES
                if _pkt["t"] >= 1.0:
                    _arrived.append(_pkt["dst"])
            state["broadcast_inflight"] = [
                p for p in state["broadcast_inflight"] if p["t"] < 1.0
            ]
            for _dst in _arrived:
                if _dst not in state["broadcast_done"]:
                    state["broadcast_done"].add(_dst)
                    for _child_id, _child_nd in node_dict.items():
                        if (_child_id != 0 and _child_nd.active
                                and _child_nd.parent_id == _dst
                                and _child_id not in state["broadcast_done"]):
                            state["broadcast_inflight"].append(
                                {"src": _dst, "dst": _child_id, "t": 0.0}
                            )
            if not state["broadcast_inflight"]:
                state["broadcast_active"] = False
                state["broadcast_reset_t"] = _now()
                print("[BROADCAST] Zakończono.")

        # Reset broadcastu po opóźnieniu → nowy cykl
        if (state["broadcast_reset_t"] is not None
                and now - state["broadcast_reset_t"] >= BROADCAST_RESET_DELAY):
            state["broadcast_done"]     = set()
            state["broadcast_inflight"] = []
            state["broadcast_reset_t"]  = None
            state["msg_auto_count"]   = 0
            state["last_auto_msg_t"]  = _now()
            print("[BROADCAST] Reset — nowy cykl.")

        # Animacja pakietu — dynamiczny routing hop-by-hop
        if state["msg_current"] is not None:
            cur = state["msg_current"]
            nxt = state["msg_next"]
            if nxt is None or not G.has_edge(cur, nxt):
                # Krawędź zerwana lub brak następnego hopu — przekierowanie
                _msg_reroute(
                    f"krawędź {cur}→{nxt} niedostępna"
                    if nxt is not None else f"węzeł {cur} izolowany"
                )
            else:
                state["msg_edge_frame"] += 1
                if state["msg_edge_frame"] >= MSG_FRAMES_PER_EDGE:
                    state["msg_edge_frame"] = 0
                    state["msg_traversed"].append((cur, nxt))
                    state["msg_current"] = nxt
                    # Wyznacz kolejny hop
                    if state["msg_current"] == state["msg_target"]:
                        _msg_complete()
                    elif state["msg_phase"] == "up":
                        if state["msg_current"] == 0:
                            state["msg_phase"] = "down"
                            _msg_compute_down_next()
                        else:
                            next_p = node_dict[state["msg_current"]].parent_id
                            if next_p is None:
                                _msg_reroute(f"węzeł {state['msg_current']} izolowany")
                            else:
                                state["msg_next"] = next_p
                    else:
                        _msg_compute_down_next()

        # Rysowanie sieci
        hl = state["hl_node"] if state["hl_frames"] > 0 else None
        draw_network(ax, G, node_dict, positions,
                     highlight_node=hl, highlight_color=state["hl_color"])
        _draw_edge_overlays()

        # Broadcast — węzły i pakiety (styl render_multi: proste scatter, bez glow)
        if state["broadcast_done"] or state["broadcast_inflight"]:
            _bc = state["broadcast_done"]
            # Amber węzły jak "#fbbf24" w render_multi, rozmiar 100
            _bc_nodes = [n for n in _bc if n != 0 and n in positions]
            if _bc_nodes:
                nx.draw_networkx_nodes(G, positions, ax=ax, nodelist=_bc_nodes,
                                       node_color="#fbbf24", node_size=100, alpha=1.0)
            # Stacja (serwer) — specjalny styl jak STATION_NODE w render_multi
            if 0 in _bc and 0 in positions:
                nx.draw_networkx_nodes(G, positions, ax=ax, nodelist=[0],
                                       node_color="#f59e0b", node_size=300, alpha=1.0)
            # Pakiety broadcast — pojedynczy scatter wszystkich hopów (rcb_packet_scatter)
            _rpx, _rpy = [], []
            for _pkt in state["broadcast_inflight"]:
                _ps, _pd = _pkt["src"], _pkt["dst"]
                if _ps in positions and _pd in positions and _pkt["t"] < 1.0:
                    _pt = _smoothstep(min(_pkt["t"], 1.0))
                    _x1, _y1 = positions[_ps]
                    _x2, _y2 = positions[_pd]
                    _rpx.append(_x1 + (_x2 - _x1) * _pt)
                    _rpy.append(_y1 + (_y2 - _y1) * _pt)
            if _rpx:
                ax.scatter(_rpx, _rpy, s=160, c="#ffd600",
                           edgecolors="#fff", linewidths=1.2, zorder=5)

        # Zaznaczone węzły (nad siecią, draw_network już wyczyścił ax)
        for sel in state["selected"]:
            nx.draw_networkx_nodes(G, positions, ax=ax, nodelist=[sel],
                                   node_color="#22c55e", node_size=70, alpha=1.00)

        # Ścieżka pakietu p2p — styl identyczny jak render_multi
        if state["msg_current"] is not None:
            # Węzeł źródłowy (niebieski) i docelowy (czerwony) jak w render_multi
            if state["msg_src"] is not None and state["msg_src"] in positions:
                nx.draw_networkx_nodes(G, positions, ax=ax,
                                       nodelist=[state["msg_src"]],
                                       node_color="#22c55e", node_size=140, alpha=1.0)
            if state["msg_target"] is not None and state["msg_target"] in positions:
                nx.draw_networkx_nodes(G, positions, ax=ax,
                                       nodelist=[state["msg_target"]],
                                       node_color="#22c55e", node_size=140, alpha=1.0)
            # Ślad — linia przez odwiedzone węzły (trail_line w render_multi)
            _trail_xs, _trail_ys = [], []
            if state["msg_traversed"]:
                _src_n = state["msg_traversed"][0][0]
                if _src_n in positions:
                    _trail_xs.append(positions[_src_n][0])
                    _trail_ys.append(positions[_src_n][1])
                for _, _v in state["msg_traversed"]:
                    if _v in positions:
                        _trail_xs.append(positions[_v][0])
                        _trail_ys.append(positions[_v][1])
            # Pozycja pakietu — interpolacja lub zakotwiczenie
            nxt = state["msg_next"]
            if nxt is not None and nxt in positions and G.has_edge(state["msg_current"], nxt):
                _t  = _smoothstep(state["msg_edge_frame"] / MSG_FRAMES_PER_EDGE)
                _x1, _y1 = positions[state["msg_current"]]
                _x2, _y2 = positions[nxt]
                _pkx = _x1 + (_x2 - _x1) * _t
                _pky = _y1 + (_y2 - _y1) * _t
            elif state["msg_current"] in positions:
                _pkx, _pky = positions[state["msg_current"]]
            else:
                _pkx, _pky = None, None
            if _pkx is not None:
                ax.scatter([_pkx], [_pky], s=180, c="#22c55e",
                           edgecolors="#fff", linewidths=1.2, zorder=5)

        # Timer — czas symulacji (spowolniony, jak irl_time_s w render_multi)
        ax.set_title(
            f"{_sim_t:.2f} s",
            color="#e5e7eb", fontsize=13, pad=12, loc="center",
        )

        # Przywróć widoczność osi — nx.draw_networkx_* wywołuje _prepare_ax()
        # która ustawia labelbottom/labelleft=False po każdym rysowaniu węzłów
        ax.tick_params(
            axis="both", colors="#9ca3af", labelsize=9,
            bottom=True, left=True, labelbottom=True, labelleft=True,
        )

        # Dekrementuj PO rysowaniu
        if state["flash_frames"] > 0: state["flash_frames"] -= 1
        if state["hl_frames"]    > 0: state["hl_frames"]    -= 1
        return []

    # ── Obsługa kliknięć ──────────────────────────────────────────────────────

    def on_click(event) -> None:
        if event.inaxes is not ax or event.xdata is None:
            return
        if state["phase"] != "interactive":
            return  # kliknięcia zablokowane podczas BFS
        cx, cy = event.xdata, event.ydata

        if event.button == 3:   # PPM → dodaj węzeł
            if _find_nearest_node(cx, cy, positions, threshold=0.04) is not None:
                print("[DODAJ] Za blisko istniejącego węzła.")
                return
            state["pending_add"].append((cx, cy))
            print(f"[DODAJ] Nowy węzeł zakolejkowany w ({cx:.2f}, {cy:.2f})")
            return

        if event.button != 1:
            return

        nid = _find_nearest_node(cx, cy, positions)
        if nid is None or nid == 0:
            return
        if not node_dict[nid].active:
            print(f"[KLIK] Węzeł {nid} już wyłączony.")
            return
        state["pending_kill"].append(nid)
        print(f"[KLIK] Węzeł {nid} zakolejkowany do wyłączenia.")

    fig.canvas.mpl_connect("button_press_event", on_click)

    # ── Śledzenie pozycji kursora + zaznaczanie węzłów klawiszem E ────────────

    mouse_pos: list[float] = [0.5, 0.5]

    def on_mouse_move(event) -> None:
        if event.inaxes is ax and event.xdata is not None:
            mouse_pos[0] = event.xdata
            mouse_pos[1] = event.ydata

    def on_key(event) -> None:
        if event.key != "e" or state["phase"] != "interactive":
            return
        if state["msg_current"] is not None:
            return  # wiadomość już w drodze
        nid = _find_nearest_node(mouse_pos[0], mouse_pos[1], positions, threshold=0.09)
        if nid is None:
            return
        if not node_dict[nid].active:
            print(f"[MSG] Węzeł {nid} nieaktywny.")
            return
        # Odznacz jeśli już zaznaczony
        if nid in state["selected"]:
            state["selected"].remove(nid)
            print(f"[MSG] Węzeł {nid} odznaczony.")
            return
        # Maks 2 zaznaczone — nowe zaznaczenie czyści poprzednie
        if len(state["selected"]) >= 2:
            state["selected"].clear()
        state["selected"].append(nid)
        print(f"[MSG] Zaznaczono węzeł {nid}  ({len(state['selected'])}/2)")
        if len(state["selected"]) == 2:
            state["msg_color"] = MSG_P2P_COLOR
            _start_message()

    fig.canvas.mpl_connect("motion_notify_event", on_mouse_move)
    fig.canvas.mpl_connect("key_press_event", on_key)

    print("\n[INTERAKTYWNY] LPM: wyłącz węzeł  |  PPM: dodaj nowy węzeł")
    print("[INTERAKTYWNY] E (hover nad węzłem): zaznacz 2 węzły i wyślij wiadomość")
    print(f"[AUTO]         Co ~{AUTO_EVENT_INTERVAL:.1f}s losowe zdarzenie topologiczne")
    print(f"[OPT]          Co ~{OPTIMIZE_INTERVAL:.1f}s  skan optymalizacyjny routingu")
    print("[INTERAKTYWNY] Zamknij okno aby zakończyć.\n")

    # Demo-kill: wyłącz węzeł z największą liczbą potomków (widoczny efekt od razu)
    _demo_candidates = [
        n for n, nd in node_dict.items()
        if n != 0 and nd.active and 1 <= nd.hop_count <= 4
    ]
    if _demo_candidates:
        _demo = max(_demo_candidates, key=lambda n: count_descendants(n, node_dict))
        _hop_k = int(node_dict[_demo].hop_count)
        print(f"\n[DEMO] Wyłączanie węzła {_demo} (hop={_hop_k})")
        instant_kill_heal(_demo)
        _healed   = sum(1 for n, nd in node_dict.items()
                        if n != 0 and nd.active and nd.hop_count != float("inf"))
        _isolated = sum(1 for n, nd in node_dict.items()
                        if n != 0 and nd.active and nd.hop_count == float("inf"))
        flash(
            f"Demo: węzeł {_demo} wyłączony  ·  aktywne:{_healed}  izolowane:{_isolated}",
            KILL_FLASH_FRAMES, _demo, "#e74c3c",
        )

    if RECORD_MODE:
        n_frames = RECORD_FPS * RECORD_SECS
        ani = animation.FuncAnimation(
            fig, update, frames=n_frames, interval=INTERVAL_MS,
            blit=False, cache_frame_data=False,
        )
        writer = animation.FFMpegWriter(
            fps=RECORD_FPS,
            metadata={"title": "mesh simulation"},
            bitrate=6000,
            extra_args=["-pix_fmt", "yuv420p"],
        )
        out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), RECORD_OUT)
        print(f"Nagrywanie {n_frames} klatek ({RECORD_SECS}s) → {out_path}")
        ani.save(
            out_path, writer=writer, dpi=100,
            progress_callback=lambda i, n: print(f"\r  {i}/{n}  ({100*i//n}%)", end="", flush=True),
        )
        print(f"\nGotowe: {out_path}")
        plt.close(fig)
    else:
        ani = animation.FuncAnimation(  # noqa: F841 — musi żyć przez cały czas
            fig, update, interval=INTERVAL_MS, blit=False, cache_frame_data=False
        )
        try:
            fig.canvas.manager.window.state("zoomed")   # pełny ekran (Windows TkAgg)
        except Exception:
            pass
        plt.show()


if __name__ == "__main__":
    main()

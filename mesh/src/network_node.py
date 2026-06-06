from __future__ import annotations


class NetworkNode:
    """Pojedynczy węzeł sieci (telefon) w ratunkowej sieci ad-hoc."""

    def __init__(self, node_id: int, neighbors: list[int] | None = None):
        self.node_id: int = node_id
        self.parent_id: int | None = None
        self.hop_count: float = float("inf")
        self.neighbors: list[int] = neighbors if neighbors is not None else []
        self.active: bool = True

    def handle_disconnection(self, all_nodes: dict[int, "NetworkNode"]) -> bool:
        """
        Szuka nowego rodzica wśród sąsiadów po utracie połączenia.

        Warunek anty-pętlowy: kandydat musi mieć hop_count ściśle mniejszy
        niż AKTUALNY hop_count tego węzła (stary koszt przed przepięciem).
        Dzięki temu nigdy nie „wspinamy się" w górę drzewa przez gorszy węzeł.
        """
        old_hop = self.hop_count
        old_parent = self.parent_id

        best_parent_id: int | None = None
        best_hop: float = float("inf")

        for nid in self.neighbors:
            candidate = all_nodes.get(nid)
            if candidate is None or not candidate.active:
                continue
            if candidate.hop_count < old_hop and candidate.hop_count < best_hop:
                best_hop = candidate.hop_count
                best_parent_id = nid

        if best_parent_id is not None:
            self.parent_id = best_parent_id
            self.hop_count = best_hop + 1
            print(
                f"  [HEAL] Węzeł {self.node_id} stracił połączenie z węzłem {old_parent}. "
                f"Przepinam do Węzła {self.parent_id}, nowy hop_count: {self.hop_count}"
            )
            return True

        self.parent_id = None
        self.hop_count = float("inf")
        print(
            f"  [IZOL] Węzeł {self.node_id} nie znalazł nowego rodzica "
            f"(stary: {old_parent}) — węzeł jest izolowany!"
        )
        return False

    def __repr__(self) -> str:
        status = "aktywny" if self.active else "MARTWY"
        hc = self.hop_count if self.hop_count != float("inf") else "∞"
        return f"NetworkNode(id={self.node_id}, parent={self.parent_id}, hop={hc}, {status})"

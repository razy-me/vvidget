# Angle C: Invariants & Rust Backend Collision Authority

## Core Finding
The invariant "no two widgets may overlap on the desktop" was only partially implemented in TypeScript (`gridCollision.ts`) and completely absent in Rust (`snapping.rs`).
When native Win32 window dragging is used (`WM_MOVING` / `WM_EXITSIZEMOVE`), `snapping.rs` only snapped to edges and grids without checking whether the candidate slot collided with another tracked widget window.

## Invariant
For all active widgets $w_i, w_j$ with $i \neq j$:
$$\operatorname{Rect}(w_i) \cap \operatorname{Rect}(w_j) = \emptyset$$
with margin tolerance $\ge 2\text{px}$.

## Fix
1. Implement `find_nearest_non_overlapping_slot` directly in Rust (`snapping.rs`), mirroring the algorithm in `gridCollision.ts`.
2. In `on_wm_moving`: compute prospective non-overlapping slot and update the skeleton preview window (`widget_skeleton`) directly.
3. In `WM_EXITSIZEMOVE`: clamp moving window's final position to the non-overlapping slot so release CANNOT result in overlap, even if the user drops directly over an existing widget.

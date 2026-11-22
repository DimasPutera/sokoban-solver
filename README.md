# sokoban-solver

[![make.fun](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/DimasPutera/sokoban-solver/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/DimasPutera/sokoban-solver/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121)

Push-optimal Sokoban solver for make.fun: `main.ts` (Node 22) answers all 5
instances of a set in one run. Each level is split into its rooms off the
hallway; every room is solved push-optimally with A* over pushes (min-assignment
Manhattan heuristic, corner deadlock pruning), and the rooms are stitched
together with BFS walks through the hallway. Deterministic (no clock, no
randomness, fixed node cap). Practice set: 1,000,000 — all 5 instances solved
in exactly P* pushes (13/16/29/47/60).

Entry for the make.fun bounty
[sokoban-solver-01-run-20261121](https://make.fun/bounty/sokoban-solver-01-run-20261121).

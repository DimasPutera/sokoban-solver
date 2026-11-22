// main.ts — Sokoban solver: room-split push-optimal A* (deterministic, no clock).
// Reads MAKEFUN_INPUT_DIR/<id>/level.txt, writes MAKEFUN_OUTPUT_DIR/<id>/solution.txt.
// Each level: hallway row holds the player; rooms are the floor components off it.
// A room is solved from its door by push-level A* (cost = pushes, heuristic =
// min-assignment Manhattan boxes->goals, corner + wall-run deadlock pruning).
// Rooms are visited nearest-door first; walks between rooms are BFS with boxes
// as obstacles. No wall clock, no randomness: a fixed node cap bounds search.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const NODE_CAP = 2000000;

const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];
const DL = ['u', 'd', 'l', 'r'];

interface Level {
  w: number;
  h: number;
  wall: Uint8Array;
  goal: Uint8Array;
  boxes: number[];
  player: number;
  hallRow: number;
}

function parseLevel(text: string): Level {
  const raw = text.split('\n');
  while (raw.length > 0 && raw[raw.length - 1] === '') raw.pop();
  const h = raw.length;
  const w = Math.max(...raw.map((l) => l.length));
  const wall = new Uint8Array(w * h);
  const goal = new Uint8Array(w * h);
  const boxes: number[] = [];
  let player = -1;
  let hallRow = -1;
  for (let r = 0; r < h; r++) {
    const line = raw[r];
    for (let c = 0; c < w; c++) {
      const ch = c < line.length ? line[c] : '#';
      const i = r * w + c;
      if (ch === '#') wall[i] = 1;
      else if (ch === '.') goal[i] = 1;
      else if (ch === '$') boxes.push(i);
      else if (ch === '*') { goal[i] = 1; boxes.push(i); }
      else if (ch === '@') { player = i; hallRow = r; }
      else if (ch === '+') { goal[i] = 1; player = i; hallRow = r; }
    }
  }
  boxes.sort((a, b) => a - b);
  return { w, h, wall, goal, boxes, player, hallRow };
}

interface Room {
  cells: number[];
  door: number;
  boxes: number[];
  goals: number[];
}

function findRooms(lv: Level): Room[] {
  const { w, h, wall, hallRow } = lv;
  const inRoom = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) {
    if (r === hallRow) continue;
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      if (!wall[i]) inRoom[i] = 1;
    }
  }
  const seen = new Uint8Array(w * h);
  const rooms: Room[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!inRoom[s] || seen[s]) continue;
    const cells: number[] = [];
    const q = [s];
    seen[s] = 1;
    while (q.length > 0) {
      const cur = q.shift()!;
      cells.push(cur);
      const r = Math.floor(cur / w);
      const c = cur % w;
      for (let d = 0; d < 4; d++) {
        const nr = r + DY[d];
        const nc = c + DX[d];
        if (nr < 0 || nr >= h || nc < 0 || nc >= w) continue;
        const ni = nr * w + nc;
        if (inRoom[ni] && !seen[ni]) { seen[ni] = 1; q.push(ni); }
      }
    }
    let door = -1;
    outer: for (const cell of cells) {
      const r = Math.floor(cell / w);
      const c = cell % w;
      for (let d = 0; d < 4; d++) {
        const nr = r + DY[d];
        const nc = c + DX[d];
        if (nr !== hallRow || nr < 0 || nr >= h || nc < 0 || nc >= w) continue;
        const ni = nr * w + nc;
        if (!wall[ni]) { door = ni; break outer; }
      }
    }
    const cellSet = new Set(cells);
    const boxes = lv.boxes.filter((b) => cellSet.has(b));
    const goals = cells.filter((c) => lv.goal[c] === 1);
    rooms.push({ cells, door, boxes, goals });
  }
  return rooms;
}

// BFS over floor cells (walls + given box set are obstacles). Returns the move
// letters from `from` to `to`, or null when unreachable.
function walkPath(lv: Level, boxSet: Set<number>, from: number, to: number): string | null {
  const { w, h, wall } = lv;
  if (from === to) return '';
  const prev = new Int32Array(w * h).fill(-2);
  const prevMove = new Array<string>(w * h).fill('');
  const q = [from];
  prev[from] = -1;
  while (q.length > 0) {
    const cur = q.shift()!;
    const r = Math.floor(cur / w);
    const c = cur % w;
    for (let d = 0; d < 4; d++) {
      const nr = r + DY[d];
      const nc = c + DX[d];
      if (nr < 0 || nr >= h || nc < 0 || nc >= w) continue;
      const ni = nr * w + nc;
      if (wall[ni] === 1 || boxSet.has(ni) || prev[ni] !== -2) continue;
      prev[ni] = cur;
      prevMove[ni] = DL[d];
      if (ni === to) {
        let s = '';
        let x = ni;
        while (x !== from) { s = prevMove[x] + s; x = prev[x]; }
        return s;
      }
      q.push(ni);
    }
  }
  return null;
}

// Min-heap of [f, h, seq, key].
class Heap {
  private a: Array<[number, number, number, string]> = [];
  get size(): number { return this.a.length; }
  push(v: [number, number, number, string]): void {
    const a = this.a;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] < a[i][0] || (a[p][0] === a[i][0] && a[p][1] <= a[i][1])) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number, number, string] {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && (a[l][0] < a[m][0] || (a[l][0] === a[m][0] && a[l][1] < a[m][1]))) m = l;
        if (r < a.length && (a[r][0] < a[m][0] || (a[r][0] === a[m][0] && a[r][1] < a[m][1]))) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

interface RoomSol { moves: string; end: number; pushes: number; }

function solveRoom(lv: Level, room: Room, startPlayer: number): RoomSol | null {
  const { w, h } = lv;
  const walk = new Set<number>(room.cells);
  walk.add(room.door);
  const goalSet = new Set<number>(room.goals);
  const blockedAt = (r: number, c: number): boolean => {
    if (r < 0 || r >= h || c < 0 || c >= w) return true;
    return !walk.has(r * w + c);
  };
  const rc = (i: number): [number, number] => [Math.floor(i / w), i % w];
  // Dead squares: non-goal cells a box can never leave (corner, or a wall run
  // with no goal on it). Safe: an optimal solution never parks a box there.
  const dead = new Set<number>();
  for (const cell of room.cells) {
    if (goalSet.has(cell)) continue;
    const [r, c] = rc(cell);
    const up = blockedAt(r - 1, c);
    const dn = blockedAt(r + 1, c);
    const lf = blockedAt(r, c - 1);
    const rt = blockedAt(r, c + 1);
    if ((up && lf) || (up && rt) || (dn && lf) || (dn && rt)) dead.add(cell);
  }
  const k = room.boxes.length;
  const goals = room.goals;
  const man = (a: number, b: number): number => {
    const [r1, c1] = rc(a);
    const [r2, c2] = rc(b);
    return Math.abs(r1 - r2) + Math.abs(c1 - c2);
  };
  // All permutations of goal indices (k <= 4).
  const perms: number[][] = [];
  const buildPerm = (cur: number[], used: boolean[]): void => {
    if (cur.length === k) { perms.push([...cur]); return; }
    for (let i = 0; i < k; i++) {
      if (used[i]) continue;
      used[i] = true;
      cur.push(i);
      buildPerm(cur, used);
      cur.pop();
      used[i] = false;
    }
  };
  buildPerm([], new Array<boolean>(k).fill(false));
  const heuristic = (boxes: number[]): number => {
    let best = Infinity;
    for (const p of perms) {
      let s = 0;
      for (let i = 0; i < k; i++) s += man(boxes[i], goals[p[i]]);
      if (s < best) best = s;
    }
    return best;
  };
  const keyOf = (player: number, boxes: number[]): string => player + ':' + boxes.join(',');
  const startBoxes = [...room.boxes].sort((a, b) => a - b);
  const startKey = keyOf(startPlayer, startBoxes);
  const gScore = new Map<string, number>([[startKey, 0]]);
  const came = new Map<string, { prev: string; seg: string }>();
  const heap = new Heap();
  let seq = 0;
  heap.push([heuristic(startBoxes), heuristic(startBoxes), seq++, startKey]);
  const stateOf = new Map<string, { player: number; boxes: number[] }>([[startKey, { player: startPlayer, boxes: startBoxes }]]);
  let expanded = 0;
  while (heap.size > 0) {
    const [, , , key] = heap.pop();
    const st = stateOf.get(key)!;
    const g = gScore.get(key)!;
    if (st.boxes.every((b) => goalSet.has(b))) {
      let moves = '';
      let cur = key;
      const segs: string[] = [];
      while (came.has(cur)) {
        const e = came.get(cur)!;
        segs.push(e.seg);
        cur = e.prev;
      }
      segs.reverse();
      moves = segs.join('');
      return { moves, end: st.player, pushes: g };
    }
    if (++expanded > NODE_CAP) return null;
    // Player reachability BFS from st.player (boxes are walls), with paths.
    const boxSet = new Set<number>(st.boxes);
    const prev = new Int32Array(w * h).fill(-2);
    const prevMove = new Array<string>(w * h).fill('');
    const q = [st.player];
    prev[st.player] = -1;
    while (q.length > 0) {
      const cur = q.shift()!;
      const [r, c] = rc(cur);
      for (let d = 0; d < 4; d++) {
        const nr = r + DY[d];
        const nc = c + DX[d];
        if (nr < 0 || nr >= h || nc < 0 || nc >= w) continue;
        const ni = nr * w + nc;
        if (!walk.has(ni) || boxSet.has(ni) || prev[ni] !== -2) continue;
        prev[ni] = cur;
        prevMove[ni] = DL[d];
        q.push(ni);
      }
    }
    const pathTo = (to: number): string | null => {
      if (prev[to] === -2) return null;
      let s = '';
      let x = to;
      while (x !== st.player) { s = prevMove[x] + s; x = prev[x]; }
      return s;
    };
    for (let bi = 0; bi < k; bi++) {
      const b = st.boxes[bi];
      const [br, bc] = rc(b);
      for (let d = 0; d < 4; d++) {
        const tr = br + DY[d];
        const tc = bc + DX[d];
        const hr = br - DY[d];
        const hc = bc - DX[d];
        if (tr < 0 || tr >= h || tc < 0 || tc >= w || hr < 0 || hr >= h || hc < 0 || hc >= w) continue;
        const target = tr * w + tc;
        const behind = hr * w + hc;
        if (!walk.has(target) || boxSet.has(target) || dead.has(target)) continue;
        const seg = pathTo(behind);
        if (seg === null) continue;
        const nb = [...st.boxes];
        nb[bi] = target;
        nb.sort((a, b) => a - b);
        const nKey = keyOf(b, nb);
        const ng = g + 1;
        if (gScore.has(nKey) && gScore.get(nKey)! <= ng) continue;
        gScore.set(nKey, ng);
        stateOf.set(nKey, { player: b, boxes: nb });
        came.set(nKey, { prev: key, seg: seg + DL[d] });
        const hh = heuristic(nb);
        heap.push([ng + hh, hh, seq++, nKey]);
      }
    }
  }
  return null;
}

function solveLevel(lv: Level): string | null {
  const rooms = findRooms(lv).filter((r) => r.boxes.length > 0);
  const inRoom = new Set<number>();
  for (const r of rooms) for (const b of r.boxes) inRoom.add(b);
  for (const b of lv.boxes) if (!inRoom.has(b)) return null;
  for (const r of rooms) if (r.door < 0) return null;
  let player = lv.player;
  const boxSet = new Set<number>(lv.boxes);
  let moves = '';
  const remaining = [...rooms];
  while (remaining.length > 0) {
    let best = -1;
    let bestLen = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const p = walkPath(lv, boxSet, player, remaining[i].door);
      if (p === null) continue;
      if (p.length < bestLen || (p.length === bestLen && remaining[i].door < remaining[best].door)) {
        bestLen = p.length;
        best = i;
      }
    }
    if (best < 0) return null;
    const room = remaining.splice(best, 1)[0];
    const walk = walkPath(lv, boxSet, player, room.door)!;
    moves += walk;
    player = room.door;
    const sol = solveRoom(lv, room, player);
    if (sol === null) return null;
    moves += sol.moves;
    player = sol.end;
    for (const b of room.boxes) boxSet.delete(b);
    for (const g of room.goals) boxSet.add(g);
  }
  return moves;
}

for (const id of readdirSync(I).sort()) {
  const moves = solveLevel(parseLevel(readFileSync(join(I, id, 'level.txt'), 'utf8')));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'solution.txt'), `${moves ?? ''}\n`);
}

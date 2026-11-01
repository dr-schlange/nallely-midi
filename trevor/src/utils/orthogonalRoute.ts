// LLM generated
export interface Rect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export interface Point {
	x: number;
	y: number;
}

const BEND_PENALTY = 20;
const SMALL_GAP = 12; // gaps up to this size get a routing line through their middle
const OUTER_MARGIN = 8;
const BORDER_PENALTY = 8; // cost factor of a run along the border of a device
const BORDER_CLEARANCE = 1.9; // a line closer than this to a border counts as on it
const HUG_PENALTY = 1.5; // cost factor of a run along the border of a narrow gap

// directions: 0 right, 1 down, 2 left, 3 up
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

const expand = (r: Rect, pad: number): Rect => ({
	left: r.left - pad,
	top: r.top - pad,
	right: r.right + pad,
	bottom: r.bottom + pad,
});

const sortedUnique = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	const out: number[] = [];
	for (const v of sorted) {
		if (out.length === 0 || v - out[out.length - 1] > 0.01) out.push(v);
	}
	return out;
};

// The routing lines, with one through the middle of each small gap. `hugging[i]` tells that
// line i is next to such a middle line: it runs along the border of what bounds the gap.
const withGapMiddles = (coords: number[]) => {
	const middles = new Set<number>();
	for (let i = 0; i + 1 < coords.length; i++) {
		const gap = coords[i + 1] - coords[i];
		if (gap > 0.5 && gap <= SMALL_GAP) middles.add(coords[i] + gap / 2);
	}
	const all = sortedUnique([...coords, ...middles]);
	const hugging = all.map(
		(c, i) =>
			!middles.has(c) &&
			((i > 0 && middles.has(all[i - 1])) ||
				(i + 1 < all.length && middles.has(all[i + 1]))),
	);
	return { coords: all, hugging };
};

const indexOf = (coords: number[], value: number) => {
	let lo = 0;
	let hi = coords.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (coords[mid] < value - 0.005) lo = mid + 1;
		else hi = mid;
	}
	return lo;
};

class MinHeap {
	private keys: number[] = [];
	private items: number[] = [];

	get size() {
		return this.keys.length;
	}

	push(key: number, item: number) {
		let i = this.keys.length;
		this.keys.push(key);
		this.items.push(item);
		while (i > 0) {
			const parent = (i - 1) >> 1;
			if (this.keys[parent] <= this.keys[i]) break;
			[this.keys[parent], this.keys[i]] = [this.keys[i], this.keys[parent]];
			[this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
			i = parent;
		}
	}

	pop(): [number, number] {
		const key = this.keys[0];
		const item = this.items[0];
		const lastKey = this.keys.pop() as number;
		const lastItem = this.items.pop() as number;
		if (this.keys.length > 0) {
			this.keys[0] = lastKey;
			this.items[0] = lastItem;
			let i = 0;
			while (true) {
				const l = 2 * i + 1;
				const r = l + 1;
				let m = i;
				if (l < this.keys.length && this.keys[l] < this.keys[m]) m = l;
				if (r < this.keys.length && this.keys[r] < this.keys[m]) m = r;
				if (m === i) break;
				[this.keys[m], this.keys[i]] = [this.keys[i], this.keys[m]];
				[this.items[m], this.items[i]] = [this.items[i], this.items[m]];
				i = m;
			}
		}
		return [key, item];
	}
}

interface Anchor {
	node: Point; // on the padded border of the element, where the routing starts
	edge: Point; // on the element border itself
	dir: number; // direction leaving the element
}

// The borders of the devices, as thin boxes: a link may cross them but not run along them
export interface Borders {
	horizontal: Rect[]; // top and bottom borders
	vertical: Rect[]; // left and right borders
}

const runsAlong = (
	bands: Rect[],
	horizontal: boolean,
	line: number,
	from: number,
	to: number,
) => {
	const lo = Math.min(from, to);
	const hi = Math.max(from, to);
	return bands.some((b) =>
		horizontal
			? line > b.top - BORDER_CLEARANCE &&
				line < b.bottom + BORDER_CLEARANCE &&
				hi > b.left &&
				lo < b.right
			: line > b.left - BORDER_CLEARANCE &&
				line < b.right + BORDER_CLEARANCE &&
				hi > b.top &&
				lo < b.bottom,
	);
};

export type Side = "left" | "right" | "top" | "bottom";

// Where a link may attach to an element: the given sides, in the middle of each
// `bounds` is a larger box the link has to clear before it turns (the title bar around a
// port); the link still ends on the element itself.
const anchorsOf = (
	rect: Rect,
	lead: number,
	sides: Side[],
	bounds: Rect = rect,
): Anchor[] => {
	const cx = (rect.left + rect.right) / 2;
	const cy = (rect.top + rect.bottom) / 2;
	const all: Record<Side, Anchor> = {
		right: {
			node: { x: bounds.right + lead, y: cy },
			edge: { x: rect.right, y: cy },
			dir: 0,
		},
		bottom: {
			node: { x: cx, y: bounds.bottom + lead },
			edge: { x: cx, y: rect.bottom },
			dir: 1,
		},
		left: {
			node: { x: bounds.left - lead, y: cy },
			edge: { x: rect.left, y: cy },
			dir: 2,
		},
		top: {
			node: { x: cx, y: bounds.top - lead },
			edge: { x: cx, y: rect.top },
			dir: 3,
		},
	};
	return sides.map((side) => all[side]);
};

const simplify = (points: Point[]) => {
	const out: Point[] = [];
	for (const p of points) {
		const last = out[out.length - 1];
		if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01)
			continue;
		out.push(p);
	}
	for (let i = out.length - 2; i > 0; i--) {
		const a = out[i - 1];
		const b = out[i];
		const c = out[i + 1];
		const sameX = Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01;
		const sameY = Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01;
		if (sameX || sameY) out.splice(i, 1);
	}
	return out;
};

const routeWithPadding = (
	from: Rect,
	to: Rect,
	obstacles: Rect[],
	pad: number,
	lead: number, // straight run kept in front of the elements, room for the arrowhead
	fromSides: Side[],
	toSides: Side[],
	fromBounds?: Rect,
	toBounds?: Rect,
	borders?: Borders,
): Point[] | null => {
	const fromPadded = expand(from, pad);
	const toPadded = expand(to, pad);
	const blockers = [
		...obstacles.map((o) => expand(o, pad)),
		fromPadded,
		toPadded,
		// the title bar around a port: the link leaves it by the short stub to the node in front
		// of it, and never runs inside it (the middle of a small gap would be a cheap way)
		...(fromBounds ? [fromBounds] : []),
		...(toBounds ? [toBounds] : []),
	];
	const fromAnchors = anchorsOf(from, lead, fromSides, fromBounds);
	const toAnchors = anchorsOf(to, lead, toSides, toBounds);

	const xsRaw: number[] = [];
	const ysRaw: number[] = [];
	for (const r of blockers) {
		xsRaw.push(r.left, r.right);
		ysRaw.push(r.top, r.bottom);
	}
	for (const a of [...fromAnchors, ...toAnchors]) {
		xsRaw.push(a.node.x);
		ysRaw.push(a.node.y);
	}
	xsRaw.push(
		Math.min(...xsRaw) - OUTER_MARGIN,
		Math.max(...xsRaw) + OUTER_MARGIN,
	);
	ysRaw.push(
		Math.min(...ysRaw) - OUTER_MARGIN,
		Math.max(...ysRaw) + OUTER_MARGIN,
	);
	const { coords: xs, hugging: huggingX } = withGapMiddles(sortedUnique(xsRaw));
	const { coords: ys, hugging: huggingY } = withGapMiddles(sortedUnique(ysRaw));
	const nx = xs.length;
	const ny = ys.length;

	// an edge is blocked when it runs strictly inside a blocker
	const blockedH = new Uint8Array(nx * ny); // edge (i,j) -> (i+1,j)
	const blockedV = new Uint8Array(nx * ny); // edge (i,j) -> (i,j+1)
	for (const r of blockers) {
		const ia = indexOf(xs, r.left);
		const ib = indexOf(xs, r.right);
		const ja = indexOf(ys, r.top);
		const jb = indexOf(ys, r.bottom);
		for (let j = ja + 1; j < jb; j++)
			for (let i = ia; i < ib; i++) blockedH[j * nx + i] = 1;
		for (let i = ia + 1; i < ib; i++)
			for (let j = ja; j < jb; j++) blockedV[j * nx + i] = 1;
	}

	const isBlocked = (i: number, j: number, dir: number) => {
		if (dir === 0) return i + 1 >= nx || blockedH[j * nx + i] === 1;
		if (dir === 2) return i - 1 < 0 || blockedH[j * nx + i - 1] === 1;
		if (dir === 1) return j + 1 >= ny || blockedV[j * nx + i] === 1;
		return j - 1 < 0 || blockedV[(j - 1) * nx + i] === 1;
	};

	const targets = new Map<number, Anchor>();
	for (const a of toAnchors) {
		targets.set(indexOf(ys, a.node.y) * nx + indexOf(xs, a.node.x), a);
	}
	const center = {
		x: (to.left + to.right) / 2,
		y: (to.top + to.bottom) / 2,
	};

	// state = (node, arrival direction)
	const stateCount = nx * ny * 4;
	const dist = new Float64Array(stateCount).fill(Infinity);
	const prev = new Int32Array(stateCount).fill(-1);
	const heap = new MinHeap();
	const startAnchorOf = new Map<number, Anchor>();
	for (const a of fromAnchors) {
		const node = indexOf(ys, a.node.y) * nx + indexOf(xs, a.node.x);
		const state = node * 4 + a.dir;
		dist[state] = 0;
		startAnchorOf.set(state, a);
		heap.push(
			Math.abs(a.node.x - center.x) + Math.abs(a.node.y - center.y),
			state,
		);
	}

	const closed = new Uint8Array(stateCount);
	let found = -1;
	while (heap.size > 0) {
		const [, state] = heap.pop();
		// an entry left behind by a better path to the same state
		if (closed[state] === 1) continue;
		closed[state] = 1;
		const node = state >> 2;
		const dir = state & 3;
		if (targets.has(node)) {
			found = state;
			break;
		}
		const i = node % nx;
		const j = (node - i) / nx;
		const base = dist[state];
		for (let d = 0; d < 4; d++) {
			if (d === ((dir + 2) & 3)) continue; // no U-turn
			if (isBlocked(i, j, d)) continue;
			const ni = i + DX[d];
			const nj = j + DY[d];
			// in a narrow gap the middle line is the one that stays clear of both borders
			const hug = (d & 1 ? huggingX[i] : huggingY[j]) ? HUG_PENALTY : 1;
			const onBorder =
				borders &&
				(d & 1
					? runsAlong(borders.vertical, false, xs[i], ys[j], ys[nj])
					: runsAlong(borders.horizontal, true, ys[j], xs[i], xs[ni]));
			const length =
				(Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j])) *
				hug *
				(onBorder ? BORDER_PENALTY : 1);
			const cost = base + length + (d === dir ? 0 : BEND_PENALTY);
			const next = (nj * nx + ni) * 4 + d;
			if (cost < dist[next]) {
				dist[next] = cost;
				prev[next] = state;
				heap.push(
					cost + Math.abs(xs[ni] - center.x) + Math.abs(ys[nj] - center.y),
					next,
				);
			}
		}
	}
	if (found === -1) return null;

	const nodes: Point[] = [];
	let state = found;
	let startAnchor: Anchor | undefined;
	while (state !== -1) {
		const node = state >> 2;
		const i = node % nx;
		nodes.push({ x: xs[i], y: ys[(node - i) / nx] });
		startAnchor = startAnchorOf.get(state) ?? startAnchor;
		state = prev[state];
	}
	nodes.reverse();
	const endAnchor = targets.get(found >> 2) as Anchor;
	return simplify([(startAnchor as Anchor).edge, ...nodes, endAnchor.edge]);
};

// Last resort when every channel is closed: still only 90 degree angles
const elbow = (from: Rect, to: Rect): Point[] => {
	const a = {
		x: (from.left + from.right) / 2,
		y: (from.top + from.bottom) / 2,
	};
	const b = { x: (to.left + to.right) / 2, y: (to.top + to.bottom) / 2 };
	return simplify([a, { x: b.x, y: a.y }, b]);
};

// Orthogonal path between two elements that never crosses the obstacles. It first keeps
// some distance from them, then squeezes through the narrow gaps. The sides are where it may
// attach; if no path exists with them, an end that asked for top/bottom (a port) also gets
// its right side, then every side.
export const routeOrthogonal = (
	from: Rect,
	to: Rect,
	obstacles: Rect[],
	options: {
		fromSides?: Side[];
		toSides?: Side[];
		fromBounds?: Rect;
		toBounds?: Rect;
		// take the narrow gaps between neighbours before keeping a distance from them
		squeezeFirst?: boolean;
		borders?: Borders;
		// told which settings finally worked ("elbow": none did, the obstacles are ignored)
		onResult?: (info: {
			level: number;
			pad: number;
			lead: number;
			sides: [Side[], Side[]];
			elbow: boolean;
		}) => void;
	} = {},
): Point[] => {
	const fromSides = options.fromSides ?? ["left", "right"];
	const toSides = options.toSides ?? ["left", "right"];
	const widen = (sides: Side[], level: number): Side[] => {
		if (level === 0) return sides;
		const vertical = sides.includes("top") || sides.includes("bottom");
		if (level === 1) return vertical ? [...sides, "right"] : sides;
		// any end ends up with every side before the elbow: the left and right of a turned
		// title bar can be shut by its flush neighbours
		return ["right", "bottom", "left", "top"];
	};
	for (const level of [0, 1, 2]) {
		for (const [pad, lead] of options.squeezeFirst
			? [
					[0.5, 8],
					[0.5, 0.5],
					[2.5, 8],
					[2.5, 2.5],
				]
			: [
					[2.5, 8],
					// 4px between two devices: at 1.5 the link runs beside their borders, and
					// clear of them (a 2px line at 0.5 sits on the border)
					[1.5, 8],
					[2.5, 2.5],
					[1.5, 1.5],
					[0.5, 8],
					[0.5, 0.5],
				]) {
			const path = routeWithPadding(
				from,
				to,
				obstacles,
				pad,
				lead,
				widen(fromSides, level),
				widen(toSides, level),
				options.fromBounds,
				options.toBounds,
				options.borders,
			);
			if (path) {
				options.onResult?.({
					level,
					pad,
					lead,
					sides: [widen(fromSides, level), widen(toSides, level)],
					elbow: false,
				});
				return path;
			}
		}
	}
	options.onResult?.({
		level: 3,
		pad: 0,
		lead: 0,
		sides: [fromSides, toSides],
		elbow: true,
	});
	return elbow(from, to);
};

// LLM generated
import {
    forwardRef,
    type RefObject,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";
import type { Connection } from "../model";
import { useTrevorDispatch, useTrevorSelector } from "../store";
import { setBarSelection, setHighlightedUnit } from "../store/runtimeSlice";
import {
    buildOwners,
    type InlinedAnchor,
    resolveInlinedAnchor,
} from "../utils/inlinedAnchors";
import {
    type Borders,
    type Point,
    type Rect,
    routeOrthogonal,
    type Side,
} from "../utils/orthogonalRoute";
import { connectionEndId } from "../utils/utils";
import { LinkMenu } from "./LinkMenu";

export interface BarLinksRef {
	redraw: () => void;
}

// 100% LLM generated
const LINK_COLOR = "#808080"; // gray at rest, HIGHLIGHT_COLOR when highlighted
const HIT_TOLERANCE = 6; // px from a link's line: half of its transparent hit stroke
const LINK_WIDTH = 2;
const HIGHLIGHT_COLOR = "blue";
const BOUNCY_OPACITY = 0.7;
const BOUNCY_COLOR = "green"; // as the bouncy links of the rack view
const ARROW_LENGTH = 6;
const NEARBY = 120; // obstacles farther than this from both ends are ignored

// a long press on a link must not select text (the browser starts it by itself); one
// function for good so that the listener added at the press is the one removed after it
const DEVICE_BORDER = 3; // px, as in the title bars of the racks
const blockSelection = (e: Event) => e.preventDefault();

const overlaps = (a: Rect, b: Rect) =>
	a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const distanceToSegment = (p: Point, a: Point, b: Point) => {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lengthSquared = dx * dx + dy * dy;
	const t =
		lengthSquared === 0
			? 0
			: Math.max(
					0,
					Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared),
				);
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

const isNear = (points: Point[], p: Point) =>
	points.some(
		(a, i) =>
			i + 1 < points.length &&
			distanceToSegment(p, a, points[i + 1]) <= HIT_TOLERANCE,
	);

const contains = (r: Rect, p: Point) =>
	p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom;

// The parts of a polyline that are outside of the rectangles, as polylines (a piece that goes
// on after a rectangle starts a new one). Cut by the segment, not drawn through a clip path: a
// clip on a large SVG makes the browser repaint it through an offscreen layer at every scroll.
const clipPolyline = (points: Point[], rects: Rect[]): Point[][] => {
	if (rects.length === 0) return [points];
	const pieces: Point[][] = [];
	let current: Point[] | null = null;
	for (let i = 0; i + 1 < points.length; i++) {
		const a = points[i];
		const b = points[i + 1];
		// the parts of the segment inside a rectangle, as parameters from 0 to 1
		const inside: [number, number][] = [];
		for (const r of rects) {
			let t0 = 0;
			let t1 = 1;
			for (const [from, to, min, max] of [
				[a.x, b.x, r.left, r.right],
				[a.y, b.y, r.top, r.bottom],
			]) {
				const delta = to - from;
				if (delta === 0) {
					if (from <= min || from >= max) t1 = -1;
				} else {
					const u0 = (min - from) / delta;
					const u1 = (max - from) / delta;
					t0 = Math.max(t0, Math.min(u0, u1));
					t1 = Math.min(t1, Math.max(u0, u1));
				}
			}
			if (t1 > t0) inside.push([t0, t1]);
		}
		inside.sort((x, y) => x[0] - y[0]);
		// what is left of 0..1
		const kept: [number, number][] = [];
		let at = 0;
		for (const [t0, t1] of inside) {
			if (t0 > at) kept.push([at, t0]);
			at = Math.max(at, t1);
		}
		if (at < 1) kept.push([at, 1]);
		const at1 = (t: number) => ({
			x: a.x + (b.x - a.x) * t,
			y: a.y + (b.y - a.y) * t,
		});
		for (const [t0, t1] of kept) {
			if (current && t0 === 0) {
				current.push(at1(t1));
			} else {
				if (current) pieces.push(current);
				current = [at1(t0), at1(t1)];
			}
			// the piece stops where a rectangle begins
			if (t1 < 1) {
				pieces.push(current);
				current = null;
			}
		}
		// the segment is entirely inside: the piece ended before it
		if (kept.length === 0 && current) {
			pieces.push(current);
			current = null;
		}
	}
	if (current) pieces.push(current);
	return pieces;
};

const relativeRect = (el: Element, origin: DOMRect): Rect | null => {
	const r = el.getBoundingClientRect();
	if (r.width === 0 || r.height === 0) return null; // collapsed
	return {
		left: r.left - origin.left,
		top: r.top - origin.top,
		right: r.right - origin.left,
		bottom: r.bottom - origin.top,
	};
};

const attributeOf = (el: Element, selector: string, attribute: string) =>
	el.closest(selector)?.getAttribute(attribute) ?? null;

// Splits a path into the line and the arrowhead drawn at its end (tip on the last point)
const withArrow = (points: Point[]) => {
	const tip = points[points.length - 1];
	const before = points[points.length - 2];
	if (!before) return { line: points, arrow: null };
	const length = Math.hypot(tip.x - before.x, tip.y - before.y);
	if (length < 0.01) return { line: points, arrow: null };
	// in a tight spot the last run is shorter than the arrowhead: draw a smaller one over the corner
	const size = length >= ARROW_LENGTH ? ARROW_LENGTH : 4;
	const ux = (tip.x - before.x) / length;
	const uy = (tip.y - before.y) / length;
	const base = { x: tip.x - ux * size, y: tip.y - uy * size };
	const half = size / 2;
	const arrow = [
		tip,
		{ x: base.x - uy * half, y: base.y + ux * half },
		{ x: base.x + uy * half, y: base.y - ux * half },
	];
	return {
		line: length >= size ? [...points.slice(0, -1), base] : points.slice(0, -1),
		arrow,
	};
};

interface Placed {
	anchor: InlinedAnchor;
	rect: Rect;
	section: string | null;
	device: string | null;
	// the title bar holding a port: not a wall for the links of that port
	header: Element | null;
	headerRect: Rect | null;
	rack: Element | null;
}

interface DrawnLink {
	d: string;
	// the whole route, before the cut around the toolbars: what a press is tested against
	points: Point[];
	arrow: string;
	// the connections the link stands for, and whether both ends are collapsed
	connectionIds: number[];
	bothCollapsed: boolean;
	// one of the patches bounces: green, as in the rack view
	bouncy: boolean;
	// devices and sections at the ends of the patches this link stands for
	units: string[];
	// the parameters at the ends of those patches
	parameters: string[];
}

// Draws the links between the parameters with 90 degree angles.
// - A parameter whose section or device is collapsed is drawn to the single port of the
//   collapsed title bar. Two collapsed ends give one link, whatever the number of patches.
// - If an end is still open, each patched parameter keeps its own link.
// - When two ports are patched both ways, the links use opposite sides of the ports.
export const BarLinks = forwardRef<
	BarLinksRef,
	// scale: how much the racks are zoomed, the overlay itself never is
	{ containerRef: RefObject<HTMLElement | null>; scale?: number }
>(({ containerRef, scale = 1 }, ref) => {
	const connections = useTrevorSelector((state) => state.nallely.connections);
	const dispatch = useTrevorDispatch();
	const midiDevices = useTrevorSelector((state) => state.nallely.midi_devices);
	const virtualDevices = useTrevorSelector(
		(state) => state.nallely.virtual_devices,
	);
	const owners = useMemo(
		() => buildOwners(midiDevices, virtualDevices),
		[midiDevices, virtualDevices],
	);
	const connectionsRef = useRef(connections);
	connectionsRef.current = connections;
	const highlightedUnit = useTrevorSelector(
		(state) => state.runTime.highlightedUnit,
	);
	const selectedParameter = useTrevorSelector(
		(state) => state.runTime.barSelection,
	);
	const ownersRef = useRef(owners);
	ownersRef.current = owners;

	const svgRef = useRef<SVGSVGElement>(null);
	const frame = useRef<number | null>(null);
	// The route of each link with what it was computed from, as positions relative to its source.
	// A link whose surroundings moved all together (a rack scrolling) is not searched again: its
	// path is moved by the same distance.
	const routes = useRef(
		new Map<string, { signature: string; at: Point; points: Point[] }>(),
	);
	const [links, setLinks] = useState<DrawnLink[]>([]);
	const linksRef = useRef(links);
	linksRef.current = links;
	const [size, setSize] = useState({ width: 0, height: 0 });
	const [menu, setMenu] = useState<{
		x: number;
		y: number;
		ids: number[];
		// the links come from several pairs of ends: the list names the devices
		withDevices: boolean;
		showList: boolean;
		selected: number | null;
		// where the settings of the selected link open, when not at the pressed point
		anchor: { x: number; y: number } | null;
	} | null>(null);
	const closeMenu = useCallback(() => setMenu(null), []);
	const selectInMenu = useCallback(
		(id: number | null, point?: { x: number; y: number }) =>
			setMenu((current) =>
				current
					? // the forms stay where they first opened, whichever entry is picked next
						{
							...current,
							selected: id,
							anchor: current.anchor ?? point ?? null,
						}
					: current,
			),
		[],
	);

	// a long press on a link opens its menu
	const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pressOrigin = useRef<{ x: number; y: number } | null>(null);
	const cancelPress = () => {
		if (pressTimer.current) clearTimeout(pressTimer.current);
		pressTimer.current = null;
		pressOrigin.current = null;
		document.removeEventListener("selectstart", blockSelection);
	};
	useEffect(() => cancelPress, []);
	const startPress = (e: React.PointerEvent, link: DrawnLink) => {
		// the link wins over what is under it
		e.stopPropagation();
		e.preventDefault();
		cancelPress();
		document.addEventListener("selectstart", blockSelection);
		const { clientX: x, clientY: y } = e;
		pressOrigin.current = { x, y };
		pressTimer.current = setTimeout(() => {
			pressTimer.current = null;
			window.getSelection()?.removeAllRanges();
			// the link takes the place of the selected parameter or highlighted title
			dispatch(setBarSelection(null));
			dispatch(setHighlightedUnit(null));
			// every link under the pressed point: overlapping links are asked for, not guessed
			const origin = svgRef.current?.getBoundingClientRect();
			const under = origin
				? linksRef.current.filter((l) =>
						isNear(l.points, { x: x - origin.left, y: y - origin.top }),
					)
				: [];
			const hits = [link, ...under.filter((l) => l !== link)];
			const ids = [...new Set(hits.flatMap((l) => l.connectionIds))];
			// between two collapsed ends (or several patches) the list comes first
			const showList = link.bothCollapsed || ids.length > 1;
			setMenu({
				x,
				y,
				ids,
				withDevices: hits.length > 1,
				showList,
				selected: showList ? null : ids[0],
				anchor: null,
			});
		}, 500);
	};
	const movePress = (e: React.PointerEvent) => {
		const origin = pressOrigin.current;
		if (origin && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 8)
			cancelPress();
	};

	const compute = useCallback(() => {
		const svg = svgRef.current;
		const container = containerRef.current;
		if (!svg || !container) return;
		// The overlay lives in the scrolling content: it covers all of it, measured without
		// itself (its own size would count and never shrink back, and the page would slide)
		svg.style.width = "0px";
		svg.style.height = "0px";
		const width = container.scrollWidth;
		const height = container.scrollHeight;
		svg.style.width = `${width}px`;
		svg.style.height = `${height}px`;
		setSize((prev) =>
			prev.width === width && prev.height === height ? prev : { width, height },
		);
		const origin = svg.getBoundingClientRect();

		// one link per pair of anchors, however many patches it stands for
		const cache = new Map<string, InlinedAnchor | null>();
		const resolve = (id: string) => {
			if (!cache.has(id)) {
				cache.set(id, resolveInlinedAnchor(container, ownersRef.current, id));
			}
			return cache.get(id) ?? null;
		};
		const pairs = new Map<
			string,
			{
				src: InlinedAnchor;
				dest: InlinedAnchor;
				units: Set<string>;
				parameters: Set<string>;
				connections: Connection[];
			}
		>();
		for (const c of connectionsRef.current) {
			const src = resolve(connectionEndId(c.src));
			const dest = resolve(connectionEndId(c.dest));
			if (!src || !dest || src.key === dest.key) continue;
			const key = `${src.key}->${dest.key}`;
			let pair = pairs.get(key);
			if (!pair) {
				pair = {
					src,
					dest,
					units: new Set(),
					parameters: new Set(),
					connections: [],
				};
				pairs.set(key, pair);
			}
			pair.connections.push(c);
			for (const end of [c.src, c.dest]) {
				pair.parameters.add(connectionEndId(end));
				const owner = ownersRef.current.get(connectionEndId(end));
				if (owner) {
					pair.units.add(owner.device);
					pair.units.add(owner.section);
				}
			}
		}

		const bars: {
			id: string;
			rect: Rect;
			section: string | null;
			rack: Element | null;
		}[] = [];
		for (const el of container.querySelectorAll("[data-bar-id]")) {
			const rect = relativeRect(el, origin);
			if (rect)
				bars.push({
					id: el.getAttribute("data-bar-id") as string,
					rect,
					section: attributeOf(el, "[data-link-section]", "data-link-section"),
					rack: el.closest(".rack-row"),
				});
		}
		const sections: { key: string; device: string | null; rect: Rect }[] = [];
		for (const el of container.querySelectorAll("[data-link-section]")) {
			const rect = relativeRect(el, origin);
			if (rect)
				sections.push({
					key: el.getAttribute("data-link-section") as string,
					device: attributeOf(el, "[data-link-device]", "data-link-device"),
					rect,
				});
		}
		const devices: { key: string; rect: Rect }[] = [];
		for (const el of container.querySelectorAll("[data-link-device]")) {
			const rect = relativeRect(el, origin);
			if (rect)
				devices.push({
					key: el.getAttribute("data-link-device") as string,
					rect,
				});
		}
		const walls: {
			el: Element;
			device: string | null;
			section: string | null;
			rack: Element | null;
			rect: Rect;
		}[] = [];
		for (const el of container.querySelectorAll("[data-link-wall]")) {
			const rect = relativeRect(el, origin);
			if (rect)
				walls.push({
					el,
					device: attributeOf(el, "[data-link-device]", "data-link-device"),
					section: attributeOf(el, "[data-link-section]", "data-link-section"),
					rack: el.closest(".rack-row"),
					rect,
				});
		}

		// the whole title bars and section headers, as opposed to the text they hold
		const headers: {
			el: Element;
			device: string | null;
			section: string | null;
			rect: Rect;
		}[] = [];
		for (const el of container.querySelectorAll("[data-link-header]")) {
			const rect = relativeRect(el, origin);
			if (rect)
				headers.push({
					el,
					device: attributeOf(el, "[data-link-device]", "data-link-device"),
					section: attributeOf(el, "[data-link-section]", "data-link-section"),
					rect,
				});
		}

		const place = (anchor: InlinedAnchor): Placed | null => {
			const rect = relativeRect(anchor.element, origin);
			if (!rect) return null;
			const header = anchor.port
				? anchor.element.closest("[data-link-header]")
				: null;
			return {
				anchor,
				rect,
				section: attributeOf(
					anchor.element,
					"[data-link-section]",
					"data-link-section",
				),
				device: attributeOf(
					anchor.element,
					"[data-link-device]",
					"data-link-device",
				),
				header,
				headerRect: header ? relativeRect(header, origin) : null,
				rack: anchor.element.closest(".rack-row"),
			};
		};

		// the 3px border of every device: a link crosses it to leave, and never runs along it
		const borders: Borders = { horizontal: [], vertical: [] };
		for (const d of devices) {
			const { left, right, top, bottom } = d.rect;
			borders.horizontal.push(
				{ left, right, top, bottom: top + DEVICE_BORDER * scale },
				{ left, right, top: bottom - DEVICE_BORDER * scale, bottom },
			);
			borders.vertical.push(
				{ left, right: left + DEVICE_BORDER * scale, top, bottom },
				{ left: right - DEVICE_BORDER * scale, right, top, bottom },
			);
		}

		const next: DrawnLink[] = [];
		// the button bars on top of the racks: the links stop at them instead of crossing them
		const topBars: Rect[] = [];
		for (const el of container.querySelectorAll(".rack-top-bar")) {
			const rect = relativeRect(el, origin);
			if (rect) topBars.push(rect);
		}
		const keptRoutes = new Map<
			string,
			{ signature: string; at: Point; points: Point[] }
		>();
		for (const pair of pairs.values()) {
			const src = place(pair.src);
			const dest = place(pair.dest);
			if (!src || !dest) continue;

			// patched both ways: one link per side of the ports
			const reverse = `${pair.dest.key}->${pair.src.key}`;
			const lane: Side | undefined = pairs.has(reverse)
				? pair.src.key < pair.dest.key
					? "top"
					: "bottom"
				: undefined;
			// a turned title bar (horizontal racks) is crossed from its sides, not from its ends
			const sidesOf = (placed: Placed): Side[] => {
				if (!placed.header) return ["left", "right"];
				const turned = getComputedStyle(placed.header).writingMode.startsWith(
					"vertical",
				);
				if (lane === "top") return [turned ? "left" : "top"];
				if (lane === "bottom") return [turned ? "right" : "bottom"];
				return turned ? ["left", "right"] : ["top", "bottom"];
			};

			const zone: Rect = {
				left: Math.min(src.rect.left, dest.rect.left) - NEARBY,
				top: Math.min(src.rect.top, dest.rect.top) - NEARBY,
				right: Math.max(src.rect.right, dest.rect.right) + NEARBY,
				bottom: Math.max(src.rect.bottom, dest.rect.bottom) + NEARBY,
			};
			// only when both ends are open bars (device and section expanded) and in the same
			// rack row; a collapsed end keeps the strict rules even in the same rack
			const sameRack =
				!pair.src.port &&
				!pair.dest.port &&
				src.rack !== null &&
				src.rack === dest.rack;
			const ownDevices = new Set([src.device, dest.device]);
			const ownSections = new Set([src.section, dest.section]);
			const obstacles: Rect[] = [];
			if (sameRack) {
				// in one rack the link may go through the space between the parameters, and
				// across the devices and sections between them, and across the empty part of
				// their title bars: only the parameters and the title texts are in the way
				for (const bar of bars) {
					if (
						bar.rack === src.rack &&
						bar.id !== pair.src.key &&
						bar.id !== pair.dest.key &&
						overlaps(bar.rect, zone)
					)
						obstacles.push(bar.rect);
				}
				for (const w of walls) {
					if (w.rack === src.rack && overlaps(w.rect, zone))
						obstacles.push(w.rect);
				}
			} else {
				// the other devices are walls, the link only travels through the gaps between them
				for (const d of devices) {
					if (!ownDevices.has(d.key) && overlaps(d.rect, zone))
						obstacles.push(d.rect);
				}
				// in its own devices it stays out of the other sections
				for (const s of sections) {
					if (
						ownDevices.has(s.device) &&
						!ownSections.has(s.key) &&
						overlaps(s.rect, zone)
					)
						obstacles.push(s.rect);
				}
				// the titles and section headers of its own devices are walls, except the
				// one holding its port
				for (const h of headers) {
					if (
						h.el !== src.header &&
						h.el !== dest.header &&
						ownDevices.has(h.device) &&
						(h.section === null || ownSections.has(h.section)) &&
						overlaps(h.rect, zone)
					)
						obstacles.push(h.rect);
				}
				// in its own sections it goes around the parameters
				for (const bar of bars) {
					if (
						bar.id !== pair.src.key &&
						bar.id !== pair.dest.key &&
						ownSections.has(bar.section) &&
						overlaps(bar.rect, zone)
					)
						obstacles.push(bar.rect);
				}
			}

			const fromSides = sidesOf(src);
			const toSides = sidesOf(dest);
			const routeKey = `${pair.src.key}->${pair.dest.key}`;
			// everything the route depends on, relative to the source
			const at = { x: src.rect.left, y: src.rect.top };
			const rel = (r: Rect | null) =>
				r
					? `${(r.left - at.x).toFixed(1)},${(r.top - at.y).toFixed(1)},${(r.right - at.x).toFixed(1)},${(r.bottom - at.y).toFixed(1)}`
					: "-";
			const signature = [
				rel(src.rect),
				rel(dest.rect),
				rel(src.headerRect),
				rel(dest.headerRect),
				fromSides.join(),
				toSides.join(),
				sameRack,
				scale,
				obstacles.map(rel).join(";"),
				devices
					.filter((d) => overlaps(d.rect, zone))
					.map((d) => rel(d.rect))
					.join(";"),
			].join("|");
			const known = routes.current.get(routeKey);
			let points: Point[];
			if (known && known.signature === signature) {
				const dx = at.x - known.at.x;
				const dy = at.y - known.at.y;
				points =
					dx === 0 && dy === 0
						? known.points
						: known.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
			} else {
				points = routeOrthogonal(src.rect, dest.rect, obstacles, {
					fromSides,
					toSides,
					// a link clears the whole title bar of a port before it turns: it stays off the text
					fromBounds: src.headerRect ?? undefined,
					toBounds: dest.headerRect ?? undefined,
					squeezeFirst: sameRack,
					borders,
				});
			}
			keptRoutes.set(routeKey, { signature, at, points });
			const { line, arrow } = withArrow(points);
			const tip = points[points.length - 1];
			const tipHidden = topBars.some((r) => contains(r, tip));
			next.push({
				points,
				d: clipPolyline(line, topBars)
					.map((piece) =>
						piece
							.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`)
							.join(" "),
					)
					.join(" "),
				arrow:
					arrow && !tipHidden
						? arrow.map((p) => `${p.x},${p.y}`).join(" ")
						: "",
				units: [...pair.units],
				connectionIds: pair.connections.map((c) => c.id),
				bothCollapsed: pair.src.port && pair.dest.port,
				bouncy: pair.connections.some((c) => c.bouncy),
				parameters: [...pair.parameters],
			});
		}
		routes.current = keptRoutes;
		setLinks((prev) =>
			prev.length === next.length &&
			prev.every(
				(l, i) =>
					l.d === next[i].d &&
					l.arrow === next[i].arrow &&
					l.connectionIds.join() === next[i].connectionIds.join() &&
					l.bothCollapsed === next[i].bothCollapsed &&
					l.bouncy === next[i].bouncy &&
					l.units.join() === next[i].units.join() &&
					l.parameters.join() === next[i].parameters.join(),
			)
				? prev
				: next,
		);
	}, [containerRef, scale]);

	const redraw = useCallback(() => {
		if (frame.current !== null) return;
		frame.current = requestAnimationFrame(() => {
			frame.current = null;
			compute();
		});
	}, [compute]);

	useImperativeHandle(ref, () => ({ redraw }), [redraw]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: redraw when what is patched or where changes
	useEffect(() => {
		redraw();
	}, [connections, owners, redraw]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return undefined;
		const resize = new ResizeObserver(redraw);
		resize.observe(container);
		// opening/closing a device or a section toggles the style of its body
		const mutation = new MutationObserver((records) => {
			const svg = svgRef.current;
			if (
				records.some(
					(r) =>
						!svg?.contains(r.target) &&
						(r.type === "childList" ||
							(r.target instanceof Element &&
								r.target.hasAttribute("data-link-frame"))),
				)
			)
				redraw();
		});
		mutation.observe(container, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["style"],
		});
		// the overlay scrolls with the container: only what scrolls inside it (a rack) moves
		// the bars against it
		const onScroll = (event: Event) => {
			if (event.target !== container) redraw();
		};
		container.addEventListener("scroll", onScroll, true);
		window.addEventListener("resize", redraw);
		return () => {
			resize.disconnect();
			mutation.disconnect();
			container.removeEventListener("scroll", onScroll, true);
			window.removeEventListener("resize", redraw);
			if (frame.current !== null) cancelAnimationFrame(frame.current);
			frame.current = null;
		};
	}, [containerRef, redraw]);

	// the links of the highlighted device or section go last, on top
	const drawn = links
		.map((link) => ({
			link,
			// with the menu of a link open, that link alone is highlighted
			highlighted: menu
				? link.connectionIds.some((id) => menu.ids.includes(id))
				: (highlightedUnit !== null && link.units.includes(highlightedUnit)) ||
					(selectedParameter !== null &&
						link.parameters.includes(selectedParameter)),
		}))
		.sort((a, b) => Number(a.highlighted) - Number(b.highlighted));

	return (
		<svg
			ref={svgRef}
			style={{
				position: "absolute",
				top: 0,
				left: 0,
				width: size.width,
				height: size.height,
				pointerEvents: "none",
				overflow: "hidden",
				// the racks are reordered with CSS `order`, which also reorders painting: without
				// this the overlay (order 0) is painted under all of them
				zIndex: 1,
			}}
		>
			<g>
				{drawn.map(({ link, highlighted }, i) => {
					const color = highlighted
						? HIGHLIGHT_COLOR
						: link.bouncy
							? BOUNCY_COLOR
							: LINK_COLOR;
					const width = highlighted ? LINK_WIDTH + 1 : LINK_WIDTH;
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: links have no identity
						<g key={i}>
							{/* white halo under the link and the arrowhead: marks it on the gray title bars */}
							<path
								d={link.d}
								fill="none"
								stroke="white"
								strokeWidth={width + 2}
								strokeLinejoin="round"
								opacity={0.9}
							/>
							{link.arrow && (
								<polygon
									points={link.arrow}
									fill="white"
									stroke="white"
									strokeWidth={width}
									strokeLinejoin="round"
									opacity={0.9}
								/>
							)}
							{/* the group opacity covers the line and the arrowhead as one shape */}
							<g opacity={link.bouncy && !highlighted ? BOUNCY_OPACITY : 1}>
								<path
									d={link.d}
									fill="none"
									stroke={color}
									strokeWidth={width}
									strokeLinejoin="round"
								/>
								{link.arrow && <polygon points={link.arrow} fill={color} />}
							</g>
							{/* the link between two open bars answers to a long press; it is above the
						    racks, so it gets the press before what is under it */}
							{link.connectionIds.length > 0 && (
								<path
									d={link.d}
									fill="none"
									stroke="transparent"
									strokeWidth={12}
									pointerEvents="stroke"
									onPointerDown={(e) => startPress(e, link)}
									onPointerMove={movePress}
									onPointerUp={cancelPress}
									onPointerCancel={cancelPress}
									onPointerLeave={cancelPress}
									onContextMenu={(e) => e.preventDefault()}
								/>
							)}
						</g>
					);
				})}
			</g>
			{menu && (
				<LinkMenu
					x={menu.x}
					y={menu.y}
					connectionIds={menu.ids}
					withDevices={menu.withDevices}
					showList={menu.showList}
					selectedId={menu.selected}
					anchor={menu.anchor}
					onSelect={selectInMenu}
					onClose={closeMenu}
				/>
			)}
		</svg>
	);
});

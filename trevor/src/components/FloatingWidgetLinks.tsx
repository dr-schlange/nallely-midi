import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ConnectionEnd, VirtualParameter } from "../model";
import { useTrevorSelector } from "../store";
import { buildOwners, resolveInlinedAnchor } from "../utils/inlinedAnchors";
import { connectionEndId } from "../utils/utils";

const isBus = (end: ConnectionEnd) => end.repr.includes("WebSocketBus");

// The widget a bus port belongs to: its element id is the start of the port name
const widgetOf = (end: ConnectionEnd) =>
	(end.parameter as VirtualParameter).cv_name.split("_")[0];

// What a link of a widget points to: the bar of the parameter when it is open, else the title
// bar of its collapsed section or device
const targetRect = (
	owners: ReturnType<typeof buildOwners>,
	end: ConnectionEnd,
) => {
	const anchor = resolveInlinedAnchor(document, owners, connectionEndId(end));
	if (!anchor) return null;
	const element = anchor.port
		? anchor.element.closest("[data-link-header]")
		: anchor.element;
	return element?.getBoundingClientRect() ?? null;
};

// The dashed lines between the floating widgets and what they are linked to, as for the debug
// scope, in orange (gray is lost on the racks): straight, between the facing edges.
export const FloatingWidgetLinks = ({ widgetIds }: { widgetIds: string[] }) => {
	const connections = useTrevorSelector((state) => state.nallely.connections);
	const midiDevices = useTrevorSelector((state) => state.nallely.midi_devices);
	const virtualDevices = useTrevorSelector(
		(state) => state.nallely.virtual_devices,
	);
	const owners = useMemo(
		() => buildOwners(midiDevices, virtualDevices),
		[midiDevices, virtualDevices],
	);
	const overlayRef = useRef<SVGSVGElement>(null);
	const [tick, setTick] = useState(0);
	const [paths, setPaths] = useState<string[]>([]);
	const widgetKey = widgetIds.join();

	// anything that moves a widget or a parameter: scroll, resize, a device opening or closing
	useEffect(() => {
		let frame = 0;
		const bump = () => {
			if (frame) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				setTick((t) => t + 1);
			});
		};
		window.addEventListener("resize", bump);
		window.addEventListener("scroll", bump, true);
		const mutation = new MutationObserver((records) => {
			if (records.some((r) => !overlayRef.current?.contains(r.target))) bump();
		});
		mutation.observe(document.body, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ["style"],
		});
		return () => {
			window.removeEventListener("resize", bump);
			window.removeEventListener("scroll", bump, true);
			mutation.disconnect();
			cancelAnimationFrame(frame);
		};
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: tick is the redraw request
	useLayoutEffect(() => {
		const next = new Set<string>();
		for (const connection of connections) {
			const bus = [connection.src, connection.dest].find(isBus);
			const other = bus === connection.src ? connection.dest : connection.src;
			if (!bus || isBus(other)) continue;
			const widgetId = widgetOf(bus);
			if (!widgetIds.includes(widgetId)) continue;
			const widget = document.getElementById(widgetId)?.getBoundingClientRect();
			const target = targetRect(owners, other);
			if (!widget || !target) continue;
			// Always the top or the bottom edge of the target, the facing one: the long side of a
			// bar or title bar in vertical racks, and the short side of the turned ones in
			// horizontal racks
			const widgetX = widget.left + widget.width / 2;
			const targetX = target.left + target.width / 2;
			const targetAbove =
				target.top + target.height / 2 < widget.top + widget.height / 2;
			const widgetY = targetAbove ? widget.top : widget.bottom;
			const targetY = targetAbove ? target.bottom : target.top;
			next.add(`M ${widgetX},${widgetY} L ${targetX},${targetY}`);
		}
		const list = [...next];
		setPaths((prev) =>
			prev.length === list.length && prev.every((d, i) => d === list[i])
				? prev
				: list,
		);
	}, [connections, owners, widgetKey, tick]);

	return createPortal(
		<svg
			ref={overlayRef}
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				width: "100vw",
				height: "100vh",
				pointerEvents: "none",
				// above the racks and the right panel, under the floating windows
				zIndex: 99,
			}}
		>
			{paths.map((d) => (
				<path
					key={d}
					d={d}
					fill="none"
					stroke="orange"
					strokeWidth="2"
					strokeDasharray="5,5"
				/>
			))}
		</svg>,
		document.body,
	);
};

/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
/** biome-ignore-all lint/a11y/noSvgWithoutTitle: <explanation> */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MidiParameter, PadsOrKeys, VirtualParameter } from "../../model";
import { generateAcronym, resolveAcceptedValueIndex } from "../../utils/utils";
import { useTrevorSelector } from "../../store";
import { getNoteName } from "../MidiGrid";
import { ParameterMenu } from "../ParameterMenu";

export const Button = ({
	activated = false,
	onClick = undefined,
	text,
	tooltip = undefined,
	variant = "small",
	style = undefined,
	disabled = false,
	className = "",
}: {
	activated?: boolean;
	onClick?: (event) => void;
	text: string | React.ReactElement;
	tooltip: undefined | string;
	variant?: "big" | "small";
	style?: React.CSSProperties;
	disabled?: boolean;
	className?: string;
}) => {
	const [clickColor, setClickColor] = useState<string | undefined>(undefined);

	return (
		<div
			className={`${className} Button ${variant} ${activated ? "active" : ""} ${clickColor ? "clicked" : ""}`}
			style={{
				...(style ?? {}),
				...(className?.length > 0
					? {}
					: {
							color: disabled
								? (style?.color ?? "rgba(127, 127, 127, 0.4)")
								: (style?.color ?? "gray"),
						}),
			}}
			onMouseDown={(event) => {
				event.stopPropagation();
				event.preventDefault();
				if (disabled) {
					return;
				}
				setClickColor("orange");
			}}
			onMouseUp={(event) => {
				event.stopPropagation();
				event.preventDefault();
				if (disabled) {
					return;
				}
				setClickColor(undefined);
				onClick?.(event);
			}}
			title={tooltip}
		>
			<span>{text}</span>
		</div>
	);
};

// A whitish square for a Button on a colored bar, gold when activated (the inline color
// would otherwise hide the one of the active class). On a title bar it also gets a border
// that stands out on the gray, and room next to its neighbour.
export const lightButtonStyle = (
	activated = false,
	onTitleBar = false,
): React.CSSProperties => ({
	backgroundColor: activated ? "gold" : "#e0e0e0",
	fontSize: "12px",
	...(onTitleBar
		? { border: "2px solid lightgray", marginInlineStart: 3 }
		: {}),
});

export interface WidgetProps {
	id: string;
	num: number;
	style?: React.CSSProperties;
	onClose?: (id: string) => void;
}

export const HeaderButton = ({ onClick, text, ...props }) => {
	return (
		<button
			type="button"
			className="close-button"
			onClick={(event) => {
				event.stopPropagation();
				event.preventDefault();
				onClick?.();
			}}
			{...props}
		>
			{text}
		</button>
	);
};

interface TextInputProps {
	value: string;
	onChange: (value: string, event: React.ChangeEvent<HTMLInputElement>) => void;
	onEnter?: (
		value: string,
		event?: React.KeyboardEvent<HTMLInputElement>,
	) => void;
	placeholder?: string;
	style?: React.CSSProperties;
}

export const TextInput = ({
	value,
	onChange,
	onEnter,
	placeholder = "",
	style = {},
	...props
}: TextInputProps) => {
	return (
		<input
			style={{
				height: "10px",
				color: "gray",
				fontSize: "14px",
				textAlign: "right",
				boxShadow: "unset",
				pointerEvents: "auto",
				...style,
			}}
			placeholder={placeholder}
			onChange={(e) => {
				onChange?.(e.target.value, e);
			}}
			onBlur={(e) => {
				e.stopPropagation();
				e.preventDefault();
				onEnter?.(value);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.stopPropagation();
					e.preventDefault();
					onEnter?.(value, e);
				}
			}}
			{...props}
		/>
	);
};

export const PlaceholderWidget = ({
	id,
	componentKey,
	onClose,
	children,
	onClickLoad,
	removeCloseButton = false,
	visible = true,
}: {
	componentKey: string;
	id: string;
	onClose?: (e: string) => void;
	children: React.ReactNode;
	removeCloseButton?: boolean;
	onClickLoad?: (service: string, componentKey: string) => void;
	visible: boolean;
}) => {
	return (
		<div className="scope" style={{ display: visible ? "block" : "none" }}>
			<div
				style={{
					position: "absolute",
					color: "gray",
					zIndex: 1,
					top: "1%",
					right: "1%",
					width: "90%",
					textAlign: "center",
					cursor: "pointer",
					display: "flex",
					justifyContent: "flex-end",
					flexDirection: "row",
					pointerEvents: "none",
					gap: "4px",
				}}
			>
				{!removeCloseButton && (
					<Button
						text="x"
						onClick={() => onClose?.(id)}
						tooltip="Close window"
					/>
				)}
			</div>
			<div
				style={{
					height: "100%",
					display: "flex",
					flexDirection: "column",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				{children}
				<Button
					text="Load"
					onClick={() => onClickLoad?.(componentKey, id)}
					tooltip="Load the widget"
					style={{
						width: "100%",
					}}
				/>
			</div>
		</div>
	);
};

export const AcceptedValuesKnob = ({
	value,
	param,
	onManualSliderChange,
	onTap,
	acronymeLimit = 5,
	labelPosition = "top",
	disabled = false,
	stripPrefix = false,
}: {
	value: number | string | undefined;
	param: MidiParameter | VirtualParameter;
	acronymeLimit?: number;
	labelPosition?: "top" | "bottom";
	onManualSliderChange: (value: string) => void;
	onTap?: () => void;
	disabled?: boolean;
	stripPrefix?: boolean;
}) => {
	const acceptedValues = param.accepted_values;
	const count = acceptedValues.length;
	const maxIndex = count - 1;

	const resolveIndex = (v: number | string | undefined): number =>
		resolveAcceptedValueIndex(v, acceptedValues, param.range[1]);

	const currentIndex = resolveIndex(value);

	const [localIndex, setLocalIndex] = useState<number | null>(null);
	const effectiveIndex = localIndex ?? currentIndex;

	useEffect(() => {
		if (localIndex !== null && resolveIndex(value) === localIndex) {
			setLocalIndex(null);
		}
	}, [value]);

	const radius = 16;
	const strokeWidth = 2;
	const size = radius * 2 + strokeWidth;
	const center = radius + strokeWidth / 2;
	const startAngle = (5 * Math.PI) / 4;
	const totalAngle = (3 * Math.PI) / 2;

	const [ghostIndex, setGhostIndex] = useState<number | null>(null);
	const ghostIndexRef = useRef<number | null>(null);
	const startY = useRef<number | null>(null);
	const startIdx = useRef<number>(effectiveIndex);
	const hasMoved = useRef(false);
	const dragging = useRef(false);

	const indexToAngle = (idx: number) =>
		maxIndex > 0 ? startAngle - (idx / maxIndex) * totalAngle : startAngle;

	const dotAngle = indexToAngle(effectiveIndex);
	const cx = center + radius * Math.cos(dotAngle);
	const cy = center - radius * Math.sin(dotAngle);

	const ghostAngle = ghostIndex !== null ? indexToAngle(ghostIndex) : null;
	const ghostCx =
		ghostAngle !== null ? center + radius * Math.cos(ghostAngle) : null;
	const ghostCy =
		ghostAngle !== null ? center - radius * Math.sin(ghostAngle) : null;

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		startY.current = e.clientY;
		startIdx.current = effectiveIndex;
		ghostIndexRef.current = null;
		hasMoved.current = false;
		dragging.current = true;
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dragging.current || startY.current === null) return;
		const delta = startY.current - e.clientY;
		if (Math.abs(delta) < 4) return;
		hasMoved.current = true;
		const raw = startIdx.current + delta / 30;
		const newIndex = Math.min(maxIndex, Math.max(0, Math.round(raw)));
		ghostIndexRef.current = newIndex;
		setGhostIndex(newIndex);
	};

	const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dragging.current) return;
		dragging.current = false;
		if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
			e.currentTarget.releasePointerCapture(e.pointerId);
		}
		const committed = ghostIndexRef.current;
		const moved = hasMoved.current;
		startY.current = null;
		ghostIndexRef.current = null;
		hasMoved.current = false;
		setGhostIndex(null);
		if (!moved) {
			const nextIndex = (effectiveIndex + 1) % count;
			setLocalIndex(nextIndex);
			onManualSliderChange(acceptedValues[nextIndex].toString());
			onTap?.();
		} else if (committed !== null && committed !== effectiveIndex) {
			setLocalIndex(committed);
			onManualSliderChange(acceptedValues[committed].toString());
		}
	};

	const displayLabel =
		acceptedValues[ghostIndex ?? effectiveIndex]?.toString() ?? "...";

	return (
		<div
			style={{
				flexDirection: labelPosition === "top" ? "column" : "column-reverse",
				display: "flex",
				alignItems: "center",
				userSelect: "none",
				touchAction: "none",
				marginTop: "4px",
				position: "relative",
				gap: "2px",
			}}
			onPointerDown={disabled ? undefined : handlePointerDown}
			onPointerMove={disabled ? undefined : handlePointerMove}
			onPointerUp={disabled ? undefined : endDrag}
			onPointerCancel={disabled ? undefined : endDrag}
		>
			<span style={{ fontSize: "12px" }}>
				{generateAcronym(
					param.name
						.replace(/_cv$/, "")
						.replace(stripPrefix ? /^[^_]+_/ : "", ""),
					acronymeLimit,
				)}
			</span>
			<div style={{ position: "relative" }}>
				<svg width={size} height={size}>
					<circle
						cx={center}
						cy={center}
						r={radius}
						stroke={disabled ? "none" : "gray"}
						strokeWidth={strokeWidth}
						fill="none"
					/>
					{!disabled && <circle cx={cx} cy={cy} r={4} fill="orange" />}
					{!disabled && ghostIndex !== null && (
						<circle
							cx={ghostCx}
							cy={ghostCy}
							r={4}
							fill="orange"
							opacity={0.4}
						/>
					)}
				</svg>
				<span
					style={{
						position: "absolute",
						top: "50%",
						left: "50%",
						transform: "translate(-50%, -50%)",
						fontSize: "9px",
						pointerEvents: "none",
						zIndex: 10,
						color: ghostIndex !== null ? "orange" : "#333",
						whiteSpace: "nowrap",
						maxWidth: ghostIndex !== null ? "120px" : `${size - 4}px`,
						overflow: "hidden",
					}}
				>
					{disabled
						? "..."
						: ghostIndex !== null
							? displayLabel
							: generateAcronym(displayLabel, 10).toLowerCase()}
				</span>
			</div>
		</div>
	);
};

export const CircularSlider = ({
	value,
	param,
	onManualSliderChange,
	onDrag,
	onTap,
	acronymeLimit = 5,
	labelPosition = "top",
	maxValue = 127,
	minValue = 0,
	rounded = true,
	disabled = false,
	stripPrefix = false,
}: {
	param: MidiParameter | VirtualParameter;
	onManualSliderChange: (value: number) => void;
	value: number | undefined;
	acronymeLimit?: number;
	labelPosition?: "top" | "bottom";
	onDrag?: (value: number) => void;
	onTap?: () => void;
	maxValue?: number;
	minValue?: number;
	rounded?: boolean;
	disabled?: boolean;
	stripPrefix?: boolean;
}) => {
	const radius = 16;
	const strokeWidth = 2;
	const size = radius * 2 + strokeWidth;
	const center = radius + strokeWidth / 2;

	const startAngle = (5 * Math.PI) / 4;
	const totalAngle = (3 * Math.PI) / 2;

	const [ghostValue, setGhostValue] = useState<number | null>(null);
	const ghostValueRef = useRef<number | null>(null);
	const svgInnerRef = useRef<SVGSVGElement>(null);
	const svgRectRef = useRef<{ left: number; top: number } | null>(null);
	const startY = useRef<number | null>(null);
	const startX = useRef<number | null>(null);
	const startValue = useRef<number>(value ?? minValue);
	const hasMoved = useRef(false);
	const dragging = useRef(false);
	const basePrecision = useRef<number>(0);
	const extraDecimalsRef = useRef<number>(0);
	const [extraDecimals, setExtraDecimals] = useState<number>(0);
	const [dragOverlay, setDragOverlay] = useState<{
		sx: number;
		sy: number;
		cx: number;
		cy: number;
	} | null>(null);

	const span = maxValue - minValue;
	const angle =
		value !== undefined && span !== 0
			? startAngle - ((value - minValue) / span) * totalAngle
			: startAngle;
	const cx = center + radius * Math.cos(angle);
	const cy = center - radius * Math.sin(angle);

	const ghostAngle =
		ghostValue !== null && span !== 0
			? startAngle - ((ghostValue - minValue) / span) * totalAngle
			: null;
	const ghostCx =
		ghostAngle !== null ? center + radius * Math.cos(ghostAngle) : null;
	const ghostCy =
		ghostAngle !== null ? center - radius * Math.sin(ghostAngle) : null;

	const countDecimals = (v: number): number => {
		const s = v.toString();
		const d = s.indexOf(".");
		return d === -1 ? 0 : s.length - d - 1;
	};

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		startY.current = e.clientY;
		startX.current = e.clientX;
		startValue.current = value ?? minValue;
		ghostValueRef.current = null;
		hasMoved.current = false;
		dragging.current = true;
		if (!rounded) {
			basePrecision.current = Math.max(2, countDecimals(value ?? minValue));
			extraDecimalsRef.current = 0;
			setExtraDecimals(0);
		}
		const svgEl = svgInnerRef.current;
		svgRectRef.current = svgEl
			? {
					left: svgEl.getBoundingClientRect().left,
					top: svgEl.getBoundingClientRect().top,
				}
			: null;
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dragging.current || startY.current === null) return;
		const yDelta = startY.current - e.clientY;
		if (!hasMoved.current && Math.abs(yDelta) < 4) return;
		hasMoved.current = true;

		let newValue: number;
		if (!rounded && startX.current !== null) {
			const xDelta = e.clientX - startX.current;
			const absDist = Math.abs(xDelta);
			const magnitude =
				absDist < 45 ? 0 : Math.min(6, 1 + Math.floor((absDist - 45) / 25));
			const extra = Math.max(
				-basePrecision.current,
				xDelta < 0 ? magnitude : -magnitude,
			);
			if (extra !== extraDecimalsRef.current) {
				startValue.current = ghostValueRef.current ?? startValue.current;
				startY.current = e.clientY;
				extraDecimalsRef.current = extra;
				setExtraDecimals(extra);
			}
			const scale = Math.pow(10, -extra);
			const currentYDelta = startY.current - e.clientY;
			const raw =
				startValue.current +
				(currentYDelta / 2) * ((maxValue - minValue) / 127) * scale;
			newValue = Math.min(maxValue, Math.max(minValue, raw));
		} else {
			const raw =
				startValue.current + (yDelta / 2) * ((maxValue - minValue) / 127);
			newValue = Math.min(
				maxValue,
				Math.max(minValue, rounded ? Math.round(raw) : raw),
			);
		}
		ghostValueRef.current = newValue;
		setGhostValue(newValue);
		onDrag?.(newValue);

		const svgRect = svgRectRef.current;
		if (svgRect && span !== 0) {
			const ghostAng = startAngle - ((newValue - minValue) / span) * totalAngle;
			setDragOverlay({
				sx: svgRect.left + center + radius * Math.cos(ghostAng),
				sy: svgRect.top + center - radius * Math.sin(ghostAng),
				cx: e.clientX,
				cy: e.clientY,
			});
		}
	};

	const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dragging.current) return;
		dragging.current = false;
		if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
			e.currentTarget.releasePointerCapture(e.pointerId);
		}
		let committed = ghostValueRef.current;
		if (!rounded && committed !== null) {
			const precision = Math.max(
				0,
				basePrecision.current + extraDecimalsRef.current,
			);
			const factor = Math.pow(10, precision);
			committed = Math.round(committed * factor) / factor;
		}
		const moved = hasMoved.current;
		startY.current = null;
		startX.current = null;
		ghostValueRef.current = null;
		hasMoved.current = false;
		extraDecimalsRef.current = 0;
		setExtraDecimals(0);
		setDragOverlay(null);
		setGhostValue(null);
		if (!moved) {
			onTap?.();
		} else if (committed !== null && committed !== value) {
			onManualSliderChange?.(committed);
		}
	};

	const formatValue = (v: number | undefined): string => {
		if (v === undefined || v === null) return "...";
		if (rounded) return String(Math.round(v));
		const str = String(v);
		const dotIdx = str.indexOf(".");
		if (dotIdx === -1) return str;
		const decimals = str.length - dotIdx - 1;
		if (decimals <= 4) return v.toFixed(decimals);
		return `${v.toFixed(4)}...`;
	};

	const dragLine = dragOverlay
		? (() => {
				const dx = dragOverlay.cx - dragOverlay.sx;
				const dy = dragOverlay.cy - dragOverlay.sy;
				const dist = Math.sqrt(dx * dx + dy * dy);
				if (dist < 6) return null;
				return {
					x1: dragOverlay.sx,
					y1: dragOverlay.sy,
					x2: dragOverlay.cx,
					y2: dragOverlay.cy,
				};
			})()
		: null;

	return (
		<>
			<div
				style={{
					flexDirection: labelPosition === "top" ? "column" : "column-reverse",
					display: "flex",
					alignItems: "center",
					userSelect: "none",
					touchAction: "none",
					marginTop: "4px",
					position: "relative",
					gap: "2px",
				}}
				onPointerDown={disabled ? undefined : handlePointerDown}
				onPointerMove={disabled ? undefined : handlePointerMove}
				onPointerUp={disabled ? undefined : endDrag}
				onPointerCancel={disabled ? undefined : endDrag}
			>
				<span style={{ fontSize: "12px" }}>
					{generateAcronym(
						param.name
							.replace(/_cv$/, "")
							.replace(stripPrefix ? /^[^_]+_/ : "", ""),
						acronymeLimit,
					)}
				</span>
				<div style={{ position: "relative" }}>
					<svg width={size} height={size} ref={svgInnerRef}>
						<circle
							cx={center}
							cy={center}
							r={radius}
							stroke={disabled ? "none" : "gray"}
							strokeWidth={strokeWidth}
							fill="none"
						/>
						{!disabled && <circle cx={cx} cy={cy} r={4} fill="orange" />}

						{!disabled && ghostValue !== null && (
							<circle
								cx={ghostCx}
								cy={ghostCy}
								r={4}
								fill="orange"
								opacity={0.4}
							/>
						)}
					</svg>
					<span
						style={{
							position: "absolute",
							top: "50%",
							left: "50%",
							transform: "translate(-50%, -50%)",
							fontSize: "11px",
							pointerEvents: "none",
							zIndex: 10,
							color: "#333",
							whiteSpace: "nowrap",
						}}
					>
						{disabled ? "..." : formatValue(value)}
					</span>

					{ghostValue !== null && (
						<span
							style={{
								position: "absolute",
								top: "calc(50% + 2px)",
								left: "50%",
								transform: "translateX(-50%)",
								fontSize: "11px",
								pointerEvents: "none",
								zIndex: 100,
								color: "rgba(0,0,0,0.55)",
								borderRadius: "3px",
								padding: "1px 4px",
							}}
						>
							{!rounded
								? ghostValue.toFixed(
										Math.max(0, basePrecision.current + extraDecimals),
									)
								: String(ghostValue)}
						</span>
					)}
				</div>
			</div>
			{dragLine &&
				createPortal(
					<svg
						style={{
							position: "fixed",
							top: 0,
							left: 0,
							width: "100%",
							height: "100%",
							pointerEvents: "none",
							zIndex: 9999,
						}}
					>
						<line
							x1={dragLine.x1}
							y1={dragLine.y1}
							x2={dragLine.x2}
							y2={dragLine.y2}
							stroke="rgba(0,0,0,0.45)"
							strokeWidth={1.5}
							strokeDasharray="5 4"
						/>
					</svg>,
					document.body,
				)}
		</>
	);
};

// When another parameter asks for this one (the T and S lists of its menu): scroll it into
// view, then blink twice in orange. Returns whether it is lit right now.
const useRevealBlink = (
	linkId: string | undefined,
	rootRef: React.RefObject<HTMLElement | null>,
) => {
	const revealTarget = useTrevorSelector((state) => state.runTime.revealTarget);
	const [lit, setLit] = useState(false);
	useEffect(() => {
		if (!linkId || revealTarget?.id !== linkId) return undefined;
		const timers: ReturnType<typeof setTimeout>[] = [];
		let started = false;
		const blink = () => {
			if (started) return;
			started = true;
			// on, off, on, off
			for (let i = 0; i < 4; i++) {
				timers.push(setTimeout(() => setLit(i % 2 === 0), i * 220));
			}
		};
		// the racks open what hides it, which can take more than a frame: wait for the bar
		// to have a box, then scroll to it (nothing scrolls to a hidden element)
		let tries = 0;
		let frame = 0;
		const scrollWhenVisible = () => {
			const el = rootRef.current;
			if (el && el.getBoundingClientRect().width > 0) {
				el.scrollIntoView({
					behavior: "smooth",
					block: "center",
					inline: "center",
				});
				// the blink waits for the end of the scroll; when it is already in view
				// nothing scrolls, so a timeout starts it as well
				window.addEventListener("scrollend", blink, {
					once: true,
					capture: true,
				});
				timers.push(setTimeout(blink, 700));
				return;
			}
			if (tries++ < 90) frame = requestAnimationFrame(scrollWhenVisible);
		};
		frame = requestAnimationFrame(scrollWhenVisible);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("scrollend", blink, true);
			for (const timer of timers) clearTimeout(timer);
			setLit(false);
		};
	}, [revealTarget]);
	return lit;
};

export const BarSlider = ({
	value: rawValue,
	param,
	onManualSliderChange,
	onDrag,
	onTap,
	acronymeLimit = 15,
	maxValue: maxProp = 127,
	minValue: minProp = 0,
	rounded: roundedProp = true,
	disabled = false,
	stripPrefix = false,
	bipolar = false,
	selected = false,
	linkId,
}: {
	param: MidiParameter | VirtualParameter;
	onManualSliderChange: (value: number | string) => void;
	value: number | string | boolean | undefined;
	acronymeLimit?: number;
	onDrag?: (value: number) => void;
	onTap?: () => void;
	maxValue?: number;
	minValue?: number;
	rounded?: boolean;
	disabled?: boolean;
	stripPrefix?: boolean;
	// the fill starts from the zero of the range (in the middle) instead of the left edge
	bipolar?: boolean;
	// picked as the source of a link (gold border)
	selected?: boolean;
	// anchor id the links are drawn to
	linkId?: string;
}) => {
	const acceptedValues = param.accepted_values;
	const isChoice = !!acceptedValues?.length;
	const [localIndex, setLocalIndex] = useState<number | null>(null);
	const resolvedIndex = isChoice
		? resolveAcceptedValueIndex(
				rawValue as number | string | undefined,
				acceptedValues,
				param.range[1],
			)
		: 0;
	useEffect(() => {
		if (localIndex !== null && resolvedIndex === localIndex) {
			setLocalIndex(null);
		}
	}, [rawValue]);

	// label: name only; info: name + value (read-only); edit: name + value, editable
	const [mode, setMode] = useState<"label" | "info" | "edit">("label");
	const editing = mode === "edit";
	const showing = mode !== "label";
	const [draft, setDraft] = useState("");
	const [menuPos, setMenuPos] = useState<{
		left: number;
		top: number;
		maxHeight: number;
	} | null>(null);

	const lastTap = useRef(0);
	const rootRef = useRef<HTMLDivElement>(null);
	const blinking = useRevealBlink(linkId, rootRef);
	const menuRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (editing && !isChoice) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [editing]);

	// Leave the accepted-value edit state (and its menu) on a pointer down elsewhere
	useEffect(() => {
		if (!editing || !isChoice) return;
		const onDown = (e: PointerEvent) => {
			const target = e.target as Node;
			if (
				rootRef.current?.contains(target) ||
				menuRef.current?.contains(target)
			)
				return;
			setMenuPos(null);
			setMode("info");
		};
		document.addEventListener("pointerdown", onDown);
		return () => document.removeEventListener("pointerdown", onDown);
	}, [mode]);

	const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const captured = useRef<{ el: HTMLElement; id: number } | null>(null);
	const cancelLongPress = () => {
		if (longPressTimer.current) clearTimeout(longPressTimer.current);
		longPressTimer.current = null;
	};
	const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			cancelLongPress();
			if (tapTimer.current) clearTimeout(tapTimer.current);
		},
		[],
	);

	// In choice mode the slider works on indexes into accepted_values
	const value = isChoice
		? (localIndex ?? resolvedIndex)
		: (rawValue as number | undefined);
	const minValue = isChoice ? 0 : minProp;
	const maxValue = isChoice ? acceptedValues.length - 1 : maxProp;
	const rounded = isChoice || roundedProp;

	const width = 88;
	const ACRONYM_LEFT = 4;
	// room kept left of the edited value for the 5-char acronym
	const ACRONYM_SPACE = 42;
	const height = 22;
	// anchor of the drag line: the edge of the filled zone
	const pointAt = (t: number) => ({ x: t * width, y: height / 2 });

	const [ghostValue, setGhostValue] = useState<number | null>(null);
	const ghostValueRef = useRef<number | null>(null);
	const svgInnerRef = useRef<HTMLDivElement>(null);
	const svgRectRef = useRef<{ left: number; top: number } | null>(null);
	const startY = useRef<number | null>(null);
	const startX = useRef<number | null>(null);
	const startValue = useRef<number>(value ?? minValue);
	const hasMoved = useRef(false);
	const isTouch = useRef(false);
	const dragging = useRef(false);
	const basePrecision = useRef<number>(0);
	const extraDecimalsRef = useRef<number>(0);
	const [extraDecimals, setExtraDecimals] = useState<number>(0);
	const [dragOverlay, setDragOverlay] = useState<{
		sx: number;
		sy: number;
		cx: number;
		cy: number;
	} | null>(null);

	const span = maxValue - minValue;
	const fraction = (v: number | undefined) =>
		v !== undefined && span !== 0
			? Math.min(1, Math.max(0, (v - minValue) / span))
			: 0;

	// filled zone of a value, in % of the bar width
	const fillSpan = (v: number | undefined) => {
		const f = fraction(v);
		const zero = bipolar ? fraction(0) : 0;
		return { from: Math.min(zero, f) * 100, to: Math.max(zero, f) * 100 };
	};
	const fillClip = (v: number | undefined) => {
		const { from, to } = fillSpan(v);
		return `inset(0 ${100 - to}% 0 ${from}%)`;
	};

	const countDecimals = (v: number): number => {
		const s = v.toString();
		const d = s.indexOf(".");
		return d === -1 ? 0 : s.length - d - 1;
	};

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		isTouch.current = e.pointerType === "touch";
		startY.current = e.clientY;
		startX.current = e.clientX;
		startValue.current = value ?? minValue;
		ghostValueRef.current = null;
		hasMoved.current = false;
		dragging.current = true;
		captured.current = { el: e.currentTarget, id: e.pointerId };
		cancelLongPress();
		longPressTimer.current = setTimeout(() => {
			// a long press without moving switches to the editable view
			longPressTimer.current = null;
			dragging.current = false;
			startY.current = null;
			startX.current = null;
			if (captured.current?.el.hasPointerCapture?.(captured.current.id)) {
				captured.current.el.releasePointerCapture(captured.current.id);
			}
			setDraft(isChoice ? "" : String(value ?? ""));
			setMode("edit");
			if (isChoice) openMenu();
		}, 500);
		if (!rounded) {
			basePrecision.current = Math.max(2, countDecimals(value ?? minValue));
			extraDecimalsRef.current = 0;
			setExtraDecimals(0);
		}
		const svgEl = svgInnerRef.current;
		svgRectRef.current = svgEl
			? {
					left: svgEl.getBoundingClientRect().left,
					top: svgEl.getBoundingClientRect().top,
				}
			: null;
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dragging.current || startY.current === null) return;
		const yDelta = startY.current - e.clientY;
		if (!hasMoved.current && Math.abs(yDelta) < 4) return;
		hasMoved.current = true;
		cancelLongPress();

		let newValue: number;
		if (!rounded && startX.current !== null) {
			const xDelta = e.clientX - startX.current;
			const absDist = Math.abs(xDelta);
			const magnitude =
				absDist < 45 ? 0 : Math.min(6, 1 + Math.floor((absDist - 45) / 25));
			const extra = Math.max(
				-basePrecision.current,
				xDelta < 0 ? magnitude : -magnitude,
			);
			if (extra !== extraDecimalsRef.current) {
				startValue.current = ghostValueRef.current ?? startValue.current;
				startY.current = e.clientY;
				extraDecimalsRef.current = extra;
				setExtraDecimals(extra);
			}
			const scale = Math.pow(10, -extra);
			const currentYDelta = startY.current - e.clientY;
			const raw =
				startValue.current +
				(currentYDelta / 2) * ((maxValue - minValue) / 127) * scale;
			newValue = Math.min(maxValue, Math.max(minValue, raw));
		} else {
			const raw =
				startValue.current +
				(isChoice ? yDelta / 30 : (yDelta / 2) * ((maxValue - minValue) / 127));
			newValue = Math.min(
				maxValue,
				Math.max(minValue, rounded ? Math.round(raw) : raw),
			);
		}
		ghostValueRef.current = newValue;
		setGhostValue(newValue);
		onDrag?.(newValue);

		const svgRect = svgRectRef.current;
		if (svgRect && span !== 0) {
			const ghostPoint = pointAt(fraction(newValue));
			setDragOverlay({
				sx: svgRect.left + ghostPoint.x,
				sy: svgRect.top + ghostPoint.y,
				cx: e.clientX,
				cy: e.clientY,
			});
		}
	};

	const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
		cancelLongPress();
		if (!dragging.current) return;
		dragging.current = false;
		if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
			e.currentTarget.releasePointerCapture(e.pointerId);
		}
		let committed = ghostValueRef.current;
		if (!rounded && committed !== null) {
			const precision = Math.max(
				0,
				basePrecision.current + extraDecimalsRef.current,
			);
			const factor = 10 ** precision;
			committed = Math.round(committed * factor) / factor;
		}
		const moved = hasMoved.current;
		startY.current = null;
		startX.current = null;
		ghostValueRef.current = null;
		hasMoved.current = false;
		extraDecimalsRef.current = 0;
		setExtraDecimals(0);
		setDragOverlay(null);
		setGhostValue(null);
		if (!moved) {
			const now = Date.now();
			if (tapTimer.current) clearTimeout(tapTimer.current);
			tapTimer.current = null;
			if (now - lastTap.current < 350) {
				lastTap.current = 0;
				setMode((m) => (m === "info" ? "label" : "info"));
			} else {
				lastTap.current = now;
				// a single tap is only confirmed once no second tap follows
				tapTimer.current = setTimeout(() => {
					tapTimer.current = null;
					onTap?.();
				}, 350);
			}
		} else if (committed !== null && committed !== value) {
			if (isChoice) {
				setLocalIndex(committed);
				onManualSliderChange?.(acceptedValues[committed].toString());
			} else {
				onManualSliderChange?.(committed);
			}
		}
	};

	const splitTextStyle = (offset = 0): React.CSSProperties => ({
		backgroundImage: `linear-gradient(to right, var(--black) ${fillSpan(value).from}%, var(--browntext) ${fillSpan(value).from}%, var(--browntext) ${fillSpan(value).to}%, var(--black) ${fillSpan(value).to}%)`,
		backgroundPosition: `${-offset}px 0`,
		backgroundSize: `${width}px 100%`,
		backgroundRepeat: "no-repeat",
		WebkitBackgroundClip: "text",
		backgroundClip: "text",
		WebkitTextFillColor: "transparent",
		caretColor: "var(--black)",
	});

	const numericText = (() => {
		if (value === undefined) return "...";
		if (rounded) return String(Math.round(value));
		const str = String(value);
		const dot = str.indexOf(".");
		if (dot === -1 || str.length - dot - 1 <= 4) return str;
		return `${value.toFixed(4)}...`;
	})();

	const commitDraft = () => {
		setMode("info");
		const typed = Number(draft.replace(",", "."));
		if (draft.trim() === "" || Number.isNaN(typed)) return;
		let v = Math.min(maxValue, Math.max(minValue, typed));
		if (rounded) v = Math.round(v);
		if (v !== value) onManualSliderChange?.(v);
	};

	const openMenu = () => {
		const r = rootRef.current?.getBoundingClientRect();
		if (!r) return;
		setMenuPos({
			left: r.left,
			top: r.bottom + 2,
			maxHeight: Math.max(80, window.innerHeight - r.bottom - 10),
		});
	};

	const pickAcceptedValue = (index: number) => {
		setLocalIndex(index);
		onManualSliderChange?.(acceptedValues[index].toString());
		setMenuPos(null);
		setMode("info");
	};

	const choiceName = isChoice ? String(acceptedValues[value ?? 0] ?? "") : "";

	const ghostText =
		ghostValue === null
			? ""
			: isChoice
				? String(acceptedValues[ghostValue] ?? "")
				: rounded
					? String(ghostValue)
					: ghostValue.toFixed(
							Math.max(0, basePrecision.current + extraDecimals),
						);

	const label = generateAcronym(
		param.name.replace(/_cv$/, "").replace(stripPrefix ? /^[^_]+_/ : "", ""),
		acronymeLimit,
	);

	const shortLabel = generateAcronym(
		param.name.replace(/_cv$/, "").replace(stripPrefix ? /^[^_]+_/ : "", ""),
		5,
	);

	const dragLine = dragOverlay
		? (() => {
				const dx = dragOverlay.cx - dragOverlay.sx;
				const dy = dragOverlay.cy - dragOverlay.sy;
				const dist = Math.sqrt(dx * dx + dy * dy);
				if (dist < 6) return null;
				return {
					x1: dragOverlay.sx,
					y1: dragOverlay.sy,
					x2: dragOverlay.cx,
					y2: dragOverlay.cy,
				};
			})()
		: null;

	return (
		<>
			<div
				ref={rootRef}
				data-bar-id={linkId}
				id={linkId ? `bar-${linkId}` : undefined}
				style={{
					boxShadow: blinking ? "0 0 0 3px orange" : undefined,
					display: "flex",
					alignItems: "center",
					userSelect: "none",
					touchAction: "none",
					marginTop: "4px",
					position: "relative",
					gap: "2px",
				}}
				onPointerDown={disabled || editing ? undefined : handlePointerDown}
				onPointerMove={disabled || editing ? undefined : handlePointerMove}
				onPointerUp={disabled || editing ? undefined : endDrag}
				onPointerCancel={disabled || editing ? undefined : endDrag}
				onContextMenu={(e) => e.preventDefault()}
			>
				<div
					ref={svgInnerRef}
					style={{
						position: "relative",
						width,
						height,
						boxSizing: "border-box",
						background: "var(--rack-bg-color)",
						overflow: "hidden",
						fontSize: "12px",
						fontWeight: "bold",
					}}
				>
					<div
						style={{
							position: "absolute",
							inset: 0,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							whiteSpace: "nowrap",
							pointerEvents: editing ? "auto" : "none",
							// above the orange fill, which would hide the text at max
							zIndex: showing ? 1 : undefined,
							color: "var(--black)",
						}}
					>
						{showing && !isChoice ? (
							<>
								<span
									style={{
										position: "absolute",
										left: ACRONYM_LEFT,
										pointerEvents: "none",
										...splitTextStyle(ACRONYM_LEFT),
									}}
								>
									{shortLabel}
								</span>
								{editing ? (
									<input
										ref={inputRef}
										value={draft}
										inputMode={rounded ? "numeric" : "decimal"}
										onChange={(e) => setDraft(e.target.value)}
										onBlur={commitDraft}
										onKeyDown={(e) => {
											if (e.key === "Enter") commitDraft();
											if (e.key === "Escape") setMode("info");
										}}
										style={{
											width: "100%",
											height: "100%",
											boxSizing: "border-box",
											padding: 0,
											border: "none",
											outline: "none",
											textAlign: "center",
											font: "inherit",
											...splitTextStyle(),
											paddingLeft: ACRONYM_SPACE,
										}}
									/>
								) : (
									<span
										style={{
											width: "100%",
											boxSizing: "border-box",
											textAlign: "center",
											...splitTextStyle(),
											paddingLeft: ACRONYM_SPACE,
										}}
									>
										{numericText}
									</span>
								)}
							</>
						) : showing ? (
							<span
								onClick={editing ? openMenu : undefined}
								style={{
									cursor: editing ? "pointer" : undefined,
									width: "100%",
									textAlign: "center",
									...splitTextStyle(),
								}}
							>
								{choiceName}
							</span>
						) : (
							label
						)}
					</div>
					{!disabled && (
						<div
							style={{
								position: "absolute",
								inset: 0,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								whiteSpace: "nowrap",
								pointerEvents: "none",
								background: "orange",
								color: "var(--browntext)",
								clipPath: fillClip(ghostValue ?? value),
							}}
						>
							{showing ? null : label}
						</div>
					)}
					{!disabled && ghostValue !== null && (
						<div
							style={{
								position: "absolute",
								inset: 0,
								pointerEvents: "none",
								background: "var(--browntext)",
								opacity: 0.3,
								// where the bar was when the drag started
								clipPath: fillClip(value),
							}}
						/>
					)}
					{blinking && (
						<div
							style={{
								position: "absolute",
								inset: 0,
								background: "orange",
								opacity: 0.6,
								pointerEvents: "none",
								zIndex: 3,
							}}
						/>
					)}
					{selected && (
						<div
							style={{
								position: "absolute",
								inset: 0,
								border: "2px solid gold",
								pointerEvents: "none",
								zIndex: 2,
							}}
						/>
					)}
				</div>
			</div>
			{selected && linkId && <ParameterMenu id={linkId} anchorRef={rootRef} />}
			{dragOverlay &&
				createPortal(
					<>
						{dragLine && (
							<svg
								style={{
									position: "fixed",
									top: 0,
									left: 0,
									width: "100%",
									height: "100%",
									pointerEvents: "none",
									zIndex: 9999,
								}}
							>
								<line
									x1={dragLine.x1}
									y1={dragLine.y1}
									x2={dragLine.x2}
									y2={dragLine.y2}
									stroke="rgba(0,0,0,0.45)"
									strokeWidth={1.5}
									strokeDasharray="5 4"
								/>
							</svg>
						)}
						<div
							style={{
								position: "fixed",
								left: dragOverlay.cx,
								top: dragOverlay.cy - (isTouch.current ? 72 : 36),
								transform: "translateX(-50%)",
								pointerEvents: "none",
								zIndex: 10000,
								fontSize: "13px",
								padding: "2px 6px",
								borderRadius: "4px",
								background: "orange",
								color: "var(--browntext)",
								whiteSpace: "nowrap",
							}}
						>
							{ghostText}
						</div>
					</>,
					document.body,
				)}
			{menuPos &&
				createPortal(
					<div
						ref={menuRef}
						data-bar-menu
						style={{
							position: "fixed",
							left: menuPos.left,
							top: menuPos.top,
							minWidth: width,
							maxHeight: menuPos.maxHeight,
							overflowY: "auto",
							zIndex: 10000,
							backgroundColor: "#e0e0e0",
							border: "3px solid #808080",
							fontSize: "12px",
						}}
					>
						{acceptedValues.map((av, index) => (
							<div
								key={`${index}-${av}`}
								onClick={() => pickAcceptedValue(index)}
								style={{
									padding: "3px 6px",
									cursor: "pointer",
									whiteSpace: "nowrap",
									backgroundColor: index === value ? "orange" : "transparent",
									color: index === value ? "var(--browntext)" : "var(--black)",
								}}
							>
								{String(av)}
							</div>
						))}
					</div>,
					document.body,
				)}
		</>
	);
};

export const KeysBar = ({
	keys,
	selected = [],
	onSelectionChange,
	acronymeLimit = 10,
	linked = false,
	linkId,
	onTap,
}: {
	keys: PadsOrKeys;
	selected?: number[];
	onSelectionChange?: (notes: number[]) => void;
	acronymeLimit?: number;
	// picked as the source of a link (gold border)
	linked?: boolean;
	linkId?: string;
	onTap?: () => void;
}) => {
	const width = 88;
	const height = 22;
	const [localSelected, setLocalSelected] = useState<number[]>(selected);
	const [menuPos, setMenuPos] = useState<{
		left: number;
		top: number;
		maxHeight: number;
	} | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const origin = useRef<{ x: number; y: number } | null>(null);

	const blinking = useRevealBlink(linkId, rootRef);

	const cancelPress = () => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = null;
		origin.current = null;
	};
	useEffect(() => cancelPress, []);

	useEffect(() => {
		if (!menuPos) return;
		const onDown = (e: PointerEvent) => {
			const target = e.target as Node;
			if (
				rootRef.current?.contains(target) ||
				menuRef.current?.contains(target)
			)
				return;
			setMenuPos(null);
		};
		document.addEventListener("pointerdown", onDown);
		return () => document.removeEventListener("pointerdown", onDown);
	}, [menuPos]);

	const openMenu = () => {
		const r = rootRef.current?.getBoundingClientRect();
		if (!r) return;
		setMenuPos({
			left: r.left,
			top: r.bottom + 2,
			maxHeight: Math.max(80, window.innerHeight - r.bottom - 10),
		});
	};

	const toggle = (note: number) => {
		const next = localSelected.includes(note)
			? localSelected.filter((n) => n !== note)
			: [...localSelected, note].sort((a, c) => a - c);
		setLocalSelected(next);
		onSelectionChange?.(next);
	};

	const [low, high] = keys.range ?? [0, 127];
	const notes = Array.from({ length: high - low + 1 }, (_, i) => low + i);

	return (
		<>
			<div
				ref={rootRef}
				data-bar-id={linkId}
				id={linkId ? `bar-${linkId}` : undefined}
				style={{
					boxShadow: blinking ? "0 0 0 3px orange" : undefined,
					position: "relative",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					gap: "4px",
					width,
					height,
					boxSizing: "border-box",
					marginTop: "4px",
					border: `2px solid ${linked ? "gold" : "orange"}`,
					background: blinking ? "orange" : "var(--rack-bg-color)",
					color: "var(--black)",
					fontSize: "12px",
					fontWeight: "bold",
					whiteSpace: "nowrap",
					userSelect: "none",
					touchAction: "none",
				}}
				onPointerDown={(e) => {
					cancelPress();
					origin.current = { x: e.clientX, y: e.clientY };
					timer.current = setTimeout(() => {
						timer.current = null;
						openMenu();
					}, 500);
				}}
				onPointerMove={(e) => {
					if (
						origin.current &&
						Math.hypot(
							e.clientX - origin.current.x,
							e.clientY - origin.current.y,
						) > 8
					)
						cancelPress();
				}}
				onPointerUp={() => {
					// released before the long press fired: a tap
					const wasTap = timer.current !== null;
					cancelPress();
					if (wasTap) onTap?.();
				}}
				onPointerCancel={cancelPress}
				onContextMenu={(e) => e.preventDefault()}
			>
				<span role="img" aria-label="piano" style={{ fontSize: "12px" }}>
					🎹
				</span>
				<span>{generateAcronym(keys.name ?? "keys", acronymeLimit)}</span>
			</div>
			{linked && linkId && <ParameterMenu id={linkId} anchorRef={rootRef} />}
			{menuPos &&
				createPortal(
					<div
						ref={menuRef}
						data-bar-menu
						style={{
							position: "fixed",
							left: menuPos.left,
							top: menuPos.top,
							minWidth: width,
							maxHeight: menuPos.maxHeight,
							overflowY: "auto",
							zIndex: 10000,
							backgroundColor: "#e0e0e0",
							border: "3px solid #808080",
							fontSize: "12px",
						}}
					>
						{notes.map((note) => (
							<div
								key={note}
								onClick={() => toggle(note)}
								style={{
									display: "flex",
									justifyContent: "space-between",
									gap: "12px",
									padding: "3px 6px",
									cursor: "pointer",
									whiteSpace: "nowrap",
									backgroundColor: localSelected.includes(note)
										? "orange"
										: "transparent",
									color: localSelected.includes(note)
										? "var(--browntext)"
										: "var(--black)",
								}}
							>
								<span>{getNoteName(note)}</span>
								<span>{note}</span>
							</div>
						))}
					</div>,
					document.body,
				)}
		</>
	);
};

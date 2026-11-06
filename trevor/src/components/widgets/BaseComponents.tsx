/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
/** biome-ignore-all lint/a11y/noSvgWithoutTitle: <explanation> */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRackScale } from "../../hooks/RackScaleContext";
import type { MidiParameter, PadsOrKeys, VirtualParameter } from "../../model";
import { useTrevorSelector } from "../../store";
import {
    connectionEndId,
    generateAcronym,
    resolveAcceptedValueIndex,
} from "../../utils/utils";
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

export const lightButtonStyle = (
	activated = false,
	onTitleBar = false,
): React.CSSProperties => {
	const background = activated ? "gold" : "#e0e0e0";
	return {
		backgroundColor: background,
		fontSize: "12px",
		...(onTitleBar
			? { border: `2px solid ${background}`, marginInlineStart: 3 }
			: {}),
	};
};

export const menuButtonStyle = (activated = false): React.CSSProperties => ({
	...lightButtonStyle(activated),
	width: 20,
	minWidth: 20,
	height: 20,
	minHeight: 20,
	fontSize: "14px",
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

const CONTINUOUS_SEND_MS = 50;
const DOUBLE_TAP_MS = 250;

export interface DropdownOption<K extends string | number> {
	key: K;
	label: React.ReactNode;
	title?: string;
	active?: boolean;
}

const DROPDOWN_MARGIN = 4;

export const Dropdown = <K extends string | number>({
	options,
	onSelect,
	position,
	minWidth,
	width,
	maxHeight = 200,
	keepOnScreen = false,
	optionStyle,
	innerRef,
	attributes,
}: {
	options: DropdownOption<K>[];
	onSelect: (key: K, event: React.MouseEvent) => void;
	position: { left?: number; right?: number; top?: number; bottom?: number };
	minWidth?: number;
	width?: "max-content";
	maxHeight?: number;
	keepOnScreen?: boolean;
	optionStyle?: React.CSSProperties;
	innerRef?: React.RefObject<HTMLDivElement | null>;
	attributes?: Record<`data-${string}`, string | boolean>;
}) => {
	const ownRef = useRef<HTMLDivElement>(null);
	const ref = innerRef ?? ownRef;
	const [moved, setMoved] = useState<{ left: number; top: number } | null>(
		null,
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: measured again when the point or the options change
	useLayoutEffect(() => {
		const rect = ref.current?.getBoundingClientRect();
		if (!keepOnScreen || !rect) return;
		const clampTo = (value: number, size: number, screen: number) =>
			Math.max(
				DROPDOWN_MARGIN,
				Math.min(value, screen - size - DROPDOWN_MARGIN),
			);
		setMoved({
			left: clampTo(position.left ?? 0, rect.width, window.innerWidth),
			top: clampTo(position.top ?? 0, rect.height, window.innerHeight),
		});
	}, [keepOnScreen, position.left, position.top, options.length]);

	return createPortal(
		<div
			ref={ref}
			data-bar-menu
			{...attributes}
			style={{
				position: "fixed",
				...position,
				...(keepOnScreen && moved ? moved : {}),
				minWidth,
				width,
				maxWidth: window.innerWidth - 2 * DROPDOWN_MARGIN,
				maxHeight,
				overflowY: "auto",
				zIndex: 10000,
				backgroundColor: "#e0e0e0",
				border: "3px solid #808080",
				fontSize: "12px",
			}}
		>
			{options.map((option) => (
				// biome-ignore lint/a11y/useKeyWithClickEvents: same as the other floating menus
				<div
					key={option.key}
					title={option.title}
					onClick={(event) => onSelect(option.key, event)}
					style={{
						padding: "3px 6px",
						cursor: "pointer",
						whiteSpace: "nowrap",
						backgroundColor: option.active ? "orange" : "transparent",
						color: option.active ? "var(--browntext)" : "var(--black)",
						...optionStyle,
					}}
				>
					{option.label}
				</div>
			))}
		</div>,
		document.body,
	);
};

export const DropdownButton = <K extends string | number>({
	text,
	tooltip,
	options,
	onSelect,
	placement = "below",
	disabled = false,
	style,
	className,
}: {
	text: string;
	tooltip: string;
	disabled?: boolean;
	options: DropdownOption<K>[];
	onSelect: (key: K, event: React.MouseEvent) => void;
	placement?: "below" | "right";
	style?: React.CSSProperties;
	className?: string;
}) => {
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const listRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!anchor) return;
		const onDown = (e: PointerEvent) => {
			const target = e.target as Node;
			if (anchor.contains(target) || listRef.current?.contains(target)) return;
			setAnchor(null);
		};
		document.addEventListener("pointerdown", onDown);
		return () => document.removeEventListener("pointerdown", onDown);
	}, [anchor]);
	const rect = anchor?.getBoundingClientRect();
	return (
		<>
			<Button
				text={text}
				tooltip={tooltip}
				activated={anchor !== null}
				disabled={disabled}
				style={style}
				className={className}
				onClick={(event) =>
					setAnchor((current) => (current ? null : event.currentTarget))
				}
			/>
			{rect && (
				<Dropdown
					innerRef={listRef}
					position={
						placement === "below"
							? { left: rect.left, top: rect.bottom + 2 }
							: { left: rect.right + 2, top: rect.top }
					}
					minWidth={placement === "below" ? rect.width : undefined}
					options={options}
					onSelect={(key, event) => {
						setAnchor(null);
						onSelect(key, event);
					}}
				/>
			)}
		</>
	);
};

let topWindow = 100;
export const FloatingWindow = ({
	id,
	position,
	onMove,
	children,
}: {
	id: string;
	position: { x: number; y: number };
	onMove: (position: { x: number; y: number }) => void;
	children: React.ReactNode;
}) => {
	const [z, setZ] = useState(() => ++topWindow);
	const grab = useRef<{ dx: number; dy: number } | null>(null);
	const boxRef = useRef<HTMLDivElement>(null);
	return createPortal(
		<div
			ref={boxRef}
			id={id}
			onPointerDownCapture={() => setZ(++topWindow)}
			style={{
				position: "fixed",
				left: position.x,
				top: position.y,
				zIndex: z,
			}}
		>
			<div style={{ position: "relative" }}>
				<div
					onPointerDown={(e) => {
						e.preventDefault();
						e.currentTarget.setPointerCapture(e.pointerId);
						grab.current = {
							dx: e.clientX - position.x,
							dy: e.clientY - position.y,
						};
					}}
					onPointerMove={(e) => {
						const box = boxRef.current;
						if (!grab.current || !box) return;
						onMove({
							x: Math.min(
								Math.max(e.clientX - grab.current.dx, 0),
								window.innerWidth - 40,
							),
							y: Math.min(
								Math.max(e.clientY - grab.current.dy, 0),
								window.innerHeight - 40,
							),
						});
					}}
					onPointerUp={() => {
						grab.current = null;
					}}
					onPointerCancel={() => {
						grab.current = null;
					}}
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						zIndex: 1,
						cursor: "grab",
						touchAction: "none",
						userSelect: "none",
						fontSize: "23px",
						color: "gray",
						width: "34px",
						height: "30px",
						paddingLeft: "7px",
						paddingTop: "5px",
						boxSizing: "border-box",
						lineHeight: "20px",
					}}
				>
					=
				</div>
				{children}
			</div>
		</div>,
		document.body,
	);
};

const useHasLinks = (linkId: string | undefined) =>
	useTrevorSelector(
		(state) =>
			!!linkId &&
			state.nallely.connections.some(
				(c) =>
					connectionEndId(c.src) === linkId ||
					connectionEndId(c.dest) === linkId,
			),
	);

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
			// on, off, on, off, on, off
			for (let i = 0; i < 6; i++) {
				timers.push(setTimeout(() => setLit(i % 2 === 0), i * 220));
			}
		};
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
	continuous = false,
	vertical = false,
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
	bipolar?: boolean;
	selected?: boolean;
	linkId?: string;
	continuous?: boolean;
	// turned 90° to the left, reading bottom to top: the bars of the horizontal racks
	vertical?: boolean;
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
	const hasLinks = useHasLinks(linkId);
	const rackScale = useRackScale();
	const menuRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (editing && !isChoice) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [editing]);

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

	const value = isChoice
		? (localIndex ?? resolvedIndex)
		: (rawValue as number | undefined);
	const minValue = isChoice ? 0 : minProp;
	const maxValue = isChoice ? acceptedValues.length - 1 : maxProp;
	const rounded = isChoice || roundedProp;

	const width = vertical ? 80 : 88;
	const ACRONYM_LEFT = 4;
	const ACRONYM_SPACE = 42;
	const height = 22;
	const pointAt = (t: number) => ({ x: t * width, y: height / 2 });

	const [ghostValue, setGhostValue] = useState<number | null>(null);
	const ghostValueRef = useRef<number | null>(null);
	const svgInnerRef = useRef<HTMLDivElement>(null);
	const svgRectRef = useRef<{ left: number; top: number } | null>(null);
	const startY = useRef<number | null>(null);
	const startX = useRef<number | null>(null);
	const startValue = useRef<number>(value ?? minValue);
	const hasMoved = useRef(false);
	const lastSent = useRef<number | null>(null);
	const lastSentAt = useRef(0);
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
		lastSent.current = null;
		lastSentAt.current = 0;
		dragging.current = true;
		captured.current = { el: e.currentTarget, id: e.pointerId };
		cancelLongPress();
		longPressTimer.current = setTimeout(() => {
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
		if (continuous) {
			const factor = rounded
				? 1
				: 10 ** Math.max(0, basePrecision.current + extraDecimalsRef.current);
			const step = Math.round(newValue * factor) / factor;
			const now = performance.now();
			if (
				step !== lastSent.current &&
				now - lastSentAt.current >= CONTINUOUS_SEND_MS
			) {
				lastSent.current = step;
				lastSentAt.current = now;
				if (isChoice) {
					setLocalIndex(step);
					onManualSliderChange?.(acceptedValues[step].toString());
				} else {
					onManualSliderChange?.(step);
				}
			}
		}

		const svgRect = svgRectRef.current;
		if (svgRect && span !== 0) {
			const ghostPoint = pointAt(fraction(newValue));
			// rotated bar: svgRect is its bounding box, the value grows upward
			setDragOverlay({
				sx: vertical
					? svgRect.left + ghostPoint.y * rackScale
					: svgRect.left + ghostPoint.x * rackScale,
				sy: vertical
					? svgRect.top + (width - ghostPoint.x) * rackScale
					: svgRect.top + ghostPoint.y * rackScale,
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
			if (now - lastTap.current < DOUBLE_TAP_MS) {
				lastTap.current = 0;
				setMode((m) => (m === "info" ? "label" : "info"));
			} else {
				lastTap.current = now;
				// a single tap is only confirmed once no second tap follows
				tapTimer.current = setTimeout(() => {
					tapTimer.current = null;
					onTap?.();
				}, DOUBLE_TAP_MS);
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
		const v = rounded ? Math.round(typed) : typed;
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
					// the 4px that separate the bars become a left margin: the gaps turn with the bars
					...(vertical && {
						width: height,
						height: width,
						marginTop: 0,
						marginLeft: "4px",
					}),
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
						position: vertical ? "absolute" : "relative",
						...(vertical && {
							left: 0,
							top: width,
							transformOrigin: "0 0",
							transform: "rotate(-90deg)",
						}),
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
					{hasLinks && (
						<div
							style={{
								position: "absolute",
								inset: 0,
								border: "2px solid var(--browntext)",
								// the text brown at 45%: lighter on the gray of the rack
								opacity: 0.45,
								pointerEvents: "none",
								zIndex: 1,
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
			{menuPos && (
				<Dropdown
					innerRef={menuRef}
					position={{ left: menuPos.left, top: menuPos.top }}
					minWidth={width}
					maxHeight={menuPos.maxHeight}
					options={acceptedValues.map((av, index) => ({
						key: index,
						label: String(av),
						active: index === value,
					}))}
					onSelect={pickAcceptedValue}
				/>
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
	vertical = false,
}: {
	keys: PadsOrKeys;
	selected?: number[];
	onSelectionChange?: (notes: number[]) => void;
	acronymeLimit?: number;
	// picked as the source of a link (gold border)
	linked?: boolean;
	linkId?: string;
	onTap?: () => void;
	// turned 90° to the left, reading bottom to top (horizontal racks)
	vertical?: boolean;
}) => {
	const width = vertical ? 80 : 88;
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
	const hasLinks = useHasLinks(linkId);

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
					width: vertical ? height : width,
					height: vertical ? width : height,
					...(vertical && {
						writingMode: "vertical-rl",
						transform: "rotate(180deg)",
					}),
					boxSizing: "border-box",
					marginTop: vertical ? 0 : "4px",
					marginLeft: vertical ? "4px" : 0,
					border: `2px solid ${linked ? "gold" : hasLinks ? "rgba(123, 85, 15, 0.45)" : "orange"}`,
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
			{menuPos && (
				<Dropdown
					innerRef={menuRef}
					position={{ left: menuPos.left, top: menuPos.top }}
					minWidth={width}
					maxHeight={menuPos.maxHeight}
					optionStyle={{
						display: "flex",
						justifyContent: "space-between",
						gap: "12px",
					}}
					options={notes.map((note) => ({
						key: note,
						label: (
							<>
								<span>{getNoteName(note)}</span>
								<span>{note}</span>
							</>
						),
						active: localSelected.includes(note),
					}))}
					onSelect={toggle}
				/>
			)}
		</>
	);
};

const RANGE_BAR_HEIGHT = 22;
const RANGE_BAR_WIDTH = 88; // as the parameter bars
const RANGE_BAR_MARGIN = 3;

type RangeSide = "lower" | "upper";

export const RangeBarSlider = ({
	lower,
	upper,
	range,
	disabled = false,
	onChange,
}: {
	lower: number | undefined;
	upper: number | undefined;
	range: [number, number];
	disabled?: boolean;
	onChange: (side: RangeSide, value: number) => void;
}) => {
	const [low, high] = range;
	const span = high - low;
	const countDecimals = (v: number) => {
		const str = v.toString();
		const dot = str.indexOf(".");
		return dot === -1 ? 0 : str.length - dot - 1;
	};
	const [drag, setDrag] = useState<{
		side: RangeSide;
		value: number;
		precision: number;
	} | null>(null);
	const dragRef = useRef<{
		side: RangeSide;
		startX: number;
		startY: number;
		startValue: number;
		moved: boolean;
		value: number;
		basePrecision: number;
		extra: number;
	} | null>(null);
	const [editing, setEditing] = useState<{
		side: RangeSide;
		draft: string;
	} | null>(null);
	const typingDone = useRef(false);

	const crosses = (side: RangeSide, value: number) => {
		if (lower === undefined || upper === undefined) return false;
		const before = Math.sign(lower - upper);
		const after = Math.sign(
			(side === "lower" ? value : lower) - (side === "upper" ? value : upper),
		);
		return before !== 0 && after !== 0 && before !== after;
	};
	const dragCrossed = drag ? crosses(drag.side, drag.value) : false;
	const moved = {
		lower: drag?.side === "lower" ? drag.value : lower,
		upper: drag?.side === "upper" ? drag.value : upper,
	};
	const shown = dragCrossed
		? { lower: moved.upper, upper: moved.lower }
		: moved;
	const dragSide: RangeSide | undefined = drag
		? dragCrossed
			? drag.side === "lower"
				? "upper"
				: "lower"
			: drag.side
		: undefined;
	const apply = (side: RangeSide, value: number) => {
		if (!crosses(side, value)) {
			onChange(side, value);
			return;
		}
		const other: RangeSide = side === "lower" ? "upper" : "lower";
		onChange(side, (other === "lower" ? lower : upper) as number);
		onChange(other, value);
	};
	const percent = (v: number | undefined) =>
		v === undefined || span === 0
			? undefined
			: Math.min(100, Math.max(0, ((v - low) / span) * 100));
	const from = percent(shown.lower);
	const to = percent(shown.upper);
	const text = (side: RangeSide) => {
		const v = shown[side];
		if (v === undefined) return "...";
		if (drag && dragSide === side) return v.toFixed(drag.precision);
		return String(Number(v.toFixed(4)));
	};

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		const box = e.currentTarget.getBoundingClientRect();
		const side: RangeSide =
			e.clientX - box.left < box.width / 2 ? "lower" : "upper";
		const startValue = shown[side] ?? low + span / 2;
		dragRef.current = {
			side,
			startX: e.clientX,
			startY: e.clientY,
			startValue,
			moved: false,
			value: startValue,
			basePrecision: Math.max(2, countDecimals(startValue)),
			extra: 0,
		};
		e.currentTarget.setPointerCapture?.(e.pointerId);
	};
	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		const d = dragRef.current;
		if (!d) return;
		if (!d.moved && Math.abs(d.startY - e.clientY) < 4) return;
		d.moved = true;
		// as in BarSlider: the further to the left, the finer; to the right, the coarser
		const xDelta = e.clientX - d.startX;
		const distance = Math.abs(xDelta);
		const magnitude =
			distance < 45 ? 0 : Math.min(6, 1 + Math.floor((distance - 45) / 25));
		const extra = Math.max(
			-d.basePrecision,
			xDelta < 0 ? magnitude : -magnitude,
		);
		if (extra !== d.extra) {
			d.startValue = d.value;
			d.startY = e.clientY;
			d.extra = extra;
		}
		const raw =
			d.startValue + ((d.startY - e.clientY) / 2) * (span / 127) * 10 ** -extra;
		d.value = Math.min(high, Math.max(low, raw));
		setDrag({
			side: d.side,
			value: d.value,
			precision: Math.max(0, d.basePrecision + extra),
		});
	};
	const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
		const d = dragRef.current;
		dragRef.current = null;
		if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
			e.currentTarget.releasePointerCapture(e.pointerId);
		}
		setDrag(null);
		if (!d) return;
		if (d.moved) {
			const factor = 10 ** Math.max(0, d.basePrecision + d.extra);
			const committed = Math.round(d.value * factor) / factor;
			// against the props: `shown` already holds the dragged value
			const current = d.side === "lower" ? lower : upper;
			if (committed !== current) apply(d.side, committed);
		} else if (e.type === "pointerup") {
			typingDone.current = false;
			setEditing({ side: d.side, draft: String(shown[d.side] ?? "") });
		}
	};

	const commit = () => {
		if (!editing || typingDone.current) return;
		typingDone.current = true;
		const typed = Number(editing.draft.replace(",", "."));
		// typed values are not capped to the declared range
		if (editing.draft.trim() !== "" && !Number.isNaN(typed)) {
			apply(editing.side, typed);
		}
		setEditing(null);
	};

	return (
		<div
			data-range-bar
			style={{
				position: "relative",
				width: RANGE_BAR_WIDTH,
				flexShrink: 0,
				height: RANGE_BAR_HEIGHT,
				boxSizing: "border-box",
				background: "var(--rack-bg-color)",
				overflow: "hidden",
				userSelect: "none",
				touchAction: "none",
				fontSize: "12px",
				fontWeight: "bold",
				color: "var(--black)",
				opacity: disabled ? 0.5 : 1,
			}}
			onPointerDown={disabled || editing ? undefined : handlePointerDown}
			onPointerMove={disabled || editing ? undefined : handlePointerMove}
			onPointerUp={disabled || editing ? undefined : handlePointerUp}
			onPointerCancel={disabled || editing ? undefined : handlePointerUp}
			onContextMenu={(e) => e.preventDefault()}
		>
			{!disabled && from !== undefined && to !== undefined && (
				<div
					style={{
						position: "absolute",
						top: 0,
						bottom: 0,
						left: `${Math.min(from, to)}%`,
						width: `${Math.abs(to - from)}%`,
						background: "orange",
						pointerEvents: "none",
					}}
				/>
			)}
			<div
				style={{
					position: "absolute",
					top: 0,
					bottom: 0,
					left: "50%",
					width: 1,
					background: "#808080",
					// only a hint of the sides
					opacity: 0.3,
					pointerEvents: "none",
				}}
			/>
			<div
				style={{
					position: "absolute",
					inset: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: `0 ${RANGE_BAR_MARGIN}px`,
					whiteSpace: "nowrap",
					pointerEvents: "none",
				}}
			>
				<span>{text("lower")}</span>
				<span>{text("upper")}</span>
			</div>
			{editing && (
				<input
					// biome-ignore lint/a11y/noAutofocus: opened by the tap
					autoFocus
					value={editing.draft}
					inputMode="decimal"
					onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
					onFocus={(e) => e.currentTarget.select()}
					onBlur={commit}
					onKeyDown={(e) => {
						if (e.key === "Enter") commit();
						if (e.key === "Escape") {
							typingDone.current = true;
							setEditing(null);
						}
					}}
					style={{
						position: "absolute",
						top: 0,
						bottom: 0,
						left: editing.side === "lower" ? 0 : "50%",
						width: "50%",
						boxSizing: "border-box",
						padding: 0,
						border: "none",
						outline: "none",
						textAlign: "center",
						font: "inherit",
						background: "var(--rack-bg-color)",
						color: "var(--black)",
					}}
				/>
			)}
		</div>
	);
};

import { Button, type WidgetProps } from "./BaseComponents";
import DragNumberInput from "../DragInputs";
import { useEffect, useRef, useState } from "react";
import { useScopeWorker } from "../../hooks/wsHooks";

const BUFFER_SIZE_MAX = 5000;
const BUFFER_SIZE_MIN = 2;
const BUFFER_SIZE = 500;
const MARGIN_PX = 5;

export const XYScope = ({ id, onClose, num }: WidgetProps) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [expanded, setExpanded] = useState(false);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const autorefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(
		null,
	);
	const [autorefresh, setAutorefresh] = useState<boolean>(true);
	const [bufferSize, setBufferSize] = useState<number>(BUFFER_SIZE);
	const bufferSizeRef = useRef(bufferSize);

	const latestX = useRef<number | null>(null);
	const latestY = useRef<number | null>(null);
	const points = useRef<{ x: number; y: number }[]>([]);

	const updateScheduled = useRef(false);

	// Viewport transform refs
	const scaleX = useRef(1);
	const scaleY = useRef(1);
	const offsetX = useRef(0);
	const offsetY = useRef(0);

	const commitBufferSize = (valueStr: string) => {
		let newSize = Number.parseFloat(valueStr);
		if (Number.isNaN(newSize)) newSize = BUFFER_SIZE_MIN;
		newSize = Math.max(BUFFER_SIZE_MIN, Math.min(BUFFER_SIZE_MAX, newSize));
		setBufferSize(newSize);
	};

	// Transform data coords to canvas pixel coords
	const dataToCanvasX = (x: number, canvasWidth: number) =>
		(x - offsetX.current) * scaleX.current + canvasWidth / 2;
	const dataToCanvasY = (y: number, canvasHeight: number) =>
		canvasHeight / 2 - (y - offsetY.current) * scaleY.current;

	// Draw axes and points
	const drawPoints = () => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const w = canvas.width;
		const h = canvas.height;

		ctx.clearRect(0, 0, w, h);

		// Draw axes through data origin (0, 0)
		ctx.strokeStyle = "#ccc";
		ctx.lineWidth = 1;

		const originX = dataToCanvasX(0, w);
		const originY = dataToCanvasY(0, h);

		// X axis (horizontal line through Y=0)
		if (originY >= 0 && originY <= h) {
			ctx.beginPath();
			ctx.moveTo(0, originY);
			ctx.lineTo(w, originY);
			ctx.stroke();
		}

		// Y axis (vertical line through X=0)
		if (originX >= 0 && originX <= w) {
			ctx.beginPath();
			ctx.moveTo(originX, 0);
			ctx.lineTo(originX, h);
			ctx.stroke();
		}

		// Draw points
		ctx.fillStyle = "orange";
		const pointRadius = 1;
		for (const p of points.current) {
			const px = dataToCanvasX(p.x, w);
			const py = dataToCanvasY(p.y, h);
			ctx.beginPath();
			ctx.arc(px, py, pointRadius, 0, Math.PI * 2);
			ctx.fill();
		}
	};

	const reset = () => {
		points.current = [];
		scaleX.current = 1;
		scaleY.current = 1;
		offsetX.current = 0;
		offsetY.current = 0;
		drawPoints();
	};

	// Zoom to fit all current points with margin
	const zoomToFit = () => {
		const canvas = canvasRef.current;
		if (!canvas || points.current.length === 0) return;

		const w = canvas.width;
		const h = canvas.height;

		// Compute extrema from current buffer
		let minX = Infinity,
			maxX = -Infinity,
			minY = Infinity,
			maxY = -Infinity;
		for (const p of points.current) {
			if (p.x < minX) minX = p.x;
			if (p.x > maxX) maxX = p.x;
			if (p.y < minY) minY = p.y;
			if (p.y > maxY) maxY = p.y;
		}

		const dataWidth = maxX - minX || 1;
		const dataHeight = maxY - minY || 1;

		const scaleXNew = (w - 2 * MARGIN_PX) / dataWidth;
		const scaleYNew = (h - 2 * MARGIN_PX) / dataHeight;
		const scale = Math.min(scaleXNew, scaleYNew);

		scaleX.current = scale;
		scaleY.current = scale;

		// Center offset to middle of data bounding box
		offsetX.current = (minX + maxX) / 2;
		offsetY.current = (minY + maxY) / 2;

		drawPoints();
	};

	const expand = () => {
		setExpanded((prev) => {
			if (prev) {
				containerRef.current.style.height = "";
				containerRef.current.style.width = "";
			} else {
				containerRef.current.style.height = "100%";
				containerRef.current.style.width = "100%";
			}
			return !prev;
		});
	};

	// Resize canvas to match container size
	useEffect(() => {
		const resizeCanvas = () => {
			if (canvasRef.current && containerRef.current) {
				canvasRef.current.width = containerRef.current.clientWidth;
				canvasRef.current.height = containerRef.current.clientHeight;
				drawPoints();
			}
		};

		resizeCanvas();

		const ro = new ResizeObserver(resizeCanvas);
		if (containerRef.current) ro.observe(containerRef.current);

		return () => ro.disconnect();
	}, []);

	// Keep bufferSizeRef updated and trim points immediately on bufferSize change
	useEffect(() => {
		bufferSizeRef.current = bufferSize;
		if (points.current.length > bufferSize) {
			points.current = points.current.slice(-bufferSize);
			drawPoints();
		}
	}, [bufferSize]);

	const scopeParameters = useRef({
		x: { min: null, max: null, stream: true },
		y: { min: null, max: null, stream: true },
	}).current;

	useScopeWorker(
		id,
		scopeParameters,
		"oscilloscope",
		(messages) => {
			for (const message of messages) {
				const val = message.value;
				if (Number.isNaN(val)) continue;

				if (message.on === "x") {
					latestX.current = val;
				} else if (message.on === "y") {
					latestY.current = val;
				}

				if (latestX.current != null && latestY.current != null) {
					points.current.push({ x: latestX.current, y: latestY.current });
					latestX.current = null;
					latestY.current = null;
				}
			}

			if (points.current.length > bufferSizeRef.current) {
				points.current = points.current.slice(-bufferSizeRef.current);
			}

			if (!updateScheduled.current) {
				updateScheduled.current = true;
				requestAnimationFrame(() => {
					drawPoints();
					updateScheduled.current = false;
				});
			}
		},
		() => {
			latestX.current = null;
			latestY.current = null;
			points.current = [];
			scaleX.current = 1;
			scaleY.current = 1;
			offsetX.current = 0;
			offsetY.current = 0;
		},
	);

	useEffect(() => {
		const timer = autorefreshTimerRef.current;
		if (!autorefresh && timer) {
			clearTimeout(timer);
			autorefreshTimerRef.current = null;
			return;
		}
		if (!autorefresh) {
			return;
		}
		if (!timer) {
			autorefreshTimerRef.current = setInterval(() => zoomToFit(), 1 / 60);
		}
	}, [autorefresh]);

	return (
		<div ref={containerRef} className="scope">
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
					gap: "4px",
					pointerEvents: "none",
				}}
			>
				<DragNumberInput
					range={[BUFFER_SIZE_MIN, BUFFER_SIZE_MAX]}
					width="30px"
					value={bufferSize.toString()}
					onChange={(value) => setBufferSize(Number.parseFloat(value))}
					onBlur={(value) => commitBufferSize(value)}
					style={{
						height: "10px",
						color: "gray",
						fontSize: "14px",
						textAlign: "right",
						boxShadow: "unset",
					}}
				/>
				<Button
					text={"+"}
					activated={expanded}
					onClick={expand}
					tooltip="Expand widget"
				/>
				<Button
					text="a"
					activated={autorefresh}
					onClick={() => {
						setAutorefresh((prev) => !prev);
					}}
					tooltip="Autorefresh"
				/>
				<Button text="r" onClick={reset} tooltip="Reset" />
				<Button text="f" onClick={zoomToFit} tooltip="Zoom to Fit" />
				<Button
					text="x"
					onClick={() => onClose?.(id)}
					tooltip="Close oscilloscope"
				/>
			</div>
			<canvas
				ref={canvasRef}
				style={{
					background: "#e0e0e0",
					width: "100%",
					height: "100%",
					display: "block",
				}}
			/>
		</div>
	);
};

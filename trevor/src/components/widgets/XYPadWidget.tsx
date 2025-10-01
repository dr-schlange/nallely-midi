import { useRef, useState } from "react";
import {
	Button,
	useNallelyRegistration,
	type WidgetProps,
} from "./BaseComponents";

const parameters = {
	x: { min: 0, max: 127, fun: (device, value) => device?.send("x", value) },
	y: { min: 0, max: 127, fun: (device, value) => device?.send("y", value) },
};

const MAX_POINTS = 10;

const clamp = (value: number, min: number, max: number) =>
	Math.min(Math.max(value, min), max);

const XYSurface = ({
	onChangeX,
	onChangeY,
	hold,
}: {
	onChangeX;
	onChangeY;
	hold;
}) => {
	const [pressed, setPressed] = useState(false);
	const canvasRef = useRef(null);

	const pointerToXY = (event: React.PointerEvent<HTMLCanvasElement>) => {
		if (!canvasRef.current) return { x: 0, y: 0 };
		const rect = canvasRef.current.getBoundingClientRect();

		const relX = (event.clientX - rect.left) / rect.width;
		const relY = (event.clientY - rect.top) / rect.height;

		const x = clamp(Math.round(relX * 127), 0, 127);
		const y = clamp(Math.round(relY * 127), 0, 127);
		return { x, y };
	};

	const pointsRef = useRef<{ x: number; y: number }[]>([]);
	const addPoint = (x: number, y: number) => {
		pointsRef.current.push({ x, y });
		if (pointsRef.current.length > MAX_POINTS) {
			pointsRef.current.shift();
		}
	};

	const drawTrace = () => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const w = canvas.width;
		const h = canvas.height;

		ctx.clearRect(0, 0, w, h);
		ctx.fillStyle = "#d0d0d0";
		ctx.fillRect(0, 0, w, h);

		ctx.strokeStyle = "orange";
		ctx.lineWidth = 2;
		ctx.strokeRect(0, 0, w, h);

		ctx.strokeStyle = "orange";
		ctx.lineWidth = 7;
		ctx.beginPath();

		pointsRef.current.forEach((p, index) => {
			const px = (p.x / 127) * w;
			const py = (p.y / 127) * h;
			if (index === 0) ctx.moveTo(px, py);
			else ctx.lineTo(px, py);
		});

		ctx.stroke();
	};

	const clearCanvas = () => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const w = canvas.width;
		const h = canvas.height;
		ctx.clearRect(0, 0, w, h);
	};

	if (!hold && !pressed) {
		clearCanvas();
		onChangeX(0);
		onChangeY(0);
	}

	return (
		<canvas
			ref={canvasRef}
			style={{
				display: "block",
				border: "3px solid orange",
				backgroundColor: "#d0d0d0",
				height: "100%",
				width: "97%",
				touchAction: "none",
				userSelect: "none",
				marginTop: "25px",
			}}
			onPointerDown={(event) => {
				event.preventDefault();
				event.stopPropagation();
				setPressed(true);
				const { x, y } = pointerToXY(event);
				onChangeX(x);
				onChangeY(127 - y);
			}}
			onPointerUp={(event) => {
				event.preventDefault();
				event.stopPropagation();
				setPressed(false);
				if (!hold) {
					onChangeX(0);
					onChangeY(0);
					clearCanvas();
				}
			}}
			onPointerMove={(event) => {
				event.preventDefault();
				event.stopPropagation();
				if (!pressed) {
					return;
				}
				const { x, y } = pointerToXY(event);
				onChangeX(x);
				onChangeY(127 - y);
				addPoint(x, y);
				drawTrace();
			}}
		/>
	);
};

export const XYPad = ({ id, onClose, num }: WidgetProps) => {
	// const [expanded, setExpanded] = useState(false);
	const windowRef = useRef<HTMLDivElement>(null);
	const configRef = useRef({});
	const device = useNallelyRegistration(
		id,
		parameters,
		configRef.current,
		"controls",
	);
	const [hold, setHold] = useState(false);

	// const [minX, setMinX] = useState("0");
	// const [maxX, setMaxX] = useState("127");
	// const [minY, setMinY] = useState("0");
	// const [maxY, setMaxY] = useState("127");

	// const expand = () => {
	// 	setExpanded((prev) => !prev);
	// 	if (expanded) {
	// 		windowRef.current.style.height = "";
	// 		windowRef.current.style.width = "";
	// 	} else {
	// 		windowRef.current.style.height = "100%";
	// 		windowRef.current.style.width = "100%";
	// 	}
	// };

	return (
		<div
			ref={windowRef}
			className="scope"
			style={{
				display: "flex",
				flexDirection: "column",
				gap: "2px",
				padding: "1px",
				alignItems: "stretch",
			}}
		>
			<div
				style={{
					color: "gray",
					zIndex: 1,
					top: "1%",
					right: "1%",
					textAlign: "center",
					cursor: "pointer",
					display: "flex",
					justifyContent: "flex-end",
					flexDirection: "row",
					gap: "4px",
					width: "100%",
					userSelect: "none",
					position: "absolute",
				}}
			>
				<Button
					text={"h"}
					activated={hold}
					onClick={() => setHold((prev) => !prev)}
					tooltip="Expand widget"
				/>
				<Button text="x" onClick={() => onClose?.(id)} tooltip="Close widget" />
			</div>

			<XYSurface
				onChangeX={(value) => parameters.x.fun(device, value)}
				onChangeY={(value) => parameters.y.fun(device, value)}
				hold={hold}
			/>
		</div>
	);
};

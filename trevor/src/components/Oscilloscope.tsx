import { useEffect, useRef, useState } from "react";
import "uplot/dist/uPlot.min.css";
import type uPlot from "uplot";
import UplotReact from "uplot-react";
import walkerSprites from "../assets/walker.png";

const RECO_DELAY = 5000;
const BUFFER_SIZE = 200;

const Walker = ({ fps = 8, paused = false }) => {
	const duration = 5 / fps;

	return (
		<div
			className={`walker ${paused ? "paused" : ""}`}
			style={{
				backgroundImage: `url(${walkerSprites})`,
				animationDuration: `${duration}s`,
			}}
		/>
	);
};

const Button = ({
	activated = false,
	onClick = undefined,
	text,
	tooltip = undefined,
}: {
	activated?: boolean;
	onClick?: () => void;
	text: string;
	tooltip: undefined | string;
}) => {
	const [clickColor, setClickColor] = useState<string | undefined>(undefined);

	return (
		<div
			style={{
				color: "gray",
				zIndex: 1,
				backgroundColor: clickColor || (activated ? "yellow" : "#e0e0e0"),
				width: "12px",
				textAlign: "center",
				cursor: "pointer",
				border: "2px solid gray",
			}}
			onMouseDown={() => setClickColor("orange")}
			onMouseUp={() => {
				setClickColor(undefined);
				onClick?.();
			}}
			title={tooltip}
		>
			{text}
		</div>
	);
};

interface ScopeProps {
	id: number;
	onClose?: (id: number) => void;
}

type DisplayModes = "line" | "points";

const buildOptions = (
	mode: DisplayModes,
	label: string,
	upper?: number,
	lower?: number,
): uPlot.Options => ({
	height: 115,
	width: 170,
	cursor: { drag: { setScale: false } },
	axes: [{ show: false }, { show: false }],
	legend: { show: false },
	series: [
		{ show: true },
		{
			label,
			stroke: mode === "line" ? "orange" : null,
			width: mode === "line" ? 3 : 0,
			points:
				mode === "points"
					? { show: true, size: 3, stroke: "orange", fill: "orange" }
					: { show: false },
		},
	],
	scales: {
		x: { time: false },
		y: {
			auto: upper === undefined || lower === undefined,
			range:
				upper !== undefined && lower !== undefined ? [lower, upper] : undefined,
		},
	},
});

export const Scope = ({ id, onClose }: ScopeProps) => {
	const bufferRef = useRef<{ x: number[]; y: number[] }>({ x: [], y: [] });
	const startTimeRef = useRef<number>(Date.now());
	const wsRef = useRef<WebSocket | null>(null);
	const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isUnmounted = useRef(false);
	const chartRef = useRef<uPlot | null>(null);
	const updateScheduled = useRef(false);
	const inactivityTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

	const [upperBound, setUpperBound] = useState<number | undefined>(undefined);
	const [lowerBound, setLowerBound] = useState<number | undefined>(undefined);
	const [label, setLabel] = useState("");
	const [walker, setWalker] = useState(false);
	const [autoPaused, setAutoPaused] = useState(false);
	const [displayMode, setDisplayMode] = useState<DisplayModes>("line");
	const [chartKey, setChartKey] = useState(0);

	useEffect(() => {
		setChartKey((k) => k + 1);
	}, [displayMode, label, upperBound, lowerBound]);

	const [options, setOptions] = useState<uPlot.Options>(
		buildOptions(displayMode, label, upperBound, lowerBound),
	);

	useEffect(() => {
		setOptions(buildOptions(displayMode, label, upperBound, lowerBound));
	}, [displayMode, label, upperBound, lowerBound]);

	const togglePointMode = () => {
		setDisplayMode((prev) => (prev === "line" ? "points" : "line"));
	};

	const toggleWalker = () => {
		setWalker((prev) => !prev);
	};

	const closeScope = () => {
		onClose?.(id);
	};

	const resetBounds = () => {
		setUpperBound(undefined);
		setLowerBound(undefined);
		bufferRef.current.x = [];
		bufferRef.current.y = [];
		setChartKey((k) => k + 1);
	};

	useEffect(() => {
		function connect() {
			if (isUnmounted.current) return;

			const ws = new WebSocket(
				`ws://${window.location.hostname}:6789/scope${id}/autoconfig`,
			);
			wsRef.current = ws;

			ws.onopen = () => {
				ws.send(
					JSON.stringify({
						kind: "oscilloscope",
						parameters: [{ name: "data", stream: true }],
					}),
				);
			};

			ws.onmessage = (event) => {
				if (inactivityTimeout.current) {
					clearTimeout(inactivityTimeout.current);
				}

				inactivityTimeout.current = setTimeout(() => {
					setAutoPaused(true);
				}, 1000);

				setAutoPaused(false);

				const data = JSON.parse(event.data);
				const newValue = Number.parseFloat(data.value);
				if (Number.isNaN(newValue)) return;

				setLabel(data.on);

				const elapsed = (Date.now() - startTimeRef.current) / 1000;
				const buf = bufferRef.current;

				buf.x.push(elapsed);
				buf.y.push(newValue);

				if (buf.x.length > BUFFER_SIZE) {
					buf.x.shift();
					buf.y.shift();
				}

				// setUpperBound((prev) =>
				// 	prev === undefined || newValue > prev ? newValue : prev,
				// );
				// setLowerBound((prev) =>
				// 	prev === undefined || newValue < prev ? newValue : prev,
				// );

				if (!updateScheduled.current) {
					updateScheduled.current = true;
					requestAnimationFrame(() => {
						if (chartRef.current) {
							chartRef.current.setData([buf.x, buf.y]);
						}
						updateScheduled.current = false;
					});
				}
			};

			ws.onclose = () => {
				if (!isUnmounted.current) {
					console.warn("WebSocket closed, scheduling reconnect...");
					retryTimeoutRef.current = setTimeout(connect, RECO_DELAY);
				}
			};

			ws.onerror = (err) => {
				console.error("WebSocket error: ", err);
				ws.close();
			};
		}

		connect();

		return () => {
			if (inactivityTimeout.current) {
				clearTimeout(inactivityTimeout.current);
			}
			setTimeout(() => {
				isUnmounted.current = true;

				if (retryTimeoutRef.current !== null) {
					clearTimeout(retryTimeoutRef.current);
				}

				if (wsRef.current) {
					wsRef.current.close();
					wsRef.current = null;
				}
			}, 1000);
		};
	}, [id]);

	return (
		<div className="scope">
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
				}}
			>
				<Button text="r" onClick={resetBounds} tooltip="reset" />
				<Button
					text="p"
					activated={displayMode === "points"}
					onClick={togglePointMode}
					tooltip="toggle points mode"
				/>
				<Button
					text="w"
					activated={walker}
					onClick={toggleWalker}
					tooltip="invoke the walker"
				/>
				<Button text="x" onClick={closeScope} tooltip="close oscilloscope" />
			</div>
			<UplotReact
				key={chartKey}
				options={options}
				data={[bufferRef.current.x, bufferRef.current.y]}
				onCreate={(chart) => {
					chartRef.current = chart;
				}}
			/>
			{walker && <Walker paused={autoPaused} />}
		</div>
	);
};

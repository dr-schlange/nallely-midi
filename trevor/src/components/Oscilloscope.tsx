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

const Button = ({ activated = false, onClick = undefined, text }) => {
	const [clickColor, setClickColor] = useState<string | undefined>(undefined);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: <explanation>
		// biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
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
			onMouseDown={() => {
				setClickColor((_) => "orange");
			}}
			onMouseUp={() => {
				setClickColor((_) => undefined);
				onClick?.();
			}}
		>
			{text}
		</div>
	);
};

interface ScopeProps {
	id: number;
	onClose?: (id: number) => void;
}

export const Scope = ({ id, onClose }: ScopeProps) => {
	const bufferRef = useRef<{ x: number[]; y: number[] }>({ x: [], y: [] });
	const startTimeRef = useRef<number>(Date.now());
	const wsRef = useRef<WebSocket | null>(null);
	const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isUnmounted = useRef(false);
	const chartRef = useRef<uPlot | null>(null);
	const updateScheduled = useRef(false);

	const [upperBound, setUpperBound] = useState(0);
	const [label, setLabel] = useState("");

	const [walker, setWalker] = useState(false);
	const [autoPaused, setAutoPaused] = useState(false);
	const inactivityTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

	const initialData: [number[], number[]] = [[], []];

	const options: uPlot.Options = {
		height: 115,
		width: 170,
		cursor: {
			drag: { setScale: false },
		},
		axes: [{ show: false }, { show: false }],
		legend: { show: false },
		series: [
			{ show: true },
			{
				label: label,
				stroke: "orange",
				width: 4,
			},
		],
		scales: {
			x: { time: false },
			y: {
				auto: true,
				range: [0, upperBound],
			},
		},
	};

	const toggleWalker = () => {
		setWalker((prev) => !prev);
	};

	const closeScope = () => {
		onClose?.(id);
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

				setUpperBound((prev) => (newValue > prev ? newValue : prev));

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
				<Button text="w" activated={walker} onClick={toggleWalker} />
				<Button text="x" onClick={closeScope} />
			</div>
			<UplotReact
				options={options}
				data={initialData}
				onCreate={(chart) => {
					chartRef.current = chart;
				}}
			/>
			{walker && <Walker paused={autoPaused} />}
		</div>
	);
};

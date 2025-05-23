import { useEffect, useRef, useState } from "react";
import "uplot/dist/uPlot.min.css";
import type uPlot from "uplot";
import UplotReact from "uplot-react";

const RECO_DELAY = 5000;
const BUFFER_SIZE = 200;

interface ScopeProps {
	id: number;
}

export const Scope = ({ id }: ScopeProps) => {
	const bufferRef = useRef<{ x: number[]; y: number[] }>({ x: [], y: [] });
	const startTimeRef = useRef<number>(Date.now());
	const wsRef = useRef<WebSocket | null>(null);
	const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isUnmounted = useRef(false);
	const chartRef = useRef<uPlot | null>(null);
	const updateScheduled = useRef(false);

	const [upperBound, setUpperBound] = useState(0);
	const [label, setLabel] = useState("");

	const initialData: [number[], number[]] = [[], []];

	const options: uPlot.Options = {
		height: 115,
		width: 180,
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
			<UplotReact
				options={options}
				data={initialData}
				onCreate={(chart) => {
					chartRef.current = chart;
				}}
			/>
		</div>
	);
};

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
	const [plotData, setPlotData] = useState<[number[], number[]]>([[], []]);
	const bufferRef = useRef<{ x: number[]; y: number[] }>({ x: [], y: [] });
	const startTimeRef = useRef<number>(Date.now());
	const divRef = useRef<HTMLDivElement>(null);
	const [upperBound, setUpperBound] = useState(0);
	const [label, setLabel] = useState("");

	const wsRef = useRef<WebSocket | null>(null);
	const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isUnmounted = useRef(false);

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
						kind: "consumer",
						parameters: [{ name: "data", stream: true }],
					}),
				);
			};

			ws.onmessage = (event) => {
				const data = JSON.parse(event.data);
				const newValue = Number.parseFloat(data.value);
				if (Number.isNaN(newValue)) return;

				setUpperBound((prev) => (newValue > prev ? newValue : prev));

				const elapsed = (Date.now() - startTimeRef.current) / 1000;
				const buf = bufferRef.current;

				buf.x.push(elapsed);
				buf.y.push(newValue);

				if (buf.x.length > BUFFER_SIZE) {
					buf.x.shift();
					buf.y.shift();
				}

				setPlotData([buf.x.slice(), buf.y.slice()]);
				setLabel(data.on);
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
				console.log("Cleaning WebSocket and cancelling retries");
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

	const options: uPlot.Options = {
		height: divRef.current
			? divRef.current.getBoundingClientRect().height - 25
			: 300, // fallback height
		width: divRef.current
			? divRef.current.getBoundingClientRect().width - 25
			: 600, // fallback width
		cursor: {
			drag: { setScale: false },
		},
		axes: [{ show: false }, { show: false }],
		legend: { show: false },
		series: [
			{ show: false },
			{
				label: label,
				stroke: "orange",
				width: 4,
			},
		],
		scales: {
			x: { time: false },
			y: {
				auto: false,
				range: [0, upperBound],
			},
		},
	};

	return (
		<div ref={divRef} className="scope">
			<UplotReact options={options} data={plotData} target={divRef.current} />
		</div>
	);
};

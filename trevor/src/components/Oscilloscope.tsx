import { useEffect, useRef, useState } from "react";
import "uplot/dist/uPlot.min.css";
import type uPlot from "uplot";
import UplotReact from "uplot-react";

const RECO_DELAY = 1000;
const BUFFER_SIZE = 200;

interface ScopeProps {
	id: number;
}

export const Scope = ({ id }: ScopeProps) => {
	const [plotData, setPlotData] = useState<[number[], number[]]>([[], []]);
	const bufferRef = useRef<{ x: number[]; y: number[] }>({
		x: [],
		y: [],
	});
	const startTimeRef = useRef<number>(Date.now());
	const divRef = useRef<HTMLDivElement>(undefined);
	const [upperBound, setUpperBound] = useState(0);
	const [label, setLabel] = useState("");

	useEffect(() => {
		let websocket: WebSocket;
		let retry = true;

		const connect = () => {
			websocket = new WebSocket(
				`ws://${window.location.hostname}:6789/scope${id}/autoconfig`,
			);

			websocket.onopen = () => {
				console.log("Connected");
				websocket.send(
					JSON.stringify({
						kind: "consumer",
						parameters: [{ name: "data", stream: true }],
					}),
				);
			};

			websocket.onmessage = (event) => {
				const data = JSON.parse(event.data);
				const newValue = Number.parseFloat(data.value);
				if (Number.isNaN(newValue)) {
					return;
				}
				setUpperBound((prev) => (newValue > prev ? newValue : prev));
				const elapsed = (Date.now() - startTimeRef.current) / 1000; // time in seconds
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

			websocket.onclose = () => {
				setTimeout(() => {
					websocket?.close();
					if (retry) {
						connect();
					}
				}, RECO_DELAY);
			};

			websocket.onerror = (err) => {
				console.error("Socket encountered error: ", err);
				websocket.close();
			};
		};

		connect();

		return () => {
			console.log("disconnect");
			websocket?.close();
			retry = false
		};
	}, []);

	// uPlot options
	const options: uPlot.Options = {
		height: divRef.current
			? divRef.current.getBoundingClientRect().height - 25
			: 0,
		width: divRef.current
			? divRef.current.getBoundingClientRect().width - 25
			: 0,
		cursor: {
			drag: {
				setScale: false,
			},
		},
		axes: [
			{ show: false },
			{
				show: false,
			},
		],
		legend: {
			show: false,
		},
		series: [
			{ show: false },
			{
				label: label,
				stroke: "orange",
				width: 4,
			},
		],
		scales: {
			x: {
				time: false,
			},
			y: {
				auto: false,
				range: [0, upperBound],
			},
		},
	};

	return (
		<div ref={divRef} className={"scope"}>
			<UplotReact options={options} data={plotData} target={divRef.current} />
		</div>
	);
};

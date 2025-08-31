import { useEffect, useState } from "react";
import type { MidiConnection } from "../model";
import { useTrevorWebSocket } from "../websockets/websocket";
import DragNumberInput from "./DragInputs";

interface ScalerFormProps {
	connection: MidiConnection;
}

export const ScalerForm = ({ connection }: ScalerFormProps) => {
	const scalerEnabled = Boolean(connection.src.chain);
	const scalerId = scalerEnabled ? connection.src.chain?.id : 0;

	const trevorSocket = useTrevorWebSocket();

	const [min, setMin] = useState(connection.src.chain?.to_min ?? "");
	const [max, setMax] = useState(connection.src.chain?.to_max ?? "");
	const [method, setMethod] = useState(connection.src.chain?.method ?? "lin");
	const [asInt, setAsInt] = useState(connection.src.chain?.as_int ?? false);

	useEffect(() => {
		setMin(connection.src.chain?.to_min ?? "");
		setMax(connection.src.chain?.to_max ?? "");
		setMethod(connection.src.chain?.method ?? "lin");
		setAsInt(connection.src.chain?.as_int ?? false);
	}, [connection]);

	const switchMinMax = () => {
		trevorSocket?.setScalerValue(scalerId, "to_min", max);
		trevorSocket?.setScalerValue(scalerId, "to_max", min);
		setMax(min);
		setMin(max);
	};

	return (
		<div className="connection-setup">
			<h3>Patch Setup</h3>
			<label>
				<input
					type="checkbox"
					checked={connection.muted}
					onChange={(e) => {
						const src = connection.src;
						const dst = connection.dest;
						trevorSocket?.muteLink(
							src.device,
							src.parameter,
							dst.device,
							dst.parameter,
							e.target.checked,
						);
					}}
				/>
				Mute
			</label>
			<label>
				<input
					type="checkbox"
					checked={connection.bouncy}
					onChange={(e) => {
						const src = connection.src;
						const dst = connection.dest;
						trevorSocket?.makeLinkBouncy(
							src.device,
							src.parameter,
							dst.device,
							dst.parameter,
							e.target.checked,
						);
					}}
				/>
				Bouncy
			</label>
			<label>
				<input
					type="checkbox"
					checked={scalerEnabled}
					onChange={(e) => {
						const src = connection.src;
						const dst = connection.dest;
						trevorSocket?.createScaler(
							src.device,
							src.parameter,
							dst.device,
							dst.parameter,
							e.target.checked,
						);
					}}
				/>
				Scaler
			</label>
			<div className="form-group">
				{/* biome-ignore lint/a11y/noLabelWithoutControl: <explanation> */}
				<label style={{ display: "flex", flexDirection: "column" }}>
					<p
						style={{
							margin: "0px 0px 3px",
						}}
					>
						min
					</p>
					<DragNumberInput
						width="100%"
						disabled={!scalerEnabled}
						value={min.toString()}
						range={connection.dest.parameter.range}
						onChange={(val) => setMin(val)}
						onBlur={(val) =>
							trevorSocket?.setScalerValue(
								scalerId,
								"to_min",
								Number.parseFloat(val),
							)
						}
					/>
				</label>
				<button
					type="button"
					style={{
						fontSize: "14px",
						marginBottom: "10px",
						minWidth: "27px",
						maxHeight: "27px",
					}}
					onClick={switchMinMax}
				>
					⇄
				</button>
				{/* biome-ignore lint/a11y/noLabelWithoutControl: <explanation> */}
				<label style={{ display: "flex", flexDirection: "column" }}>
					<p
						style={{
							margin: "0px 0px 3px",
						}}
					>
						max
					</p>
					<DragNumberInput
						width="85%"
						disabled={!scalerEnabled}
						value={max.toString()}
						range={connection.dest.parameter.range}
						onChange={(val) => setMax(val)}
						onBlur={(val) =>
							trevorSocket?.setScalerValue(
								scalerId,
								"to_max",
								Number.parseFloat(val),
							)
						}
					/>
				</label>
			</div>
			<label>
				Method
				<select
					value={method}
					disabled={!scalerEnabled}
					onChange={(e) => {
						const val = e.target.value;
						setMethod(val);
						trevorSocket?.setScalerValue(scalerId, "method", val);
					}}
				>
					<option value="lin">Lin</option>
					<option value="log">Log</option>
				</select>
			</label>
			<label>
				<input
					type="checkbox"
					checked={asInt}
					disabled={!scalerEnabled}
					onChange={(e) => {
						const value = e.target.checked;
						setAsInt(value);
						trevorSocket?.setScalerValue(scalerId, "as_int", value);
					}}
				/>
				As integer
			</label>
		</div>
	);
};

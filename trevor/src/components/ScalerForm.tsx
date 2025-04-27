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

	const [min, setMin] = useState(connection.src.chain?.min ?? "");
	const [max, setMax] = useState(connection.src.chain?.max ?? "");
	const [method, setMethod] = useState(connection.src.chain?.method ?? "lin");
	const [asInt, setAsInt] = useState(connection.src.chain?.as_int ?? false);

	useEffect(() => {
		setMin(connection.src.chain?.min ?? "");
		setMax(connection.src.chain?.max ?? "");
		setMethod(connection.src.chain?.method ?? "lin");
		setAsInt(connection.src.chain?.as_int ?? false);
	}, [connection]);

	return (
		<div className="connection-setup">
			<h3>Connection Setup</h3>
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
				<label>
					Min:
					<DragNumberInput
						disabled={!scalerEnabled}
						value={min.toString()}
						range={[null, null]} // or set appropriate bounds
						onChange={(val) => setMin(val)}
						onBlur={(val) =>
							trevorSocket?.setScalerValue(
								scalerId!,
								"to_min",
								Number.parseFloat(val),
							)
						}
					/>
				</label>
				{/* biome-ignore lint/a11y/noLabelWithoutControl: <explanation> */}
				<label>
					Max:
					<DragNumberInput
						disabled={!scalerEnabled}
						value={max.toString()}
						range={[null, null]} // or set appropriate bounds
						onChange={(val) => setMax(val)}
						onBlur={(val) =>
							trevorSocket?.setScalerValue(
								scalerId!,
								"to_max",
								Number.parseFloat(val),
							)
						}
					/>
				</label>
			</div>
			<label>
				Method:
				<select
					value={method}
					disabled={!scalerEnabled}
					onChange={(e) => {
						const val = e.target.value;
						setMethod(val);
						trevorSocket?.setScalerValue(scalerId!, "method", val);
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
						trevorSocket?.setScalerValue(scalerId!, "as_int", value);
					}}
				/>
				As integer
			</label>
		</div>
	);
};

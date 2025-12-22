import { memo } from "react";
import { useEffect, useState } from "react";
import type { MidiConnection, MidiParameter, VirtualParameter } from "../model";
import { useTrevorWebSocket } from "../websockets/websocket";
import DragNumberInput from "./DragInputs";
import { isVirtualParameter } from "../utils/utils";

interface ScalerFormProps {
	connection: MidiConnection;
}

export const ScalerForm = memo(({ connection }: ScalerFormProps) => {
	const scalerEnabled = Boolean(connection.src.chain);
	const scalerId = scalerEnabled ? connection.src.chain?.id : 0;

	const trevorSocket = useTrevorWebSocket();

	const [min, setMin] = useState(connection.src.chain?.to_min ?? "");
	const [max, setMax] = useState(connection.src.chain?.to_max ?? "");
	const [velocity, setVelocity] = useState<number | null>(connection.velocity);
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

	const boundComponent = (
		parameter: MidiParameter | VirtualParameter,
		variable,
		setter,
		target,
	) => {
		if (isVirtualParameter(parameter) && parameter.accepted_values.length > 0) {
			const accepted_values = parameter.accepted_values;
			return (
				<select
					style={{ width: "100%" }}
					value={accepted_values[variable]}
					onChange={(e) => {
						const index = parameter.accepted_values.indexOf(e.target.value);
						setter(index);
						trevorSocket?.setScalerValue(scalerId, target, index);
					}}
				>
					{parameter.accepted_values.map((v) => (
						<option key={v.toString()} value={v.toString()}>
							{v.toString()}
						</option>
					))}
				</select>
			);
		}
		return (
			<DragNumberInput
				width="100%"
				disabled={!scalerEnabled}
				value={variable.toString()}
				range={parameter.range}
				onChange={(val) => setter(val)}
				onBlur={(val) =>
					trevorSocket?.setScalerValue(scalerId, target, Number.parseFloat(val))
				}
			/>
		);
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
					{boundComponent(connection.dest.parameter, min, setMin, "to_min")}
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
					{boundComponent(connection.dest.parameter, max, setMax, "to_max")}
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
			{/** biome-ignore lint/a11y/noLabelWithoutControl: <explanation> */}
			<label style={{ display: "flex", flexDirection: "column" }}>
				<p
					style={{
						margin: "0px 0px 3px",
					}}
				>
					velocity
				</p>
				<DragNumberInput
					width="100%"
					disabled={!scalerEnabled}
					value={velocity?.toString() || ""}
					range={[0, 127]}
					nullable
					onChange={(val) => {
						if (!val || val.length === 0) {
							setVelocity(null);
							return;
						}
						setVelocity(Number.parseInt(val, 10));
					}}
					onBlur={(val) =>
						trevorSocket?.setLinkVelocity(
							connection.src.device,
							connection.src.parameter,
							connection.dest.device,
							connection.dest.parameter,
							val !== null ? Number.parseInt(val, 10) : null,
						)
					}
				/>
			</label>
		</div>
	);
});

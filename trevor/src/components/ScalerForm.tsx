import { useEffect, useState } from "react";
import type { Connection } from "../model";
import { useTrevorWebSocket } from "../websockets/websocket";
import DragNumberInput from "./DragInputs";
import { Button } from "./widgets/BaseComponents";

interface ScalerFormProps {
	connection: Connection;
}

export const ScalerForm = ({ connection }: ScalerFormProps) => {
	const scalerEnabled = Boolean(connection.src.chain);
	const scalerId = scalerEnabled ? connection.src.chain?.id : 0;

	const trevorSocket = useTrevorWebSocket();

	const [min, setMin] = useState(connection.src.chain?.to_min ?? "");
	const [max, setMax] = useState(connection.src.chain?.to_max ?? "");
	const [velocity, setVelocity] = useState<number | null>(connection.velocity);
	const [method, setMethod] = useState(connection.src.chain?.method ?? "lin");
	const [extraZero, setExtraZero] = useState(connection.extra_zero);
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
			{/*<h3>Patch Setup</h3>*/}
			<div style={{ display: "flex", width: "100%" }}>
				<div
					style={{ display: "flex", flexDirection: "column", width: "100%" }}
				>
					<label style={{ width: "100%" }}>
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
					<label style={{ width: "100%" }}>
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
				</div>
				<label style={{ width: "100%" }}>
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
					Round values
				</label>
			</div>

			<div
				style={{
					display: "flex",
					alignItems: "center",
					flexDirection: "column",
				}}
			>
				<label style={{ width: "100%" }}>
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
					<span>Scaler</span>
				</label>
				<div
					style={{
						display: "flex",
						gap: "4px",
						width: "100%",
						justifyContent: "space-between",
					}}
				>
					<DragNumberInput
						style={{
							width: "100%",
						}}
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
					<Button
						text="⇄"
						tooltip="Switch min and max"
						variant="big"
						style={{
							backgroundColor: "var(--button-bg-color)",
							color: "var(--black)",
						}}
						onClick={switchMinMax}
					/>
					<DragNumberInput
						style={{
							width: "100%",
						}}
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
				</div>
			</div>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: "4px",
					marginTop: "10px",
				}}
			>
				<label
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<span
						style={{
							width: "100%",
						}}
					>
						Method
					</span>
					<select
						style={{
							width: "100%",
						}}
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

				{/** biome-ignore lint/a11y/noLabelWithoutControl: <explanation> */}
				<label style={{ display: "flex", alignItems: "center" }}>
					<span style={{ width: "100%" }}>Velocity</span>
					<DragNumberInput
						style={{
							width: "100%",
						}}
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
				<label style={{ display: "flex", alignItems: "center" }}>
					<span style={{ width: "100%" }}>Retrigger</span>
					<select
						style={{ width: "100%" }}
						value={extraZero}
						onChange={(e) => {
							const val = e.target.value;
							setExtraZero(val);
							trevorSocket?.setLinkExtraZero(
								connection.src.device,
								connection.src.parameter,
								connection.dest.device,
								connection.dest.parameter,
								val,
							);
						}}
					>
						<option value="none">-</option>
						<option value="before">before</option>
						<option value="after">after</option>
						<option value="remove-note-off">remove note off</option>
					</select>
				</label>
			</div>
		</div>
	);
};

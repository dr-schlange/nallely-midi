import type { MidiConnection } from "../model";

interface ScalerFormProps {
	connection: MidiConnection;
}

export const ScalerForm = ({ connection }: ScalerFormProps) => {
	const scalerEnabled = Boolean(connection.src.chain);
	const autoScaleEnabled = connection.src.chain?.auto;
	const minValue = connection.src.chain?.min;
	const maxValue = connection.src.chain?.max;
	const method = connection.src.chain?.method;

	return (
		<>
			<div className="connection-setup">
				<h3>Connection Setup</h3>
				<label>
					<input
						type="checkbox"
						checked={scalerEnabled}
						onChange={(e) => {
							setScalerEnabled(e.target.checked);
							if (!e.target.checked) {
								setAutoScaleEnabled(true); // Reset auto-scale when scaler is disabled
							}
						}}
					/>
					Scaler
				</label>
				<label>
					<input
						type="checkbox"
						checked={autoScaleEnabled}
						disabled={!scalerEnabled}
						onChange={(e) => setAutoScaleEnabled(e.target.checked)}
					/>
					Auto-Scale
				</label>
				<div className="form-group">
					<label>
						Min:
						<input
							type="text"
							value={minValue}
							disabled={!scalerEnabled || autoScaleEnabled}
							onChange={(e) => setMinValue(e.target.value)}
						/>
					</label>
					<label>
						Max:
						<input
							type="text"
							value={maxValue}
							disabled={!scalerEnabled || autoScaleEnabled}
							onChange={(e) => setMaxValue(e.target.value)}
						/>
					</label>
				</div>
				<label>
					Method:
					<select
						value={method}
						disabled={!scalerEnabled || autoScaleEnabled}
						onChange={(e) => setMethod(e.target.value)}
					>
						<option value="lin">Lin</option>
						<option value="log">Log</option>
					</select>
				</label>
			</div>
		</>
	);
};

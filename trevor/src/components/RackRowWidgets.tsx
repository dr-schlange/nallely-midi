import { forwardRef, useImperativeHandle, useState } from "react";
import { Scope } from "./Oscilloscope";

interface WidgetRackProps {
	height: number;
}

export interface RackRowWidgetRef {
	resetAll: () => void;
}

export const RackRowWidgets = forwardRef<RackRowWidgetRef, WidgetRackProps>(
	({ height }: WidgetRackProps, ref) => {
		// const slotWidth = 210;
		const [widgetIds, setWidgetIds] = useState<number[]>([]);

		const addWidget = () => {
			setWidgetIds([...widgetIds, widgetIds.length]);
		};

		useImperativeHandle(ref, () => ({
			resetAll() {
				setWidgetIds([]);
			},
		}));

		return (
			<div
				className="rack-row"
				style={{ display: "flex", flexDirection: "row", height }}
			>
				<div
					className="rack-row"
					style={{
						height: "auto", // Fixed height for the RackRow
						width: "90%", // Fill the parent container horizontally
						position: "relative",
						overflow: "visible", // Allow overflow to simulate additional rows
						display: "flex",
						flexWrap: "wrap", // Wrap devices to the next "row" when overflowing
					}}
				>
					{widgetIds.map((id) => (
						<Scope key={id} id={id} />
					))}
				</div>
				<div
					style={{
						height: "100%", // Fixed height for the RackRow
						width: "10%", // Fill the parent container horizontally
						// position: "relative",
						overflow: "visible", // Allow overflow to simulate additional rows
						display: "flex",
						flexWrap: "wrap", // Wrap devices to the next "row" when overflowing
					}}
				>
					<div className="device-patching-top-panel">
						<button
							type="button"
							className={"associate-button"}
							onClick={addWidget}
						>
							Scope
						</button>
					</div>
				</div>
			</div>
		);
	},
);

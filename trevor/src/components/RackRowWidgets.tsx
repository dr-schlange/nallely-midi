import { forwardRef, useImperativeHandle, useState } from "react";
import { Scope } from "./Oscilloscope";

interface WidgetRackProps {
	height?: number;
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
			<div className="rack-row" style={{ width: "250px" }}>
				{widgetIds.map((id) => (
					<Scope key={id} id={id} />
				))}
				<div
					style={{
						height: "100%",
						width: "100%",
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "flex-start",
					}}
				>
					<div
						className="device-patching-top-panel"
						style={{ width: "100%", minWidth: "15%" }}
					>
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

import { forwardRef, useImperativeHandle, useState } from "react";
import { Scope } from "./Oscilloscope";

interface WidgetRackProps {
	onRackScroll?: () => void;
}

export interface RackRowWidgetRef {
	resetAll: () => void;
}

export const RackRowWidgets = forwardRef<RackRowWidgetRef, WidgetRackProps>(
	({ onRackScroll }: WidgetRackProps, ref) => {
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
				style={{ width: "250px" }}
				onScroll={() => onRackScroll?.()}
			>
				{/* <select
					value={""}
					style={{ width: "100%" }}
					title="Adds a new widget to the system"
					onChange={(e) => {
						const index = e.target.selectedIndex - 1;
						const val = e.target.value;
					}}
				>
					<option value={""}>--</option>
				</select> */}
				<button
					style={{ padding: "5px", width: "100%" }}
					type={"button"}
					onClick={addWidget}
				>
					Scope
				</button>
				{widgetIds.map((id) => (
					<Scope key={id} id={id} />
				))}
			</div>
		);
	},
);

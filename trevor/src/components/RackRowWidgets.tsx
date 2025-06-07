import { forwardRef, useImperativeHandle, useState } from "react";
import { Scope } from "./Oscilloscope";

interface WidgetRackProps {
	onRackScroll?: () => void;
	horizontal?: boolean;
}

export interface RackRowWidgetRef {
	resetAll: () => void;
}

interface RackRowWidget {
	id: string;
}

const WidgetComponents = {
	Scope,
};

export const RackRowWidgets = forwardRef<RackRowWidgetRef, WidgetRackProps>(
	({ onRackScroll, horizontal }: WidgetRackProps, ref) => {
		// const slotWidth = 210;
		const [widgetIds, setWidgetIds] = useState<
			Record<number, React.FC<RackRowWidget>>
		>({});

		const addWidget = (type) => {
			setWidgetIds({ ...widgetIds, [Object.values(widgetIds).length]: type });
		};

		useImperativeHandle(ref, () => ({
			resetAll() {
				setWidgetIds({});
			},
		}));

		return (
			<div
				className={`rack-row ${horizontal ? "horizontal" : ""}`}
				onScroll={() => onRackScroll?.()}
			>
				<select
					value={""}
					title="Adds a new widget to the system"
					onChange={(e) => {
						const val = e.target.value;
						addWidget(WidgetComponents[val]);
					}}
				>
					<option value={""}>--</option>
					{Object.keys(WidgetComponents).map((name) => (
						<option key={name} value={name}>
							{name}
						</option>
					))}
				</select>
				{/* <button
					style={{ padding: "5px", width: "100%" }}
					type={"button"}
					onClick={addWidget}
				>
					∿
				</button> */}
				{Object.entries(widgetIds).map(([id, Widget]) => {
					return <Widget key={id} id={id} />;
				})}
				{Object.keys(widgetIds).length === 0 && (
					<p style={{ color: "#808080" }}>Widgets</p>
				)}
			</div>
		);
	},
);

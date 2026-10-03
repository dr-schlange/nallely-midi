import { useRef, useState } from "react";
import { useNallelyRegistration } from "../../hooks/wsHooks";
import type { MidiParameter } from "../../model";
import { Button, CircularSlider, type WidgetProps } from "./BaseComponents";

const KNOB_NAMES = ["k0", "k1", "k2", "k3", "k4", "k5", "k6", "k7"];

const buildParameters = (min: number, max: number) =>
	Object.fromEntries(KNOB_NAMES.map((name) => [name, { min, max }]));

const Knobs = ({
	id,
	onClose,
	minValue,
	maxValue,
}: WidgetProps & { minValue: number; maxValue: number }) => {
	const windowRef = useRef<HTMLDivElement>(null);
	const configRef = useRef({});
	const parameters = useRef(buildParameters(minValue, maxValue)).current;
	const device = useNallelyRegistration(
		id,
		parameters,
		configRef.current,
		"controls",
	);
	const [values, setValues] = useState<Record<string, number>>(() =>
		Object.fromEntries(KNOB_NAMES.map((name) => [name, 0])),
	);

	return (
		<div ref={windowRef} className="scope">
			<div
				style={{
					position: "absolute",
					color: "gray",
					zIndex: 1,
					top: "1%",
					right: "1%",
					width: "90%",
					textAlign: "center",
					cursor: "pointer",
					display: "flex",
					justifyContent: "flex-end",
					flexDirection: "row",
					gap: "4px",
					pointerEvents: "none",
				}}
			>
				<Button text="x" onClick={() => onClose?.(id)} tooltip="Close widget" />
			</div>
			<div
				style={{
					marginTop: "16px",
					display: "grid",
					gridTemplateColumns: "repeat(4, 1fr)",
					gridTemplateRows: "repeat(2, 1fr)",
					justifyItems: "center",
					columnGap: "6px",
					rowGap: "2px",
				}}
			>
				{KNOB_NAMES.map((name) => (
					<CircularSlider
						key={name}
						param={{ name } as MidiParameter}
						value={values[name]}
						minValue={minValue}
						maxValue={maxValue}
						rounded={false}
						onDrag={(value) => {
							setValues((prev) => ({ ...prev, [name]: value }));
							device?.send(name, value);
						}}
						onManualSliderChange={(value) => {
							setValues((prev) => ({ ...prev, [name]: value }));
							device?.send(name, value);
						}}
					/>
				))}
			</div>
		</div>
	);
};

export const UnipolarKnobs = (props: WidgetProps) => (
	<Knobs {...props} minValue={0} maxValue={1} />
);

export const BipolarKnobs = (props: WidgetProps) => (
	<Knobs {...props} minValue={-1} maxValue={1} />
);

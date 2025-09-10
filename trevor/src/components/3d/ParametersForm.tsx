import { useEffect, useState } from "react";
import {
	type TrevorWebSocket,
	useTrevorWebSocket,
} from "../../websockets/websocket";
import type {
	MidiDevice,
	MidiParameter,
	VirtualDevice,
	VirtualParameter,
} from "../../model";
import DragNumberInput from "../DragInputs";
import { isVirtualDevice, isVirtualParameter } from "../../utils/utils";

interface MidiSectionFormProps {
	device: MidiDevice | VirtualDevice;
	parameters: MidiParameter[] | VirtualParameter[];
	repr: string;
}

const NumberInput = ({
	device,
	parameter,
	value,
	style,
}: {
	device: MidiDevice | VirtualDevice;
	parameter: VirtualParameter | MidiParameter;
	value: string;
	style;
}) => {
	const [tmpValue, setTmpValue] = useState(value);
	const trevorSocket = useTrevorWebSocket();

	return (
		<DragNumberInput
			style={{ ...style }}
			range={parameter.range}
			value={tmpValue}
			onChange={(value) => {
				setTmpValue(value);
			}}
			onBlur={(value) => {
				if (!Number.isNaN(Number.parseFloat(value))) {
					if (isVirtualDevice(device) && isVirtualParameter(parameter)) {
						trevorSocket?.setVirtualValue(device, parameter, value);
					} else {
						trevorSocket?.setParameterValue(
							device.id,
							parameter.section_name,
							parameter.name,
							Number.parseInt(value),
						);
					}
				}
			}}
		/>
	);
};

const ValueListInput = ({
	device,
	parameter,
	value,
	style,
}: {
	device: VirtualDevice;
	parameter: VirtualParameter;
	value: string;
	style;
}) => {
	const trevorSocket = useTrevorWebSocket();

	return (
		<select
			style={{ ...style }}
			value={value ? value.toString() : "--"}
			onChange={(e) =>
				trevorSocket?.setVirtualValue(device, parameter, e.target.value)
			}
		>
			{parameter.accepted_values.map((v) => (
				<option key={v.toString()} value={v.toString()}>
					{v.toString()}
				</option>
			))}
		</select>
	);
};

const BooleanInput = ({
	device,
	parameter,
	value,
	style,
}: {
	device: VirtualDevice;
	parameter: VirtualParameter;
	value: string;
	style;
}) => {
	const trevorSocket = useTrevorWebSocket();

	return (
		<input
			style={{ ...style }}
			type="checkbox"
			checked={Boolean(value) ?? false}
			onChange={(e) => {
				const newVal = !e.target.value;
				trevorSocket?.setVirtualValue(device, parameter, newVal);
			}}
		/>
	);
};

const StringInput = ({
	device,
	parameter,
	value,
	style,
}: {
	device: VirtualDevice;
	parameter: VirtualParameter;
	value: string;
	style;
}) => {
	const trevorSocket = useTrevorWebSocket();
	const [tmpValue, setTmpValue] = useState(value);

	return (
		<input
			style={{ ...style }}
			type="text"
			value={tmpValue}
			onChange={(e) => {
				const val = e.target.value;
				setTmpValue(val);
			}}
			onBlur={(e) => {
				const newVal = e.target.value;
				trevorSocket?.setVirtualValue(device, parameter, newVal);
			}}
		/>
	);
};

export const ParametersForm = ({
	device,
	parameters,
	repr,
}: MidiSectionFormProps) => {
	const buildEntries = () => {
		const entries = [];
		for (const parameter of parameters) {
			const value = device.config[parameter.name];

			if (typeof value === "number" || !isVirtualParameter(parameter)) {
				entries.push(
					<div className="flat-entry" key={parameter.name}>
						<p className="flat-label" style={{ width: "70%", margin: "0px" }}>
							{parameter.name}
						</p>
						<NumberInput
							device={device}
							parameter={parameter}
							value={value?.toString() || "0"}
							style={{
								width: "30%",
								color: "gray",
								boxShadow: "unset",
							}}
						/>
					</div>,
				);
				continue;
			}
			if (!isVirtualDevice(device)) {
				continue;
			}
			if (parameter.accepted_values.length > 0) {
				entries.push(
					<div className="flat-entry" key={parameter.name}>
						<p className="flat-label" style={{ width: "70%", margin: "0px" }}>
							{parameter.name}
						</p>
						<ValueListInput
							device={device}
							parameter={parameter}
							value={value?.toString() || "0"}
							style={{
								width: "35%",
								color: "gray",
								boxShadow: "unset",
							}}
						/>
					</div>,
				);
				continue;
			}
			if (typeof value === "boolean") {
				entries.push(
					<div className="flat-entry" key={parameter.name}>
						<p className="flat-label" style={{ width: "70%", margin: "0px" }}>
							{parameter.name}
						</p>
						<BooleanInput
							device={device}
							parameter={parameter}
							value={value?.toString() || "0"}
							style={{
								// width: "30%",
								color: "gray",
								boxShadow: "unset",
							}}
						/>
					</div>,
				);
				continue;
			}
			if (typeof value === "string") {
				entries.push(
					<div className="flat-entry" key={parameter.name}>
						<p
							className="flat-label"
							style={{
								width: "70%",
								margin: "0px",
							}}
						>
							{parameter.name}
						</p>
						<StringInput
							device={device}
							parameter={parameter}
							value={value?.toString() || "0"}
							style={{
								width: "30%",
								color: "gray",
								boxShadow: "unset",
							}}
						/>
					</div>,
				);
			}
		}
		return entries;
	};

	return (
		<div className="flat-form">
			<h3 style={{ color: "gray", width: "100%" }}>{repr}</h3>
			{buildEntries()}
		</div>
	);
};

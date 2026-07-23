/** biome-ignore-all lint/a11y/noLabelWithoutControl: <explanation> */
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
	Connection,
	MidiDevice,
	MidiDeviceSection,
	MidiDeviceWithSection,
	MidiParameter,
	VirtualDevice,
	VirtualDeviceWithSection,
	VirtualParameter,
} from "../model";
import { selectChannels, useTrevorSelector } from "../store";
import { isVirtualDevice, resolveAcceptedValueIndex } from "../utils/utils";
import { useTrevorWebSocket } from "../websockets/websocket";
import DragNumberInput from "./DragInputs";
import { ScalerForm } from "./ScalerForm";
import { Button } from "./widgets/BaseComponents";

interface DeviceInfoPanelProps {
	currentSelected: string | undefined;
	displayedSection:
		| MidiDeviceWithSection
		| VirtualDeviceWithSection
		| undefined;
	onDeselect: () => void;
	onMidiDeviceClick: (device: MidiDevice) => void;
	onSectionChange: (
		section: MidiDeviceWithSection | VirtualDeviceWithSection | undefined,
	) => void;
}

export const DeviceInfoPanel = ({
	currentSelected,
	displayedSection,
	onDeselect,
	onMidiDeviceClick,
	onSectionChange,
}: DeviceInfoPanelProps) => {
	const trevorSocket = useTrevorWebSocket();
	const midi_devices = useTrevorSelector((state) => state.nallely.midi_devices);
	const virtual_devices = useTrevorSelector(
		(state) => state.nallely.virtual_devices,
	);
	const allConnections = useTrevorSelector(
		(state) => state.nallely.connections,
	);
	const exposedServices = useTrevorSelector(
		(state) => state.nallely.exposed_services,
	);
	const friends = useTrevorSelector((state) => state.general.friends);
	const channels = useTrevorSelector(selectChannels);

	const [tempValues, setTempValues] = useState<
		Record<number, Record<string, string | undefined>>
	>({});

	useEffect(() => {
		setTempValues((prev) => {
			const next = { ...prev };
			for (const device of midi_devices) {
				const config = next[device.id] || {};
				for (const [section, parameters] of Object.entries(device.config)) {
					for (const [parameterName, parameterValue] of Object.entries(
						parameters,
					)) {
						config[`${section}::${parameterName}`] = parameterValue.toString();
					}
				}
				next[device.id] = config;
			}
			for (const device of virtual_devices) {
				const config = next[device.id] || {};
				for (const [parameterName, parameterValue] of Object.entries(
					device.config,
				)) {
					config[parameterName] = parameterValue.toString();
				}
				next[device.id] = config;
			}
			return next;
		});
	}, [midi_devices, virtual_devices]);

	const all_devices = useMemo(
		() => [...midi_devices, ...virtual_devices],
		[midi_devices, virtual_devices],
	);

	const selectedDevice = all_devices.find(
		(d) => `${d.id}::${d.repr}` === currentSelected,
	);
	const selectedConnection: Connection | undefined = allConnections.find(
		(c) => c.id.toString() === currentSelected,
	);

	useEffect(() => {
		if (!selectedDevice || !isVirtualDevice(selectedDevice)) return;
		if (friends && Object.keys(friends).length === 0) {
			trevorSocket?.scanForFriends();
		}
	}, [selectedDevice?.id, friends, trevorSocket]);

	const createVirtualInput = useCallback(
		(
			device: VirtualDevice,
			parameter: VirtualParameter,
			value: string | number | boolean,
		) => {
			const tempDevice = tempValues[device.id] || {};
			const tempValue = tempDevice[parameter.name];
			if (parameter.accepted_values?.length > 0) {
				return (
					<select
						style={{
							minWidth: "0",
							direction: "rtl",
							textAlign: "left",
							height: "24px",
							lineHeight: "24px",
							paddingTop: "2px",
							paddingBottom: "4px",
							width: "100%",
						}}
						value={value ? value.toString() : "--"}
						onChange={(e) =>
							trevorSocket?.setVirtualValue(device, parameter, e.target.value)
						}
					>
						{parameter.accepted_values.map((v) => (
							<option key={v.toString()} value={v.toString()} dir="ltr">
								{v.toString()}
							</option>
						))}
					</select>
				);
			}
			const currentValue =
				tempValue ?? device.config[parameter.name]?.toString() ?? "";
			if (typeof value === "number") {
				return (
					<DragNumberInput
						clearDecimalButton
						style={{ width: "100%", fontSize: "12px" }}
						value={currentValue}
						onBlur={(value) => {
							if (!Number.isNaN(Number.parseFloat(value))) {
								trevorSocket?.setVirtualValue(device, parameter, value);
							}
						}}
						onChange={(value) => {
							setTempValues({
								...tempValues,
								[device.id]: {
									...tempValues[device.id],
									[parameter.name]: value,
								},
							});
						}}
						range={parameter.range}
					/>
				);
			}
			if (typeof value === "string") {
				return (
					<input
						style={{ width: "100%", fontSize: "12px" }}
						type="text"
						value={currentValue}
						onChange={(e) => {
							const val = e.target.value;
							setTempValues({
								...tempValues,
								[device.id]: {
									...tempValues[device.id],
									[parameter.name]: val,
								},
							});
						}}
						onBlur={(e) => {
							const newVal = e.target.value;
							trevorSocket?.setVirtualValue(device, parameter, newVal);
						}}
					/>
				);
			}
			if (typeof value === "boolean") {
				return (
					<input
						type="checkbox"
						checked={Boolean(device.config[parameter.name]) ?? false}
						onChange={(e) => {
							const newVal = !e.target.value;
							trevorSocket?.setVirtualValue(device, parameter, newVal);
						}}
					/>
				);
			}
		},
		[trevorSocket, tempValues],
	);

	const createMidiParameterInput = useCallback(
		(device: MidiDevice, parameter: MidiParameter) => {
			const tempDevice = tempValues[device.id] || {};
			const sectionName = parameter.section_name;
			const parameterName = parameter.name;
			const key = `${sectionName}::${parameterName}`;
			const tempValue = tempDevice[key];
			const currentValue =
				tempValue ??
				device.config[sectionName]?.[parameterName]?.toString() ??
				"0";
			if (parameter.accepted_values?.length > 0) {
				const acceptedValues = parameter.accepted_values;
				const [, upper] = parameter.range;
				const index = resolveAcceptedValueIndex(
					currentValue,
					acceptedValues,
					upper,
				);
				const value = acceptedValues[index];
				return (
					<select
						style={{ minWidth: "132px", maxWidth: "132px" }}
						value={value ?? "--"}
						onChange={(e) =>
							trevorSocket?.setParameterValue(
								device.id,
								sectionName,
								parameterName,
								e.target.value,
							)
						}
					>
						{parameter.accepted_values.map((v) => (
							<option key={v.toString()} value={v.toString()} dir="ltr">
								{v.toString()}
							</option>
						))}
					</select>
				);
			}
			return (
				<DragNumberInput
					style={{ width: "100%" }}
					value={currentValue}
					onBlur={(value) => {
						if (!Number.isNaN(Number.parseFloat(value))) {
							trevorSocket?.setParameterValue(
								device.id,
								parameter.section_name,
								parameter.name,
								Number.parseFloat(value),
							);
						}
					}}
					onChange={(value) => {
						setTempValues((prev) => ({
							...prev,
							[device.id]: { ...prev[device.id], [key]: value },
						}));
					}}
					range={parameter.range}
				/>
			);
		},
		[trevorSocket, tempValues],
	);

	if (!selectedDevice && !selectedConnection) {
		return (
			<>
				<h3>Settings panel</h3>
				<p>Select a neuron to view details</p>
			</>
		);
	}

	if (selectedConnection) {
		const srcDevice = all_devices.find(
			(d) => d.id === selectedConnection.src.device,
		);
		const destDevice = all_devices.find(
			(d) => d.id === selectedConnection.dest.device,
		);
		return (
			<>
				<h3>Patch setup</h3>
				<ScalerForm connection={selectedConnection} />
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						justifyContent: "space-evenly",
						marginTop: "10px",
					}}
				>
					{srcDevice && destDevice && (
						<details>
							<summary>Danger zone</summary>
							<div className="details-content">
								<Button
									text="Delete"
									tooltip="Delete patch"
									onClick={() => {
										trevorSocket?.associateParameters(
											srcDevice,
											selectedConnection.src.parameter,
											destDevice,
											selectedConnection.dest.parameter,
											true,
										);
										onDeselect();
									}}
									className="menu-button"
								/>
							</div>
						</details>
					)}
				</div>
			</>
		);
	}

	if (isVirtualDevice(selectedDevice)) {
		const device = selectedDevice as VirtualDevice;
		const exposedTo = exposedServices[device.id]?.map(([, ip]) => ip) ?? [];
		return (
			<>
				{device.meta.parameters.map((param) => (
					<div
						key={param.name}
						style={{ paddingLeft: "4px", paddingRight: "4px" }}
					>
						<label
							style={{
								display: "flex",
								alignItems: "baseline",
								width: "100%",
								fontSize: "14px",
							}}
						>
							<p
								style={{
									margin: "0px 0px 3px",
									overflowInline: "auto",
									width: "100%",
								}}
							>
								{param.name}
							</p>
							{createVirtualInput(device, param, device.config[param.name])}
						</label>
					</div>
				))}
				{!device.proxy && (
					<>
						<hr />
						<details>
							<summary>Clone device</summary>
							<Button
								text="Clone and replace"
								tooltip="Clone the device and kills the original device"
								onClick={() => {
									trevorSocket?.clone_device(device.id, {
										startClone: true,
										suicide: true,
									});
									onDeselect();
								}}
								className="menu-button"
							/>
							<Button
								text="Clone and pause"
								tooltip="Clone the device and pause it"
								onClick={() => {
									trevorSocket?.clone_device(device.id, {
										startClone: false,
										suicide: false,
									});
									onDeselect();
								}}
								className="menu-button"
							/>
							<Button
								text="Clone and pause original"
								tooltip="Clone the device and pause original device"
								onClick={() => {
									trevorSocket?.clone_device(device.id, {
										startClone: true,
										pauseDevice: true,
									});
									onDeselect();
								}}
								className="menu-button"
							/>
							<Button
								text="Clone without patch"
								tooltip="Clone the device without existing patches"
								onClick={() => {
									trevorSocket?.clone_device(device.id, { withLinks: false });
									onDeselect();
								}}
								className="menu-button"
							/>
						</details>
						<details>
							<summary>Expose to friends</summary>
							<div className="details-content">
								{Object.entries(friends).map(([ip, [name]]) => (
									<Button
										key={ip}
										text={`${name} - ${ip}`}
										tooltip={`Expose neuron to ${name} living at ${ip}`}
										activated={exposedTo.includes(ip)}
										onClick={() => {
											if (exposedTo.includes(ip)) {
												trevorSocket?.unexposeNeuron(device.id, ip);
											} else {
												trevorSocket?.exposeNeuron(device.id, ip);
											}
										}}
										className="menu-button"
										style={{ fontSize: "13px" }}
									/>
								))}
							</div>
							<hr />
						</details>
					</>
				)}
				<details>
					<summary>Danger zone</summary>
					<div className="details-content">
						<Button
							text="Random preset"
							tooltip="Generates a random preset"
							onClick={() => trevorSocket?.randomPreset(device.id)}
							className="menu-button"
						/>
						{!device.proxy ? (
							<Button
								text="Kill"
								tooltip="Kill the device and removes it from the session"
								onClick={() => {
									trevorSocket?.killDevice(device.id);
									onDeselect();
								}}
								className="menu-button"
							/>
						) : (
							<Button
								text="Unregister"
								tooltip="Unregister the service from the network bus"
								onClick={() => {
									trevorSocket?.unregisterService(device.id, device.repr);
									onDeselect();
								}}
								className="menu-button"
							/>
						)}
					</div>
				</details>
			</>
		);
	}

	// MIDI device
	const device = selectedDevice as MidiDevice;
	const section =
		displayedSection?.device.id === device.id
			? (displayedSection.section as MidiDeviceSection)
			: undefined;

	if (section) {
		return (
			<>
				<p style={{ marginLeft: "5px", fontSize: "18px" }}>
					{device.repr} {section.name}
				</p>
				{section.parameters.map((param) => (
					<label
						key={param.name}
						style={{
							width: "100%",
							display: "flex",
							flexDirection: "row",
							alignItems: "baseline",
						}}
					>
						<p
							style={{
								margin: 0,
								paddingLeft: "4px",
								paddingRight: "4px",
								width: "100%",
								overflowInline: "auto",
							}}
						>
							{param.name}
						</p>
						{createMidiParameterInput(device, param)}
					</label>
				))}
				<hr />
				<Button
					text="Back to device view"
					tooltip="Returns to the main device view"
					onClick={() => onMidiDeviceClick(device)}
					className="menu-button"
				/>
			</>
		);
	}

	return (
		<>
			<p style={{ marginLeft: "5px", fontSize: "18px" }}>{device.repr}</p>
			<Button
				text="Random preset"
				tooltip="Generates a random preset"
				onClick={() => trevorSocket?.randomPreset(device.id)}
				className="menu-button"
			/>
			<hr />
			<label
				style={{
					width: "100%",
					display: "flex",
					marginLeft: "10px",
					alignItems: "baseline",
				}}
			>
				<p style={{ margin: "0px", width: "50%", overflowInline: "auto" }}>
					channel
				</p>
				<input
					type="number"
					inputMode="numeric"
					onChange={(e) => {
						trevorSocket?.setDeviceChannel(
							device,
							Number.parseInt(e.target.value, 10) || 0,
						);
					}}
					min={0}
					max={15}
					value={channels[device.id]}
				/>
			</label>
			<hr />
			{device.meta.sections?.map((sec) => (
				<Button
					key={sec.name}
					text={sec.name}
					tooltip={`Opens section ${sec.name}`}
					onClick={() => onSectionChange({ device, section: sec })}
					className="menu-button"
				/>
			))}
			<hr />
			<Button
				text="Force not off"
				tooltip="Send multiple note off to the device"
				onClick={() => trevorSocket?.forceNoteOff(device.id)}
				className="menu-button"
			/>
			<details>
				<summary>Danger zone</summary>
				<div className="details-content">
					<Button
						text="Kill device"
						tooltip="Kills the device"
						onClick={() => trevorSocket?.killDevice(device.id)}
						className="menu-button"
					/>
				</div>
			</details>
			<hr />
		</>
	);
};

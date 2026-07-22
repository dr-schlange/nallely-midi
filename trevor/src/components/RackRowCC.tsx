/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
import {
	forwardRef,
	useCallback,
	useImperativeHandle,
	useMemo,
	useState,
} from "react";
import type { CCValues, MidiDevice, MidiParameter } from "../model";
import { useTrevorDispatch, useTrevorSelector } from "../store";
import { resetCCState } from "../store/runtimeSlice";
import { generateAcronym } from "../utils/utils";
import { useTrevorWebSocket } from "../websockets/websocket";
import { Button, CircularSlider } from "./widgets/BaseComponents";

interface CCsRackProps {
	onRackScroll?: () => void;
	orientation?: "horizontal" | "vertical";
}

export interface RackRowCCRef {
	resetAll: () => void;
}

export type CCValuesExtended = Record<
	number, // deviceId
	Record<
		string, // device repr
		Record<
			string, // section name
			Record<
				string, // parameter name
				{
					value: number; // value
					meta: MidiParameter; // meta infos
				}
			>
		>
	>
>;

const switchOrientation = (orientation) => {
	if (orientation === "horizontal") {
		return {
			maxHeight: "125px",
			minHeight: "125px",
			overflowX: "auto",
			overflowY: "auto",
		};
	}
	return {
		maxWidth: "100px",
		minWidth: "100px",
		overflowX: "auto",
		overflowY: "auto",
	};
};

const switchSizeOrientation = (orientation) => {
	if (orientation === "horizontal") {
		return {
			// width: "100%",
			// height: "100px",
		};
	}
	return {
		width: "90px",
		// height: "100%",
	};
};

const buildFullParameters = (
	devices: MidiDevice[],
	ccValues: CCValues,
): CCValuesExtended => {
	const fullParameters = {};
	for (const device of devices) {
		const config = {};
		fullParameters[device.id] = { [device.repr]: config };
		for (const section of device.meta.sections) {
			const sectionConfig = {};
			let sectionName = undefined;
			for (const parameter of section.parameters) {
				sectionName = parameter.section_name;
				const ccValue =
					ccValues?.[device.id]?.[device.repr]?.[parameter.section_name]?.[
						parameter.name
					];
				sectionConfig[parameter.name] = {
					value:
						ccValue ??
						device.config?.[sectionName]?.[parameter.name] ??
						parameter.init_value,
					meta: parameter,
				};
			}
			if (sectionName) {
				config[sectionName] = sectionConfig;
			}
		}
	}
	return fullParameters;
};

interface DevicesectionCCProps {
	deviceId: number;
	deviceName: string;
	sectionName: string;
	parameters: Record<string, { value: number; meta: MidiParameter }>;
	handleParameterChange: (
		deviceId: number,
		sectionName: string,
		parameterName: string,
		value: number,
	) => void;
	orientation: "horizontal" | "vertical";
}

const DeviceSectionCC = ({
	deviceId,
	deviceName,
	sectionName,
	parameters,
	handleParameterChange,
	orientation,
}: DevicesectionCCProps) => {
	const [isOpen, setIsOpen] = useState(false);

	const buildWidget = useCallback(
		(
			{ value, meta }: { value: number; meta: MidiParameter },
			paramName: string,
		) => {
			if (meta?.accepted_values.length > 0) {
				// TODO
			}
			return (
				<CircularSlider
					key={`${deviceName}::${sectionName}::${paramName}`}
					value={value}
					param={meta ?? ({ name: paramName } as MidiParameter)}
					onManualSliderChange={(value) =>
						handleParameterChange(deviceId, sectionName, paramName, value)
					}
					acronymeLimit={7}
				/>
			);
		},
		[deviceName, sectionName, deviceId, handleParameterChange],
	);

	return (
		<div
			key={`${deviceName}::${sectionName}`}
			style={{
				height: isOpen ? "100%" : "17px",
				width: "100%",
				display: "flex",
				flexDirection: orientation === "horizontal" ? "column" : "row",
				alignItems: "center",
				flexWrap: orientation === "vertical" ? "wrap" : "unset",
				justifyContent: "space-around",
			}}
		>
			{/* CircularSlider container section */}
			<p
				style={{
					fontSize: "12px",
					backgroundColor: "orange",
					color: "#7b550f",
					width: "100%",
					margin: orientation === "horizontal" ? "0" : "1px",
					padding: orientation === "horizontal" ? "2px" : "3px",
					cursor: "pointer",
					borderTop: orientation === "horizontal" ? "2px solid gray" : "unset",
				}}
				onClick={() => setIsOpen((prev) => !prev)}
			>
				{`${generateAcronym(sectionName, 5)}`}
			</p>
			<div
				style={{
					display: isOpen ? "flex" : "none",
					flexDirection: "row",
					flexWrap: orientation === "vertical" ? "wrap" : "unset",
					gap:
						orientation === "vertical"
							? Object.values(parameters).length > 2
								? "unset"
								: "3px"
							: "2px",
					justifyContent: "space-around",
					marginBottom: "3px",
					marginLeft: orientation === "vertical" ? "unset" : "7px",
					marginRight: orientation === "vertical" ? "unset" : "2px",
				}}
			>
				{Object.entries(parameters).map(([paramName, paramInfo]) =>
					buildWidget(paramInfo, paramName),
				)}
			</div>
		</div>
	);
};

interface DeviceCCProps {
	deviceId: number;
	deviceName: string;
	section: Record<
		string,
		Record<string, { value: number; meta: MidiParameter }>
	>;
	handleParameterChange: (
		deviceId: number,
		sectionName: string,
		parameterName: string,
		value: number,
	) => void;
	orientation: "horizontal" | "vertical";
}

const DeviceCC = ({
	deviceId,
	deviceName,
	section,
	handleParameterChange,
	orientation,
}: DeviceCCProps) => {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<div
			key={`${deviceName}::${deviceId}`}
			style={{
				backgroundColor: "#e0e0e0",
				border: "3px solid #808080",
				...switchSizeOrientation(orientation),
				padding: "1px",
			}}
		>
			<p
				style={{
					fontSize: "16px",
					margin: "0",
					padding: orientation === "horizontal" ? "2px" : "4px",
					backgroundColor: "gray",
					color: "lightgray",
					cursor: "pointer",
				}}
				onClick={() => setIsOpen((prev) => !prev)}
			>
				{deviceName}
			</p>
			{/* body container */}
			<div
				key={`${deviceName}-body`}
				style={{
					display: isOpen ? "flex" : "none",
					flexDirection: orientation === "horizontal" ? "row" : "column",
					justifyContent: "center",
					paddingBottom: orientation === "horizontal" ? "0" : "3px",
				}}
			>
				{/* section level */}
				{Object.entries(section).map(([sectionName, parameters]) => (
					<DeviceSectionCC
						deviceId={deviceId}
						deviceName={deviceName}
						handleParameterChange={handleParameterChange}
						orientation={orientation}
						parameters={parameters}
						sectionName={sectionName}
						key={`${deviceId}::${sectionName}`}
					/>
				))}
			</div>
		</div>
	);
};

export const RackRowCCs = forwardRef<RackRowCCRef, CCsRackProps>(
	({ onRackScroll, orientation }: CCsRackProps, ref) => {
		const ccs = useTrevorSelector((state) => state.runTime.ccValues);
		const devices = useTrevorSelector((state) => state.nallely.midi_devices);
		const [seeAll, setSeeAll] = useState(false);
		const fullCCs = useMemo(() => {
			return buildFullParameters(devices, ccs);
		}, [devices, ccs]);

		const dispatch = useTrevorDispatch();
		const trevorSocket = useTrevorWebSocket();

		useImperativeHandle(ref, () => ({
			resetAll() {
				dispatch(resetCCState());
			},
		}));

		const handleParameterChange = (
			deviceId: number,
			sectionName: string,
			parameterName: string,
			value: number,
		) => {
			trevorSocket.setParameterValue(
				deviceId,
				sectionName,
				parameterName,
				value,
			);
		};

		const handleSeeAll = () => {
			setSeeAll((prev) => !prev);
			updateCCs();
		};

		const updateCCs = () => {
			const root = (seeAll ? fullCCs : ccs) as CCValuesExtended;
			if (Object.values(root).length === 0) {
				return <p style={{ color: "gray" }}>CCs values</p>;
			}
			// Device level
			return Object.entries(root).map(([deviceId, config]) =>
				Object.entries(config).map(([deviceName, section]) => (
					<DeviceCC
						deviceId={Number.parseInt(deviceId, 10)}
						deviceName={deviceName}
						handleParameterChange={handleParameterChange}
						orientation={orientation}
						section={section}
						key={`${deviceId}::${deviceName}`}
					/>
				)),
			);
		};

		return (
			<div
				className={`rack-row ${orientation}`}
				onScroll={() => onRackScroll?.()}
				// @ts-expect-error: all good, but should check later
				style={switchOrientation(orientation)}
			>
				<div className="rack-top-bar">
					<Button
						style={{
							color: "var(--black)",
						}}
						text="see all"
						activated={seeAll}
						onClick={handleSeeAll}
						tooltip="Show all MIDI parameters"
					/>
				</div>
				<div className="inner-rack-row">{updateCCs()}</div>
			</div>
		);
	},
);

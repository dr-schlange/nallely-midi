/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
import { useEffect, useState } from "react";
import { useTrevorSelector } from "../../store";
import { useTrevorWebSocket } from "../../websockets/websocket";
import { generateAcronym, useLongPress } from "../../utils/utils";
import type { VirtualDeviceSchema, VirtualParameter } from "../../model";

interface VDeviceSelectionModalProps {
	onClose: () => void;
}

interface ModalProps {
	onClose: () => void;
	onCancel: () => void;
	children?;
}

interface VDeviceProps {
	schema: VirtualDeviceSchema;
	onClick?: (device: VirtualDeviceSchema) => void;
	onLongPress?: (device: VirtualDeviceSchema) => void;
	onTouchStart?: (device: VirtualDeviceSchema) => void;
	selected?: boolean;
}

const Port = ({
	parameter,
	reverse = false,
}: {
	parameter: VirtualParameter;
	reverse?: boolean;
}) => {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: reverse ? "row-reverse" : "row",
				alignItems: "center",
				justifyContent: "flex-end",
				gap: "2px",
			}}
		>
			<p
				style={{
					fontSize: "8px",
					margin: 0,
					color: "gray",
				}}
				title={parameter.name}
			>
				{generateAcronym(parameter.name, 4)}
			</p>
			<div
				style={{
					width: "6px",
					height: "6px",
					backgroundColor: "orange",
					borderRadius: "50%",
				}}
			/>
		</div>
	);
};

const HIDE = ["set_pause"];
const VDevice = ({
	schema,
	onClick,
	selected,
	onLongPress,
	onTouchStart,
}: VDeviceProps) => {
	const height = "100px";
	const width = "58px";
	const clipping = schema.name.length >= 8;
	const parameters = schema.parameters.filter((e) => !HIDE.includes(e.name));
	const enoughSpace = parameters.length < 10;
	const sufficientSpace = parameters.length < 15;

	const longPressEvents = useLongPress(
		() => {
			onLongPress?.(schema);
		},
		500,
		() => onTouchStart?.(schema),
	);

	return (
		<div
			style={{
				paddingTop: "1px",
				border: `3px solid ${selected ? "orange" : "gray"}`,
				height: height,
				width: width,
				minWidth: width,
				display: "flex",
				flexWrap: "wrap",
				flexDirection: "row",
				gap: "0px",
				justifyContent: "space-evenly",
				backgroundColor: "#d0d0d0",
				userSelect: "none",
			}}
			onClick={(event) => {
				event.preventDefault();
				event.stopPropagation();

				if (!longPressEvents.didLongPress.current) {
					onClick?.(schema);
				}
			}}
			{...longPressEvents}
		>
			<div
				style={{
					display: "inherit",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "space-between",
					height: "101px",
					width: "25px",
					padding: "1px",
					gap: "2px",
				}}
			>
				<div
					style={{
						maxHeight: enoughSpace ? "98px" : sufficientSpace ? "90px" : "60px",
						display: "flex",
						flexDirection: "column",
						justifyContent: clipping ? "flex-end" : "flex-start",
						overflow: "hidden",
					}}
				>
					<p
						style={{
							margin: 0,
							whiteSpace: "nowrap",
							fontSize: "14px",
							color: "black",
							writingMode: "vertical-rl",
							textOrientation: "sideways",
							transform: "rotate(180deg)",
						}}
					>
						{schema.name}
					</p>
				</div>
				<div
					style={{
						height: enoughSpace
							? 0
							: sufficientSpace
								? "34px"
								: clipping
									? "30px"
									: "59px",
						width: "22px",
						margin: "1px",
						display: "inherit",
						flexDirection: "column-reverse",
						justifyContent: "flex-start",
						gap: "2px",
						overflow: "hidden",
					}}
				>
					{parameters.slice(10).map((p) => (
						<Port key={p.cv_name} parameter={p} reverse />
					))}
				</div>
			</div>
			<div
				style={{
					height: "98px",
					width: "25px",
					padding: "1px",
					gap: "2px",
					display: "inherit",
					flexDirection: "column-reverse",
					justifyContent: "flex-end",
				}}
			>
				{parameters.slice(0, 10).map((p) => (
					<Port key={p.cv_name} parameter={p} />
				))}
			</div>
		</div>
	);
};

const Modal = ({ onClose, onCancel, children }: ModalProps) => {
	return (
		<div className="modal-vdevice-selection">
			<div
				style={{
					width: "100%",
					height: "40px",
					backgroundColor: "#d0d0d0",
					borderBottom: "2px solid #808080",
					padding: "0 10px",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					boxSizing: "border-box",
					flex: "0 0 auto",
				}}
			>
				<button type="button" className="close-button" onClick={onClose}>
					Close
				</button>
				<button type="button" className="close-button" onClick={onCancel}>
					Cancel
				</button>
			</div>
			<div
				style={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					minHeight: 0,
					boxSizing: "border-box",
					overflow: "hidden",
				}}
			>
				{children}
			</div>
		</div>
	);
};

const VDeviceSelectionModal = ({ onClose }: VDeviceSelectionModalProps) => {
	const schemas = useTrevorSelector(
		(state) => state.nallely.virtual_devices_schemas,
	);
	const trevorSocket = useTrevorWebSocket();
	const [selections, setSelections] = useState<
		Record<string, { schema: VirtualDeviceSchema; count: number }>
	>({});
	const [selection, setSelection] = useState(null);
	const [doc, setDoc] = useState(null);

	useEffect(() => {
		trevorSocket.fetchVirtualDeviceSchemas();
	}, [trevorSocket, trevorSocket.socket]);

	const addDevice = (schema: VirtualDeviceSchema) => {
		setSelections((prev) => {
			const newSelection = { ...prev };
			if (schema.name in prev) {
				newSelection[schema.name].count += 1;
			} else {
				newSelection[schema.name] = {
					schema,
					count: 1,
				};
			}
			setDoc(schema.doc);

			return newSelection;
		});
		setSelection(schema);
	};

	const removeDevice = (schema: VirtualDeviceSchema) => {
		setSelections((prev) => {
			if (!(schema.name in prev)) {
				return prev;
			}
			const newSelection = { ...prev };
			newSelection[schema.name].count -= 1;
			if (newSelection[schema.name].count === 0) {
				delete newSelection[schema.name];
			}

			return newSelection;
		});
	};

	const commit = () => {
		const classes = {};
		for (const device of Object.values(selections)) {
			classes[device.schema.name] = device.count;
		}
		if (Object.keys(classes).length > 0) {
			trevorSocket.createDevices(classes);
		}
		onClose?.();
	};

	return (
		<Modal onClose={commit} onCancel={onClose}>
			{schemas.length === 0 && <p>Loading available devices...</p>}

			<div className="modal-vdevice-content">
				<div className="modal-vdevice-list">
					{schemas.map((schema) => (
						<VDevice
							key={schema.name}
							schema={schema}
							onClick={addDevice}
							onLongPress={(schema) => {
								setDoc(schema.doc);
							}}
							onTouchStart={(schema) => {
								setSelection(schema);
								setDoc(schema.doc);
							}}
							selected={selection?.name === schema.name}
						/>
					))}
				</div>
				{/* Bottom div */}
				<div className="modal-vdevice-bottom">
					{/* left div */}
					<div className="modal-vdevice-selection-list">
						{Object.entries(selections).map(([name, { schema, count }]) => (
							<>
								<VDevice key={name} schema={schema} onClick={removeDevice} />
								<p
									style={{
										fontSize: "16px",
										color: "grey",
										margin: 0,
									}}
								>
									x{count.toString()}
								</p>
							</>
						))}
					</div>
					{/* right div */}
					<div
						style={{
							flex: 1,
							display: "flex",
							flexDirection: "column",
							backgroundColor: "#e0e0e0",
							border: "3px solid grey",
							paddingLeft: "5px",
							minHeight: 0,
							minWidth: "150px",
						}}
					>
						{selection ? (
							doc ? (
								<pre
									style={{
										fontSize: "14px",
										overflow: "auto",
										flex: 1,
										margin: 0,
										paddingTop: "5px",
									}}
								>
									{doc}
								</pre>
							) : (
								<pre
									style={{
										fontSize: "18px",
										overflow: "auto",
										flex: 1,
										margin: 0,
										paddingTop: "5px",
										color: "gray",
									}}
								>
									No documentation for {selection.name}
								</pre>
							)
						) : (
							<pre
								style={{
									fontSize: "18px",
									overflow: "auto",
									flex: 1,
									margin: 0,
									paddingTop: "5px",
									color: "gray",
								}}
							>
								<br />
								Add a device to the selection with a click/tap
								<br />
								<br />
								Display documentation with a long press
								<br />
								<br />
								Remove a device from selection with a click/tap
							</pre>
						)}
					</div>
				</div>
			</div>
		</Modal>
	);
};

export default VDeviceSelectionModal;

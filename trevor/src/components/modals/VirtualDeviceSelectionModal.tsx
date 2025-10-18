import { useEffect, useState } from "react";
import { useTrevorSelector } from "../../store";
import { useTrevorWebSocket } from "../../websockets/websocket";
import type { VirtualDeviceSchema } from "../../model";
import VDeviceSchema from "../VDevSchemaComponent";
import { Button } from "../widgets/BaseComponents";

interface VDeviceSelectionModalProps {
	onClose: () => void;
}

interface ModalProps {
	onClose: () => void;
	onCancel: () => void;
	children?;
	header?;
}

const Modal = ({ onClose, onCancel, children, header }: ModalProps) => {
	return (
		<div className="modal-vdevice-selection">
			<div
				style={{
					width: "100%",
					height: "52px",
					backgroundColor: "#d0d0d0",
					borderBottom: "2px solid #808080",
					padding: "0 10px",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					boxSizing: "border-box",
					flex: "0 0 auto",
					gap: "5px",
				}}
			>
				<button type="button" className="close-button" onClick={onClose}>
					Close
				</button>
				{header}
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
	const [filter, setFilter] = useState<string>();

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

	const header = () => {
		const firstLetters = new Set(schemas.map((s) => s.name?.[0]));
		return (
			<div
				style={{
					display: "flex",
					flexDirection: "row",
					gap: "2px",
					flexWrap: "wrap",
					justifyContent: "space-around",
				}}
			>
				{[...firstLetters].sort().map((l) => {
					return (
						<Button
							key={l}
							text={l.toUpperCase()}
							tooltip="Filter on first letter"
							activated={filter === l}
							variant="small"
							onClick={() => {
								if (filter === l) {
									setFilter(undefined);
								} else {
									setFilter(l);
								}
							}}
						/>
					);
				})}
			</div>
		);
	};

	return (
		<Modal onClose={commit} onCancel={onClose} header={header()}>
			{schemas.length === 0 && <p>Loading available devices...</p>}

			<div className="modal-vdevice-content">
				<div className="modal-vdevice-list">
					{schemas
						.filter((s) => filter === undefined || s.name?.[0] === filter)
						.map((schema) => (
							<VDeviceSchema
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
								<VDeviceSchema
									key={name}
									schema={schema}
									onClick={removeDevice}
								/>
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

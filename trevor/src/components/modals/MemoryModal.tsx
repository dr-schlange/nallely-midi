import { ReactNode, useEffect, useMemo, useState } from "react";
import { useTrevorWebSocket } from "../../websockets/websocket";
import {
	LOCAL_STORAGE_RUNTIME,
	useTrevorDispatch,
	useTrevorSelector,
} from "../../store";
import {
	resetPatchDetails,
	setCurrentAddress,
	setSaveDefaultValue as setSaveDefaultValueAction,
} from "../../store/runtimeSlice";
import { Button } from "../widgets/BaseComponents";
import type { Address } from "../../model";

interface MemoryModalProps {
	onClose: () => void;
	onLoad?: () => void;
}

const saveCurrentAddress = (address: Address) => {
	try {
		const raw = localStorage.getItem(LOCAL_STORAGE_RUNTIME);
		const runtimeValues = raw ? JSON.parse(raw) : {};
		runtimeValues.currentAddress = address;
		localStorage.setItem(LOCAL_STORAGE_RUNTIME, JSON.stringify(runtimeValues));
	} catch {
		console.debug(`Cannot read properly ${LOCAL_STORAGE_RUNTIME}`);
	}
};

interface AddressBlock {
	hex: string;
	path: string;
	status: "used" | "empty" | "error";
}

const generateAddressList = (
	usedAddresses: Address[],
	// chunkSize = 8,
): AddressBlock[] => {
	const addresses = Array.from({ length: 0x03ff }, (_, i) => {
		const hex = i.toString(16).padStart(4, "0").toUpperCase();
		const usedAddress = usedAddresses.find((a) => a.hex === hex);
		return {
			hex,
			path: usedAddress?.path,
			status: (usedAddress ? "used" : "empty") as "used" | "empty" | "error",
		};
	});

	// const chunks = Array.from(
	// 	{ length: Math.ceil(addresses.length / chunkSize) },
	// 	(_, i) => addresses.slice(i * chunkSize, i * chunkSize + chunkSize),
	// );

	return addresses;
};

export const MemoryModal = ({ onClose, onLoad }: MemoryModalProps) => {
	const currentAddress = useTrevorSelector(
		(state) => state.runTime.currentAddress,
	);
	const usedAddresses = useTrevorSelector(
		(state) => state.runTime.usedAddresses,
	);
	const defaultValue = useTrevorSelector(
		(state) => state.runTime.saveDefaultValue,
	);
	const dispatch = useTrevorDispatch();
	// const [address, setAddress] = useState(currentAddress);
	const [saveDefaultValue, setSaveDefaultValue] = useState(defaultValue);
	const trevorWebSocket = useTrevorWebSocket();
	const patchDetails = useTrevorSelector((state) => state.runTime.patchDetails);
	const [details, setDetails] = useState<ReactNode>();
	const [selection, setSelection] = useState<AddressBlock>(null);

	useEffect(() => {
		trevorWebSocket?.getUsedAddresses();
	}, [trevorWebSocket, trevorWebSocket?.socket]);

	const selectAddress = () => {
		const addr = selection;
		if (!addr) {
			return;
		}
		dispatch(setCurrentAddress(addr));
	};

	const saveConfig = () => {
		// const addr = selection ?? address;
		const addr = selection;
		if (!addr) {
			return;
		}
		// setAddress(addr);
		trevorWebSocket?.saveAdress(addr.hex, saveDefaultValue);
		trevorWebSocket?.getUsedAddresses();
		// dispatch(setCurrentAddress(addr));
		dispatch(setSaveDefaultValueAction(saveDefaultValue));
	};

	const loadConfig = () => {
		// const addr = selection ?? address;
		const addr = selection;
		if (!addr) {
			return;
		}
		// setAddress(addr);
		setSelection(null);
		trevorWebSocket?.loadAddress(addr.hex);
		dispatch(setCurrentAddress(addr));
		setDetails(undefined);
		onLoad?.();
		onClose?.();
	};

	const clearConfig = () => {
		// const addr = selection ?? address;
		const addr = selection;
		if (!addr) {
			return;
		}
		trevorWebSocket?.clearAddress(addr.hex);
		// dispatch(setCurrentAddress(addr));
		setDetails(<p className="details">Empty address</p>);
	};

	const addresses = useMemo(() => {
		return generateAddressList(usedAddresses);
	}, [usedAddresses]);

	useEffect(() => {
		if (!patchDetails) {
			setDetails(undefined);
			dispatch(resetPatchDetails());
			return;
		}
		const midiDetails = [];
		for (const [midi, count] of Object.entries(patchDetails.midi)) {
			midiDetails.push(
				<li className="details" key={midi}>
					{midi}: {count}
				</li>,
			);
		}
		const virtualDetails = [];
		for (const [virtual, count] of Object.entries(patchDetails.virtual)) {
			virtualDetails.push(
				<li className="details" key={virtual}>
					{virtual}: {count}
				</li>,
			);
		}
		setDetails(
			<>
				<p className="details">MIDI [{midiDetails.length}]</p>
				{midiDetails.length > 0 && <ul className="details">{midiDetails}</ul>}
				<p className="details">Virtuals [{virtualDetails.length}]</p>
				{virtualDetails.length > 0 && (
					<ul className="details">{virtualDetails}</ul>
				)}
				<p className="details">Patches: {patchDetails.patches}</p>
				<p className="details">
					Playground code? {patchDetails.playground_code}
				</p>
			</>,
		);
	}, [patchDetails]);

	const setAddressSelection = (address) => {
		setSelection(address);
		if (!address.path) {
			setDetails(<p className="details">Empty address</p>);
			return;
		}
		trevorWebSocket?.fetchPathInfos(address.path);
		setDetails(<p className="details">fetching details...</p>);
	};

	useEffect(() => {
		const addr = usedAddresses.find((a) => a.hex === selection?.hex);
		if (addr) {
			trevorWebSocket?.fetchPathInfos(addr.path);
		}
	}, [usedAddresses]);

	return (
		<div
			className="save-modal"
			style={{
				height: "80%",
			}}
		>
			<div className="modal-header">
				<button
					type="button"
					className="close-button"
					onClick={() => {
						setDetails(undefined);
						onClose?.();
					}}
				>
					Close
				</button>
				<button
					disabled={!selection}
					type="button"
					className="close-button"
					onClick={selectAddress}
					style={{
						...(!selection ? { color: "gray" } : {}),
					}}
				>
					Pin
				</button>
				<button
					disabled={!selection}
					type="button"
					className="close-button"
					onClick={saveConfig}
					style={{
						...(!selection ? { color: "gray" } : {}),
					}}
				>
					Save
				</button>
				<button
					disabled={!selection}
					type="button"
					className="close-button"
					onClick={loadConfig}
					style={{
						...(!selection ? { color: "gray" } : {}),
					}}
				>
					Load
				</button>
				<button
					disabled={!selection}
					type="button"
					className="close-button"
					onClick={clearConfig}
					style={{
						...(!selection ? { color: "gray" } : {}),
					}}
				>
					Clear
				</button>
			</div>
			<div
				style={{
					display: "flex",
					flexDirection: "row",
					alignItems: "flex-start",
					height: "100%",
					justifyContent: "space-between",
					padding: "10px",
					overflow: "auto",
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						overflowX: "auto",
						overflowY: "auto",
					}}
				>
					<h3>Memory[0x{selection?.hex ?? currentAddress?.hex ?? "????"}]</h3>
					{/* {currentAddress && (
						<p className="details">
							selected [0x{currentAddress?.hex ?? "????"}]
						</p>
					)} */}
					{details}
				</div>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: "2px",
						height: "100%",
						width: "200px",
						overflowY: "auto",
					}}
				>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(8, 1fr)",
							gap: "2px",
						}}
					>
						{addresses.map((ad) => {
							const label = `0x${ad.hex.padStart(4, "0").toUpperCase()}`;
							const color = ad.status === "used" ? "#75a759ff" : "#e0e0e0";
							const activated =
								ad.hex === currentAddress?.hex && selection?.hex !== ad.hex;
							const borderColor = activated
								? "3px solid yellow"
								: selection?.hex === ad.hex
									? "3px solid orange"
									: "2px solid gray";
							return (
								<Button
									key={label}
									text=""
									tooltip={label}
									onClick={() => setAddressSelection(ad)}
									// activated={
									// 	ad.hex === currentAddress?.hex &&
									// 	selection?.hex !== ad.hex
									// }
									variant={"big"}
									style={{
										backgroundColor: color,
										boxSizing: "border-box",
										border: borderColor,
									}}
								/>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
};

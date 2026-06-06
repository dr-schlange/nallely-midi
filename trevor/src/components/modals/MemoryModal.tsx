import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { Address } from "../../model";
import {
	// LOCAL_STORAGE_RUNTIME,
	useTrevorDispatch,
	useTrevorSelector,
} from "../../store";
import {
	resetPatchDetails,
	setCurrentAddress,
	setSaveDefaultValue as setSaveDefaultValueAction,
} from "../../store/runtimeSlice";
// import { extractCurrentIP } from "../../utils/utils";
import { useTrevorWebSocket } from "../../websockets/websocket";
import { Button } from "../widgets/BaseComponents";

interface MemoryModalProps {
	onClose: () => void;
	onLoad?: () => void;
}

// const saveCurrentAddress = (address: Address) => {
//   const currentIp = extractCurrentIP()
//    const runtimeKey = `${LOCAL_STORAGE_RUNTIME}@${currentIp}`

// 	try {
// 		const raw = localStorage.getItem(runtimeKey);
// 		const runtimeValues = raw ? JSON.parse(raw) : {};
// 		runtimeValues.currentAddress = address;
// 		localStorage.setItem(runtimeKey, JSON.stringify(runtimeValues));
// 	} catch {
// 		console.debug(`Cannot read properly ${runtimeKey}`);
// 	}
// };

interface AddressBlock {
	hex: string;
	path: string;
	status: "used" | "empty" | "error";
	metaColor?: string;
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
			metaColor: usedAddress?.metadata?.color,
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
	const [metaName, setMetaName] = useState<string>("");
	const [metaColor, setMetaColor] = useState<string>("#75a759");
	const [metaDescr, setMetaDescr] = useState<string>("");
	const [showMeta, setShowMeta] = useState<boolean>(false);
	const [searchQuery, setSearchQuery] = useState<string>("");

	const selectionRef = useRef(selection);
	useEffect(() => {
		selectionRef.current = selection;
	});

	useEffect(() => {
		trevorWebSocket?.getUsedAddresses();
	}, [trevorWebSocket, trevorWebSocket?.socket]);

	const selectAddress = () => {
		const addr = selection;
		if (!addr) {
			return;
		}
		// saveCurrentAddress(addr)
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
		if (!addr || addr.status === "empty") {
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

	const matchingHexes = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return new Set<string>();
		return new Set(
			usedAddresses
				.filter(
					(a) =>
						a.metadata?.name?.toLowerCase().includes(q) ||
						a.metadata?.description?.toLowerCase().includes(q),
				)
				.map((a) => a.hex),
		);
	}, [searchQuery, usedAddresses]);

	useEffect(() => {
		if (!patchDetails) {
			setDetails(undefined);
			setShowMeta(false);
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
		setShowMeta(true);
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
	}, [patchDetails, dispatch]);

	const saveMetadata = (name: string, color: string, description: string) => {
		const hex = selection?.hex ?? currentAddress?.hex;
		if (!hex) return;
		trevorWebSocket?.saveAddressMetadata(hex, name, color, description);
	};

	const setAddressSelection = (address) => {
		setSelection(address);
		if (!address.path) {
			setDetails(<p className="details">Empty address</p>);
			setShowMeta(false);
			return;
		}
		const addrMeta = usedAddresses.find((a) => a.hex === address.hex)?.metadata;
		setMetaName(addrMeta?.name ?? "");
		setMetaColor(addrMeta?.color ?? "#75a759");
		setMetaDescr(addrMeta?.description ?? "");
		trevorWebSocket?.fetchPathInfos(address.path);
		setDetails(<p className="details">fetching details...</p>);
	};

	useEffect(() => {
		const sel = selectionRef.current;
		if (sel?.hex) {
			// force a refetch info after a save
			const addr = usedAddresses.find((a) => a.hex === sel.hex);
			if (addr?.path) trevorWebSocket?.fetchPathInfos(addr.path);
		} else if (currentAddress?.hex) {
			// if no selection, but hex addr, then we fetch infos
			const found = usedAddresses.find((a) => a.hex === currentAddress.hex);
			if (found?.path) {
				setMetaName(found.metadata?.name ?? "");
				setMetaColor(found.metadata?.color ?? "#75a759");
				setMetaDescr(found.metadata?.description ?? "");
				trevorWebSocket?.fetchPathInfos(found.path);
				setDetails(<p className="details">fetching details...</p>);
			}
		}
	}, [usedAddresses, currentAddress, trevorWebSocket]);

	const checkLoad = () => {
		return !selection || selection.status === "empty";
	};

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
					disabled={checkLoad()}
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
					{showMeta && (
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: "4px",
								marginTop: "8px",
							}}
						>
							<input
								type="text"
								placeholder="Name"
								value={metaName}
								onChange={(e) => setMetaName(e.target.value)}
								onBlur={() => saveMetadata(metaName, metaColor, metaDescr)}
							/>
							<input
								type="color"
								value={metaColor}
								onChange={(e) => setMetaColor(e.target.value)}
								onBlur={() => saveMetadata(metaName, metaColor, metaDescr)}
							/>
							<textarea
								value={metaDescr}
								onChange={(e) => setMetaDescr(e.target.value)}
								onBlur={() => saveMetadata(metaName, metaColor, metaDescr)}
							/>
						</div>
					)}
					<input
						type="text"
						placeholder="Search by name…"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						style={{ marginTop: "12px" }}
					/>
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
							const isMatch = matchingHexes.has(ad.hex);
							const isSearchActive = matchingHexes.size > 0;
							const color =
								ad.status === "used"
									? (ad.metaColor ?? "#75a759ff")
									: "#e0e0e0";
							const opacity =
								isSearchActive && ad.status === "used" && !isMatch ? 0.3 : 1;
							const activated =
								ad.hex === currentAddress?.hex && selection?.hex !== ad.hex;
							const borderColor = isMatch
								? "3px solid var(--browntext)"
								: activated
									? "3px solid gold"
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
										opacity,
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

import { useState } from "react";
import { useTrevorWebSocket } from "../../websockets/websocket";
import {
	LOCAL_STORAGE_RUNTIME,
	useTrevorDispatch,
	useTrevorSelector,
} from "../../store";
import {
	setPatchFilename,
	setSaveDefaultValue as setSaveDefaultValueAction,
} from "../../store/runtimeSlice";
import { Button } from "../widgets/BaseComponents";
import { incrDecrFilename } from "../../utils/utils";

interface SaveModalProps {
	onClose: () => void;
}

const saveFilename = (filename: string) => {
	try {
		const raw = localStorage.getItem(LOCAL_STORAGE_RUNTIME);
		const runtimeValues = raw ? JSON.parse(raw) : {};
		runtimeValues.patchFilename = filename;
		localStorage.setItem(LOCAL_STORAGE_RUNTIME, JSON.stringify(runtimeValues));
	} catch {
		console.debug(`Cannot read properly ${LOCAL_STORAGE_RUNTIME}`);
	}
};

export const SaveModal = ({ onClose }: SaveModalProps) => {
	const currentPatchName = useTrevorSelector(
		(state) => state.runTime.patchFilename,
	);
	const defaultValue = useTrevorSelector(
		(state) => state.runTime.saveDefaultValue,
	);
	const dispatch = useTrevorDispatch();
	const [fileName, setFileName] = useState(currentPatchName);
	const [saveDefaultValue, setSaveDefaultValue] = useState(defaultValue);
	const trevorWebSocket = useTrevorWebSocket();

	const saveConfig = () => {
		trevorWebSocket?.saveAll(fileName, saveDefaultValue);
		saveFilename(fileName);
		dispatch(setPatchFilename(fileName));
		dispatch(setSaveDefaultValueAction(saveDefaultValue));
		onClose();
	};

	const incrementFilename = () => {
		setFileName((prev) => incrDecrFilename(prev, true));
	};

	const decrementFilename = () => {
		setFileName((prev) => incrDecrFilename(prev, false));
	};

	return (
		<div className="save-modal">
			<div className="modal-header">
				<button type="button" className="close-button" onClick={onClose}>
					Close
				</button>
				<button type="button" className="close-button" onClick={saveConfig}>
					Ok
				</button>
			</div>
			<div className="save-modal-body">
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "5px",
					}}
				>
					<label>
						File{" "}
						<input
							type="text"
							value={fileName}
							onChange={(e) => setFileName(e.target.value)}
						/>
					</label>
					<Button
						text="+"
						tooltip="decrement file name"
						onClick={incrementFilename}
						variant="big"
					/>
					<Button
						text="-"
						tooltip="increment file name"
						onClick={decrementFilename}
						variant="big"
					/>
				</div>
				<label
					title="For the serialization of default values (e.g: 0)"
					style={{ fontSize: "12px" }}
				>
					<input
						type="checkbox"
						checked={saveDefaultValue}
						onChange={(e) => setSaveDefaultValue(e.target.checked)}
					/>
					Save default values
				</label>
			</div>
		</div>
	);
};

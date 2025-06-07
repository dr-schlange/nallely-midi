import { useState } from "react";
import { useTrevorWebSocket } from "../../websockets/websocket";
import { useTrevorDispatch, useTrevorSelector } from "../../store";
import {
	setPatchFilename,
	setSaveDefaultValue as setSaveDefaultValueAction,
} from "../../store/runtimeSlice";

interface SaveModalProps {
	onClose: () => void;
}

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
		dispatch(setPatchFilename(fileName));
		dispatch(setSaveDefaultValueAction(saveDefaultValue));
		onClose();
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
				<label>
					File{" "}
					<input
						type="text"
						value={fileName}
						onChange={(e) => setFileName(e.target.value)}
					/>
				</label>
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

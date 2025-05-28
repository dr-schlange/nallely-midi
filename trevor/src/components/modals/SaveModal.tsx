import { useState } from "react";
import { useTrevorWebSocket } from "../../websockets/websocket";
import { useTrevorDispatch, useTrevorSelector } from "../../store";
import { setPatchFilename } from "../../store/runtimeSlice";

interface SaveModalProps {
	onClose: () => void;
}

export const SaveModal = ({ onClose }: SaveModalProps) => {
	const currentPatchName = useTrevorSelector(
		(state) => state.runTime.patchFilename,
	);
	const dispatch = useTrevorDispatch();
	const [fileName, setFileName] = useState(currentPatchName);
	const trevorWebSocket = useTrevorWebSocket();

	const saveConfig = () => {
		trevorWebSocket?.saveAll(fileName);
		dispatch(setPatchFilename(fileName));
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
			</div>
		</div>
	);
};

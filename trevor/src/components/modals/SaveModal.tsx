import { useState } from "react";
import { useTrevorWebSocket } from "../../websockets/websocket";

interface SaveModalProps {
	onClose: () => void;
}

export const SaveModal = ({ onClose }: SaveModalProps) => {
	const [fileName, setFileName] = useState("patch");
	const trevorWebSocket = useTrevorWebSocket();

	const saveConfig = () => {
		trevorWebSocket?.saveAll(fileName);
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

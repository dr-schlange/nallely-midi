import { useEffect, useState } from "react";
import { useTrevorWebSocket } from "../../websockets/websocket";
import { useTrevorDispatch, useTrevorSelector } from "../../store";
import { setPatchFilename } from "../../store/runtimeSlice";

interface LoadModalProps {
	onClose?: () => void;
	onOk?: () => void;
}

export const LoadModal = ({ onClose, onOk }: LoadModalProps) => {
	const [selectedFile, setSelectedFile] = useState("");
	const files = useTrevorSelector((state) => state.general.knownPatches);
	const dispatch = useTrevorDispatch();
	const trevorWebSocket = useTrevorWebSocket();

	useEffect(() => {
		trevorWebSocket?.listPatches();
	}, [trevorWebSocket?.socket]);

	const loadConfig = () => {
		if (selectedFile && selectedFile.length > 0) {
			trevorWebSocket?.loadAll(selectedFile);

			const patchName = selectedFile.split("/").slice(-1)[0].split(".")[0];
			dispatch(setPatchFilename(patchName));
			onOk?.();
		}
		onClose?.();
	};

	const handleFileClick = (file: string) => {
		if (selectedFile === file) {
			setSelectedFile("");
			return;
		}
		setSelectedFile(file);
	};

	return (
		<div className="load-modal">
			<div className="modal-header">
				<button type="button" className="close-button" onClick={onClose}>
					Close
				</button>
				<button type="button" className="close-button" onClick={loadConfig}>
					Ok
				</button>
			</div>
			<div className="load-modal-body">
				<h3>Available patches</h3>
				<ul>
					{files?.map((file) => (
						// biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
						<li
							key={file}
							title={file}
							onClick={() => handleFileClick(file)}
							className={`patch ${file === selectedFile ? "selected" : ""}`}
							style={{ cursor: "pointer" }}
						>
							{file.split("/").slice(-1)}
						</li>
					))}
				</ul>
			</div>
		</div>
	);
};

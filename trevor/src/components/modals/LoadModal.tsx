import { useEffect, useState } from "react";
import { useTrevorWebSocket } from "../../websockets/websocket";
import { useTrevorSelector } from "../../store";

interface LoadModalProps {
	onClose?: () => void;
	onOk?: () => void;
}

export const LoadModal = ({ onClose, onOk }: LoadModalProps) => {
	const [selectedFile, setSelectedFile] = useState("");
	const files = useTrevorSelector((state) => state.general.knownPatches);
	const trevorWebSocket = useTrevorWebSocket();

	useEffect(() => {
		trevorWebSocket?.listPatches();
	}, [trevorWebSocket]);

	const loadConfig = () => {
		trevorWebSocket?.loadAll(selectedFile);
		onClose?.();
		onOk?.();
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

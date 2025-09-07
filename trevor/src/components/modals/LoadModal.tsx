import { ReactNode, useEffect, useState } from "react";
import { useTrevorWebSocket } from "../../websockets/websocket";
import { useTrevorDispatch, useTrevorSelector } from "../../store";
import { resetPatchDetails, setPatchFilename } from "../../store/runtimeSlice";

interface LoadModalProps {
	onClose?: () => void;
	onOk?: () => void;
}

export const LoadModal = ({ onClose, onOk }: LoadModalProps) => {
	const [selectedFile, setSelectedFile] = useState("");
	const files = useTrevorSelector((state) => state.general.knownPatches);
	const patchDetails = useTrevorSelector((state) => state.runTime.patchDetails);
	const dispatch = useTrevorDispatch();
	const trevorWebSocket = useTrevorWebSocket();
	const [details, setDetails] = useState<ReactNode>();

	useEffect(() => {
		trevorWebSocket?.listPatches();
	}, [trevorWebSocket?.socket, trevorWebSocket]);

	const loadConfig = () => {
		if (selectedFile && selectedFile.length > 0) {
			trevorWebSocket?.loadAll(selectedFile);

			const patchName = selectedFile.split("/").slice(-1)[0].split(".")[0];
			dispatch(setPatchFilename(patchName));
			onOk?.();
		}
		dispatch(resetPatchDetails());
		onClose?.();
	};

	const handleFileClick = (file: string) => {
		if (selectedFile === file) {
			setSelectedFile("");
			return;
		}
		setSelectedFile(file);
		trevorWebSocket?.fetchPathInfos(file);
		setDetails(<p className="details">fetching details...</p>);
	};

	useEffect(() => {
		if (!patchDetails) {
			setDetails(undefined);
			return;
		}
		const midiDetails = [];
		for (const [midi, count] of Object.entries(patchDetails.midi)) {
			midiDetails.push(
				<li className="details">
					{midi}: {count}
				</li>,
			);
		}
		const virtualDetails = [];
		for (const [virtual, count] of Object.entries(patchDetails.virtual)) {
			virtualDetails.push(
				<li className="details">
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
				<div style={{ display: "flex", flexDirection: "column" }}>
					<h3 className="details">Available patches</h3>
					{details}
				</div>
				<ul style={{ overflow: "auto" }}>
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

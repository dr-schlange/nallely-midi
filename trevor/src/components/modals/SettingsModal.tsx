import { useState } from "react";
import { useTrevorDispatch, useTrevorSelector } from "../../store";
import { setWebsocketURL } from "../../store/generalSlice";
import { Button } from "../widgets/BaseComponents";

interface SettingsModalProps {
	onClose: () => void;
}

export const SettingsModal = ({ onClose }: SettingsModalProps) => {
	const url = useTrevorSelector((state) => state.general.trevorWebsocketURL);
	const [config, setConfig] = useState<string>(url);
	const dispatch = useTrevorDispatch();

	const saveConfig = () => {
		onClose();
		dispatch(setWebsocketURL(config));
	};

	return (
		<div className="settings-modal">
			<div className="modal-header">
				<Button
					text="close"
					tooltip="Close"
					variant="big"
					style={{ width: "auto", padding: "0 6px", color: "var(--black)" }}
					onClick={onClose}
				/>
				<Button
					text="apply"
					tooltip="Apply"
					variant="big"
					style={{ width: "auto", padding: "0 6px", color: "var(--black)" }}
					onClick={saveConfig}
				/>
			</div>
			<div className="settings-modal-body">
				<label
					style={{
						padding: "10px",
						width: "100%",
					}}
				>
					Nallely's URL{" "}
					<input
						type="text"
						value={config}
						onChange={(e) => setConfig((_) => e.target.value)}
					/>
				</label>
			</div>
		</div>
	);
};

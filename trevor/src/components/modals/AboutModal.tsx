import { useState } from "react";
import { Button } from "../widgets/BaseComponents";

interface AboutModalProps {
	onClose: () => void;
}

export const AboutModal = ({ onClose }: AboutModalProps) => {
	const [trevor, setTrevor] = useState(2);

	const changeTrevor = () => {
		setTrevor((trevor % 2) + 1);
	};

	return (
		<div className="about-modal">
			<div className="modal-header">
				<Button
					text="close"
					tooltip="Close"
					variant="big"
					style={{ width: "auto", padding: "0 6px", color: "var(--black)" }}
					onClick={onClose}
				/>
			</div>
			<div className="about-modal-body">
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
				<img
					src={`/trevor${trevor}.svg`}
					alt="Trevor 0.0.1"
					style={{ height: "70%", margin: "10px" }}
					onClick={changeTrevor}
				/>
				<p style={{ textAlign: "center" }}>Trevor 0.2.0</p>
			</div>
		</div>
	);
};

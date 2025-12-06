import { useState } from "react";

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
				<button type="button" className="close-button" onClick={onClose}>
					Close
				</button>
			</div>
			<div className="about-modal-body">
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
				<img
					src={`/trevor${trevor}.svg`}
					alt="Trevor 0.0.1"
					style={{ width: "194px", height: "183px", margin: "10px" }}
					onClick={changeTrevor}
				/>
				<p style={{ textAlign: "center" }}>Trevor 0.2.0</p>
			</div>
		</div>
	);
};

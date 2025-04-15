interface AboutModalProps {
	onClose: () => void;
}

export const AboutModal = ({ onClose }: AboutModalProps) => {
	return (
		<div className="about-modal">
			<div className="modal-header">
				<button type="button" className="close-button" onClick={onClose}>
					Close
				</button>
			</div>
			<div className="about-modal-body">
				<img
					src="/trevor2.svg"
					alt="Trevor 0.0.1"
					style={{ margin: 10, width: "50%" }}
				/>
				<p style={{ textAlign: "center" }}>Trevor 0.0.1</p>
			</div>
		</div>
	);
};

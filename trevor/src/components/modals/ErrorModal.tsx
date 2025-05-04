import { useTrevorDispatch } from "../../store";
import { clearErrors } from "../../store/generalSlice";

interface ErrorModalProps {
	errors: string[];
}

export const ErrorModal = ({ errors }: ErrorModalProps) => {
	const dispatch = useTrevorDispatch();

	const onClose = () => {
		dispatch(clearErrors());
	};

	return (
		<div className="error-modal">
			<div className="modal-header">
				<button type="button" className="close-button" onClick={onClose}>
					Close
				</button>
			</div>
			<div className="error-modal-body">
				<h3>There was issue while loading your patch</h3>
				<ul>
					{errors?.map((error) => (
						<li key={error} style={{ fontSize: "12px" }}>
							{error}
						</li>
					))}
				</ul>
			</div>
		</div>
	);
};

import { useTrevorDispatch } from "../../store";
import { clearErrors } from "../../store/generalSlice";
import { Button } from "../widgets/BaseComponents";

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
				<Button
					text="close"
					tooltip="Close"
					variant="big"
					style={{ width: "auto", padding: "0 6px" }}
					onClick={onClose}
				/>
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

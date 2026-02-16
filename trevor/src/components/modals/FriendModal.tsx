import { useMemo } from "react";
import { useTrevorDispatch, useTrevorSelector } from "../../store";
import { setWebsocketURL } from "../../store/generalSlice";

interface FriendModalProps {
	onClose: () => void;
}

const TrevorFriend = ({ ip, port, selected }) => {
	const dispatch = useTrevorDispatch();

	const changeTrevor = () => {
		dispatch(setWebsocketURL(`ws://${ip}:${port}`));
	};

	return (
		<div className="about-modal-body">
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					margin: "10px",
				}}
			>
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
				<img
					src={`/trevor${selected ? 1 : 2}.svg`}
					alt={`Nallely session running on ${ip}: ${port}`}
					style={{ width: "45px", height: "45px", margin: "10px" }}
					onClick={changeTrevor}
				/>
				<p style={{ textAlign: "center", fontSize: "12px" }}>
					{ip}:{port}
				</p>
			</div>
		</div>
	);
};

export const FriendModal = ({ onClose }: FriendModalProps) => {
	const localFriends = useTrevorSelector((state) => state.general.friends);
	const trevorURL = useTrevorSelector(
		(state) => state.general.trevorWebsocketURL,
	);
	const friends = useMemo(
		() => [["localhost", "6788"], ...localFriends],
		[localFriends],
	);

	return (
		<div className="about-modal">
			<div className="modal-header">
				<button type="button" className="close-button" onClick={onClose}>
					Close
				</button>
			</div>
			<div className="about-modal-body">
				{(!friends && <p>Scanning local network for friends...</p>) ||
					friends.map(([ip, port]) => (
						<TrevorFriend
							key={`${ip}:${port}`}
							ip={ip}
							port={port}
							selected={`ws://${ip}:${port}` === trevorURL}
						/>
					))}
				{}
			</div>
		</div>
	);
};

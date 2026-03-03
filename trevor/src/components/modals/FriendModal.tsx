import { useCallback, useEffect } from "react";
import { useTrevorDispatch, useTrevorSelector } from "../../store";
import { setWebsocketURL } from "../../store/generalSlice";
import { useTrevorWebSocket } from "../../websockets/websocket";

interface FriendModalProps {
	onClose: () => void;
}

const TrevorFriend = ({ ip, port, selected, name }) => {
	const dispatch = useTrevorDispatch();

	const changeTrevor = () => {
		dispatch(setWebsocketURL(`ws://${ip}:${port}`));
	};

	return (
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
				{name}
				<br />
				{ip}:{port}
			</p>
		</div>
	);
};

export const FriendModal = ({ onClose }: FriendModalProps) => {
	const friends = useTrevorSelector((state) => state.general.friends);
	const trevorURL = useTrevorSelector(
		(state) => state.general.trevorWebsocketURL,
	);
	const trevorSocket = useTrevorWebSocket();

	// const friends = useMemo(
	// 	() => [["localhost", "6788"], ...localFriends],
	// 	[localFriends],
	// );

	useEffect(() => {
		if (friends && Object.keys(friends)?.length !== 0) {
			return;
		}
		trevorSocket.scanForFriends();
	}, [friends, trevorSocket]);

	const refresh = useCallback(() => {
		trevorSocket.scanForFriends();
	}, [trevorSocket]);

	const friendPresents = friends && Object.keys(friends).length > 0;

	return (
		<div className="about-modal">
			<div className="modal-header">
				<button type="button" className="close-button" onClick={onClose}>
					Close
				</button>

				<button type="button" className="close-button" onClick={refresh}>
					Refresh
				</button>
			</div>
			<div
				className="about-modal-body"
				style={{
					flexWrap: "wrap",
					justifyContent: "space-evenly",
					overflow: "auto",
				}}
			>
				{!friendPresents ? (
					<p>Scanning local network for friends...</p>
				) : (
					Object.entries(friends).map(([friend_name, [ip, port]]) => (
						<TrevorFriend
							key={`${ip}:${port}`}
							name={friend_name}
							ip={ip}
							port={port}
							selected={`ws://${ip}:${port}` === trevorURL}
						/>
					))
				)}
				{}
			</div>
		</div>
	);
};

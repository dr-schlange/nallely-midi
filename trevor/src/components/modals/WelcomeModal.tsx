import { useState } from "react";
import { useTrevorDispatch, useTrevorSelector } from "../../store";
import { disableFirstLaunch, setWebsocketURL } from "../../store/generalSlice";

export const WelcomeModal = () => {
	const dispatch = useTrevorDispatch();
	const defaultURL = useTrevorSelector(
		(state) => state.general.trevorWebsocketURL,
	);

	const handleClose = () => {
		dispatch(disableFirstLaunch());
	};

	return (
		<div className="welcome-modal">
			<div className="modal-header">
				<button type="button" className="close-button" onClick={handleClose}>
					OK
				</button>
			</div>
			<div className="welcome-modal-body">
				<h2>Welcome to Nallely and Trevor-UI</h2>
				<p>
					Trevor-UI is meant to connect to a running Nallely remote session. To
					configure the remote adress of your Nallely session, click on the ⚙
					button on the top-right of your screen.
					<br />
					The circle indicator let you know the status of the connection:
					<ul>
						<li>🟢 connected</li>
						<li>🟡 trying to connect or reconnect</li>
						<li>🔴 connection error, a reconnection will be attempted</li>
					</ul>
				</p>
				<p>Note: the default url is set to {defaultURL}</p>
				<p>
					Note2: Nallely runs with Trevor on a normal webocket, not a secure
					websocket. If you use Brave and try to connect to {defaultURL}, there
					is chances that the connection will be blocked. Use chromium/chrome or
					firefox instead.
				</p>
			</div>
		</div>
	);
};

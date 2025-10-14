import InstanceCreation from "./components/InstanceCreation";
import DevicePatching from "./components/DevicePatching";
import { Provider } from "react-redux";
import { store, useTrevorSelector } from "./store";
import { connectWebSocket } from "./websockets/websocket";
import { ErrorModal } from "./components/modals/ErrorModal";
import { useMemo, useState } from "react";
import { WelcomeModal } from "./components/modals/WelcomeModal";
import { NotificationBar } from "./components/NotificationBar";
import { PatchingDevice3D } from "./components/3d/PatchingDevice3D";

const App = () => {
	useMemo(() => {
		connectWebSocket();
	}, []);

	return (
		<Provider store={store}>
			<Main />
		</Provider>
	);
};

const Main = () => {
	const errors = useTrevorSelector((state) => state.general.errors);
	const firstLaunch = useTrevorSelector((state) => state.general.firstLaunch);
	// const trevorWebSocket = useTrevorWebSocket();
	// const interval = useRef(null);
	const [mode, setMode] = useState<string>("2D");

	const swith3DOn = (activate: boolean) => {
		setMode(activate ? "3D" : "2D");
	};

	// useEffect(() => {
	// 	interval.current = setInterval(() => {
	// 		trevorWebSocket.pullFullState();
	// 	}, 1000);
	// 	return () => {
	// 		if (interval.current) {
	// 			clearInterval(interval.current);
	// 		}
	// 	};
	// }, [trevorWebSocket, trevorWebSocket?.socket]);

	return (
		(mode === "2D" && (
			<div className="app-layout">
				<div className="top-section">
					<InstanceCreation />
				</div>
				<div className="bottom-section">
					<DevicePatching open3DView={swith3DOn} />
				</div>
				{errors && errors.length > 0 && <ErrorModal errors={errors} />}
				{firstLaunch && <WelcomeModal />}
				<svg style={{ height: "0px", width: "0px" }}>
					<title>Global definitions</title>
					<defs>
						<marker
							id="retro-arrowhead"
							markerWidth="6"
							markerHeight="6"
							refX="5"
							refY="3"
							orient="auto"
							markerUnits="strokeWidth"
						>
							<polygon
								points="0,0 5,3 0,6"
								fill="gray"
								stroke="white"
								strokeWidth="1"
								strokeOpacity="0.3"
							/>
						</marker>
						<marker
							id="retro-arrowhead-small"
							markerWidth="4"
							markerHeight="4"
							refX="3.5"
							refY="2"
							orient="auto"
							markerUnits="strokeWidth"
						>
							<polygon
								points="0,0 4,2 0,4"
								fill="#5a87bbff"
								stroke="white"
								stroke-width="0.4"
								stroke-opacity="0.3"
							/>
						</marker>
						<marker
							id="selected-retro-arrowhead-small"
							markerWidth="4"
							markerHeight="4"
							refX="3.5"
							refY="2"
							orient="auto"
							markerUnits="strokeWidth"
						>
							<polygon
								points="0,0 4,2 0,4"
								fill="blue"
								stroke="white"
								stroke-width="0.4"
								stroke-opacity="0.3"
							/>
						</marker>
						<marker
							id="selected-retro-arrowhead"
							markerWidth="6"
							markerHeight="6"
							refX="5"
							refY="3"
							orient="auto"
							markerUnits="strokeWidth"
						>
							<polygon
								points="0,0 5,3 0,6"
								fill="blue"
								stroke="white"
								strokeWidth="1"
								strokeOpacity="0.8"
							/>
						</marker>
						<marker
							id="bouncy-retro-arrowhead"
							markerWidth="6"
							markerHeight="6"
							refX="5"
							refY="3"
							orient="auto"
							markerUnits="strokeWidth"
						>
							<polygon
								points="0,0 5,3 0,6"
								fill="green"
								stroke="white"
								strokeWidth="1"
								strokeOpacity="0.8"
							/>
						</marker>
						<marker
							id="bouncy-retro-arrowhead-small"
							markerWidth="4"
							markerHeight="4"
							refX="3.5"
							refY="2"
							orient="auto"
							markerUnits="strokeWidth"
						>
							<polygon
								points="0,0 4,2 0,4"
								fill="green"
								stroke="white"
								stroke-width="0.4"
								stroke-opacity="0.3"
							/>
						</marker>
					</defs>
				</svg>
				<NotificationBar />
			</div>
		)) || <PatchingDevice3D onCloseView={() => swith3DOn(false)} />
	);
};

export default App;

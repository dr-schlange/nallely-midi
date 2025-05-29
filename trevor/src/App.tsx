import InstanceCreation from "./components/InstanceCreation";
import DevicePatching from "./components/DevicePatching";
import { Provider } from "react-redux";
import { store, useTrevorSelector } from "./store";
import { connectWebSocket } from "./websockets/websocket";
import { ErrorModal } from "./components/modals/ErrorModal";
import { useMemo } from "react";
import { WelcomeModal } from "./components/modals/WelcomeModal";
import { NotificationBar } from "./components/NotificationBar";

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

	return (
		<div className="app-layout">
			<div className="top-section">
				<InstanceCreation />
			</div>
			<div className="bottom-section">
				<DevicePatching />
			</div>
			{errors && errors.length > 0 && <ErrorModal errors={errors} />}
			{firstLaunch && <WelcomeModal />}
			<svg>
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
				</defs>
			</svg>
			<NotificationBar />
		</div>
	);
};

export default App;

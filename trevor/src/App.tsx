import InstanceCreation from "./components/InstanceCreation";
import DevicePatching from "./components/DevicePatching";
import { Provider } from "react-redux";
import { store, useTrevorSelector } from "./store";
import { connectWebSocket } from "./websockets/websocket";
import { ErrorModal } from "./components/modals/ErrorModal";

const App = () => {
	connectWebSocket();
	return (
		<Provider store={store}>
			<Main />
		</Provider>
	);
};

const Main = () => {
	const errors = useTrevorSelector((state) => state.general.errors);
	return (
		<div className="app-layout">
			<div className="top-section">
				<InstanceCreation />
			</div>
			<div className="bottom-section">
				<DevicePatching />
			</div>
			{errors && errors.length > 0 && <ErrorModal errors={errors} />}
		</div>
	);
};

export default App;

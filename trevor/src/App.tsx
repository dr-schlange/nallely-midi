import InstanceCreation from "./components/InstanceCreation";
import DevicePatching from "./components/DevicePatching";
import { Provider } from "react-redux";
import { store } from "./store";

const App = () => {
	return (
		<Provider store={store}>
			<div className="app-layout">
				<div className="top-section">
					<InstanceCreation />
				</div>
				<div className="bottom-section">
					<DevicePatching />
				</div>
			</div>
		</Provider>
	);
};

export default App;

import { store } from "./store";
import { setFullState } from "./store/trevorSlice";

const WEBSOCKET_URL = "ws://localhost:6788/trevor";

class TrevorWebSocket {
	private socket: WebSocket | null = null;
	private reconnectInterval = 5000; // 5 seconds
	private isConnected = false;

	constructor(private url: string) {
		this.connect();
	}

	private connect() {
		this.socket = new WebSocket(this.url);

		this.socket.onopen = () => {
			console.debug("WebSocket connected");
			this.isConnected = true;
		};

		this.socket.onmessage = (event) => {
			console.debug("Message received:", event.data);
			store.dispatch(setFullState(JSON.parse(event.data)));
		};

		this.socket.onclose = () => {
			console.error("WebSocket disconnected. Attempting to reconnect...");
			this.isConnected = false;
			this.reconnect();
		};

		this.socket.onerror = (error) => {
			console.error("WebSocket error:", error);
			this.isConnected = false;
			this.socket?.close();
		};
	}

	private reconnect() {
		setTimeout(() => {
			if (!this.isConnected) {
				console.log("Reconnecting...");
				this.connect();
			}
		}, this.reconnectInterval);
	}

	public sendMessage(message: string) {
		if (this.socket && this.isConnected) {
			this.socket.send(message);
		} else {
			console.error("Cannot send message. WebSocket is not connected.");
		}
	}
}

export const connectWebSocket = () => {
	const websocket = new TrevorWebSocket(WEBSOCKET_URL);

	setTimeout(() => {
		websocket.sendMessage("Hello, server!");
	}, 10000);
};

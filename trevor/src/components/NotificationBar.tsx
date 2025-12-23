import { useEffect, useRef, useState } from "react";
import { useTrevorWebSocket } from "../websockets/websocket";

const DISPLAY_DURATION = 3000;

const notifIcons = {
	ok: "🟢",
	warning: "🟡",
	error: "🔴",
};

export const NotificationBar = () => {
	const trevorSocket = useTrevorWebSocket();
	const [currentNotification, setCurrentNotification] = useState(null);
	const notificationQueue = useRef([]);
	const timeoutRef = useRef(null);

	useEffect(() => {
		const onNotificationHandler = (event) => {
			const message = JSON.parse(event.data);
			if (message.command === "notification") {
				const notifNumber = notificationQueue.current.length;
				const notifNumberInfo = notifNumber > 0 ? `[${notifNumber}]` : "";
				notificationQueue.current.push(
					`${notifIcons[message.status]} ${message.message} ${notifNumberInfo}`,
				);
				processQueue();
			}
		};

		trevorSocket?.socket?.addEventListener("message", onNotificationHandler);

		return () => {
			trevorSocket?.socket?.removeEventListener(
				"message",
				onNotificationHandler,
			);
			clearTimeout(timeoutRef.current);
		};
	}, [trevorSocket?.socket]);

	const processQueue = () => {
		if (currentNotification || notificationQueue.current.length === 0) {
			return;
		}
		const nextNotification = notificationQueue.current.shift();
		setCurrentNotification(nextNotification);

		timeoutRef.current = setTimeout(() => {
			setCurrentNotification(null);
			processQueue();
		}, DISPLAY_DURATION);
	};

	useEffect(() => {
		if (!currentNotification) {
			processQueue();
		}
	}, [currentNotification]);

	return (
		<div className="notification-bar">
			<p>{currentNotification}</p>
		</div>
	);
};

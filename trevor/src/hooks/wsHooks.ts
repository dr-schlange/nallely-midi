import { useEffect, useRef } from "react";
import { useTrevorSelector } from "../store";

let worker: Worker | null = null;
let refCount = 0;

function getWorker(): Worker {
	if (!worker) {
		worker = new Worker(new URL("../workers/scopeWorker.ts", import.meta.url), {
			type: "module",
		});
	}
	refCount++;
	return worker;
}

function releaseWorker() {
	refCount--;
	if (refCount <= 0) {
		worker?.terminate();
		worker = null;
		refCount = 0;
	}
}

export const useScopeWorker = (
	id: string,
	parameters: Record<
		string,
		{ min: number | null; max: number | null; stream?: boolean }
	>,
	kind: string,
	onmessage?: (messages: { on: string; value: number }[]) => void,
	onopen?: () => void,
) => {
	const onmessageRef = useRef(onmessage);
	const onopenRef = useRef(onopen);
	onmessageRef.current = onmessage;
	onopenRef.current = onopen;
	const host = useTrevorSelector((state) => state.general.trevorWebsocketURL);

	useEffect(() => {
		const w = getWorker();
		const scopeId = `${kind}::${id}`;
		const url = `${host.replace(":6788", ":6789")}/${id}/autoconfig`;

		const paramArray = Object.entries(parameters).map(([name, conf]) => {
			const entry: any = { name, range: [conf.min, conf.max] };
			if (conf.stream) entry.stream = true;
			return entry;
		});

		const handleMessage = (event: MessageEvent) => {
			const msg = event.data;
			if (msg.scopeId !== scopeId) return;

			if (msg.type === "data") {
				onmessageRef.current?.(msg.messages);
			} else if (msg.type === "open") {
				onopenRef.current?.();
			}
		};

		w.addEventListener("message", handleMessage);
		w.postMessage({
			type: "connect",
			scopeId,
			url,
			kind,
			parameters: paramArray,
		});

		return () => {
			w.removeEventListener("message", handleMessage);
			w.postMessage({ type: "disconnect", scopeId });
			releaseWorker();
		};
	}, [id, kind, parameters, host]);
};

export const useNallelyRegistration = (
	id: string,
	parameters: any,
	config: any,
	category: string,
	onmessage?: (message: { on: string; value: number }) => void,
	onopen?: () => void,
) => {
	const serviceRef = useRef<any>(null);
	const onmessageRef = useRef(onmessage);
	const onopenRef = useRef(onopen);
	onmessageRef.current = onmessage;
	onopenRef.current = onopen;
	const host = useTrevorSelector((state) => state.general.trevorWebsocketURL);

	useEffect(() => {
		if (serviceRef.current) {
			serviceRef.current?.dispose();
			serviceRef.current = null;
		}
		const service = (window as any).NallelyWebsocketBus.register(
			category,
			id,
			parameters,
			config,
			host.replace(":6788", ":6789"),
		);
		service.onmessage = (msg: any) => onmessageRef.current?.(msg);
		service.onopen = () => onopenRef.current?.();
		serviceRef.current = service;
		return () => {
			serviceRef.current?.dispose();
			serviceRef.current = null;
		};
	}, [id, category, parameters, config, host]);

	return serviceRef.current;
};

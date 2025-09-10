import { useTrevorSelector } from "../../store";
import ForceGraph3D from "react-force-graph-3d";
import {
	buildParameterId,
	buildSectionId,
	connectionId,
	findFirstMissingValue,
} from "../../utils/utils";
import SpriteText from "three-spritetext";
import * as THREE from "three";
import {
	CSS3DRenderer,
	CSS3DObject,
} from "three/addons/renderers/CSS3DRenderer.js";
import { Button } from "../widgets/BaseComponents";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Scope } from "../widgets/Oscilloscope";
import { createPortal } from "react-dom";
import { XYScope } from "../widgets/XYScope";
import { XYZScope } from "../widgets/XYZScope";
import { useTrevorWebSocket } from "../../websockets/websocket";
import { ScalerForm } from "../ScalerForm";
import type {
	MidiConnection,
	MidiDevice,
	MidiDeviceSection,
	MidiParameter,
	VirtualDevice,
	VirtualParameter,
} from "../../model";
import { ParametersForm } from "./ParametersForm";

interface PatchingDevice3DProps {
	onCloseView?: () => void;
}

const WidgetComponents = {
	Scope,
	XYScope,
	XYZScope,
};

const computeLineWidth = (link) => link?.meta?.width;
const computeArrow = (link) => (link?.meta?.arrow ? 20 : 0);
const computeEmitParticle = (link) => (link?.meta?.emitParticles ? 5 : 0);
const buildMidiNodes = (midiDevices) => {
	const nodes = [];
	const links = [];
	for (const midiDevice of midiDevices) {
		nodes.push({
			id: midiDevice.id.toString(),
			name: midiDevice.repr,
			val: 50,
			group: "midiDevice",
		});
		for (const section of midiDevice.meta.sections) {
			const sid = buildSectionId(midiDevice.id, section.name);
			nodes.push({
				id: sid,
				name: section.name,
				val: 25,
				group: "midiDeviceSection",
				meta: {
					object: section,
					device: midiDevice,
					id: sid,
				},
			});
			links.push({
				source: midiDevice.id.toString(),
				target: sid,
				meta: {
					type: "internal",
					width: 5,
				},
			});
			for (const param of section.parameters) {
				const pid = buildParameterId(midiDevice.id, param);
				nodes.push({
					id: pid,
					name: param.name,
					val: 5,
					group: "midiDeviceParameter",
					meta: {
						type: "midiParameter",
					},
				});
				links.push({
					source: sid,
					target: pid,
					meta: {
						type: "internal",
						width: 5,
					},
				});
			}
			if (section.pads_or_keys) {
				nodes.push({
					id: buildParameterId(midiDevice.id, section.pads_or_keys),
					name: section.pads_or_keys.name,
					val: 5,
					group: "midiDeviceKeys",
					meta: {
						type: "midiParameter",
					},
				});
				links.push({
					source: sid,
					target: buildParameterId(midiDevice.id, section.pads_or_keys),
					meta: {
						type: "internal",
						width: 5,
					},
				});
			}
			if (section.pitchwheel) {
				nodes.push({
					id: buildParameterId(midiDevice.id, section.pitchwheel),
					name: section.pitchwheel.name,
					val: 5,
					group: "midiDevicePitchwheel",
					meta: {
						type: "midiParameter",
					},
				});
				links.push({
					source: sid,
					target: buildParameterId(midiDevice.id, section.pitchwheel),
					meta: {
						type: "internal",
						width: 5,
					},
				});
			}
		}
	}
	return { nodes, links };
};

const buildVirtualNodes = (virtualDevices) => {
	const nodes = [];
	const links = [];
	for (const device of virtualDevices) {
		if (device.meta.name === "TrevorBus") {
			continue;
		}
		nodes.push({
			id: device.id.toString(),
			name: device.repr,
			val: 50,
			meta: {
				type: "virtual",
				object: device,
				device,
				id: device.id,
			},
			group: device.meta.name,
		});
		for (const parameter of device.meta.parameters) {
			const pid = buildParameterId(device.id, parameter);
			const isExternalPort = parameter.cv_name.match(/\w+\d+_.*/);
			const external =
				device.meta.name === "WebSocketBus" && isExternalPort
					? "externalParameter"
					: "virtualDeviceParameter";
			nodes.push({
				id: pid,
				name: parameter.cv_name,
				val: 5,
				meta: {
					type: "virtualParameter",
					object: parameter,
					id: isExternalPort
						? parameter.cv_name.replace(/_.*/, "")
						: parameter.cv_name,
				},
				group: external,
			});
			links.push({
				source: device.id.toString(),
				target: pid,
				meta: {
					type: "internal",
					width: 5,
				},
			});
		}
	}

	return { nodes, links };
};

const buildLinks = (connections) => {
	const links = [];
	for (const connection of connections) {
		links.push({
			meta: {
				type: "link",
				object: connection,
				width: 1.5,
				arrow: true,
				emitParticles: true,
				id: connectionId(connection),
			},
			source: buildParameterId(connection.src.device, connection.src.parameter),
			target: buildParameterId(
				connection.dest.device,
				connection.dest.parameter,
			),
		});
	}

	return links;
};

const getWidgetNodes = (data) => {
	return data.nodes?.filter((n) => n.group === "widget") || [];
};

const buildWidgetPortLinks = (widgets, nodes) => {
	const widgetLinks = [];
	for (const w of widgets) {
		const parameters = nodes?.filter(
			(n) => n?.meta?.id === `${w.id}` && n.group === "externalParameter",
		);
		for (const p of parameters) {
			widgetLinks.push({
				source: p.id,
				target: w.id,
				meta: {
					type: "internal-link",
					width: 1,
				},
			});
		}
	}
	return widgetLinks;
};

export const PatchingDevice3D = ({ onCloseView }: PatchingDevice3DProps) => {
	const virtualClasses = useTrevorSelector(
		(state) => state.nallely.classes.virtual,
	);
	const midiClasses = useTrevorSelector((state) => state.nallely.classes.midi);
	const midiDevices = useTrevorSelector((state) => state.nallely.midi_devices);
	const virtualDevices = useTrevorSelector(
		(state) => state.nallely.virtual_devices,
	);
	const connections = useTrevorSelector((state) => state.nallely.connections);
	const [graphData, setGraphData] = useState({
		nodes: [],
		links: [],
	});
	const [mode, setMode] = useState("association");
	const fgRef = useRef(undefined);
	const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
	const cssRenderRef = useRef(new CSS3DRenderer());
	const containerRef = useRef<HTMLDivElement>(null);
	const cssNodesRef = useRef<Map<string, HTMLDivElement>>(new Map());
	const [widgets, setWidgets] = useState<
		{ num: number; id: string; type: string; component: React.FC<any> }[]
	>([]);
	const [settings, setSettings] = useState<
		{
			id: string;
			component: React.FC<any>;
			object: MidiConnection | MidiDeviceSection | VirtualDevice;
			parameters?: VirtualParameter[] | MidiParameter[];
			device?: MidiDevice[] | VirtualDevice[];
			repr?: string;
		}[]
	>([]);
	const [alwaysFaceMe, setAlwaysFaceMe] = useState(false);
	const [displayLabels, setDisplayLabels] = useState(true);
	const [selection, setSelection] = useState<string[]>([]);
	const trevorSocket = useTrevorWebSocket();
	const handleDeviceClassClick = (deviceClass: string) => {
		trevorSocket?.createDevice(deviceClass);
	};

	useEffect(() => {
		const updateSize = () => {
			if (containerRef.current) {
				setDimensions({
					width: containerRef.current.clientWidth,
					height: containerRef.current.clientHeight,
				});
			}
		};

		updateSize(); // initial size
		window.addEventListener("resize", updateSize);

		return () => {
			for (const node of cssNodesRef.current.values()) {
				node.replaceChildren();
			}
			cssNodesRef.current.clear();
			window.removeEventListener("resize", updateSize);
		};
	}, []);

	useEffect(() => {
		cssRenderRef.current.setSize(dimensions.width, dimensions.height);
	}, [dimensions]);

	const closeWidget = (id) => {
		setWidgets((prev) =>
			prev.filter((w) => w.id !== id && w.id.replace("::", "") !== id),
		);
		cssNodesRef.current.delete(id);
		setGraphData((prev) => ({
			nodes: prev.nodes?.filter((n) => n.id !== id) || [],
			links: prev.links?.filter((l) => l.target !== id) || [],
		}));
	};

	const widgetPortals = useMemo(
		() =>
			widgets.map((w) => {
				const container = cssNodesRef.current.get(w.id);
				if (!container) {
					return null;
				}
				return createPortal(
					<w.component id={w.id} num={w.num} onClose={closeWidget} />,
					container,
					w.id,
				);
			}),
		[widgets],
	);

	const settingsPortals = useMemo(
		() =>
			settings.map((s) => {
				const container = cssNodesRef.current.get(s.id);
				if (!container) {
					return null;
				}
				if (s?.parameters) {
					return createPortal(
						<s.component
							device={s.device}
							parameters={s.parameters}
							repr={s.repr}
						/>,
						container,
						s.id,
					);
				} else {
					const connection = connections.find((c) => connectionId(c) === s.id);
					return createPortal(
						<s.component
							id={s.id}
							connection={connection}
							onClose={closeWidget}
						/>,
						container,
						s.id,
					);
				}
			}),
		[settings, connections],
	);

	const addWidget = (Component, widgetType: string) => {
		setWidgets((oldWidgets) => {
			const idsUsed = oldWidgets
				.filter((w) => w.type === widgetType)
				.map((w) => w.num);
			const nextId = findFirstMissingValue(idsUsed);
			const widgetId = `${widgetType}${nextId}`;

			// Create the container for the widget
			if (!cssNodesRef.current.has(widgetId)) {
				const container = document.createElement("div");
				container.style.width = "250px";
				container.style.height = "200px";
				cssNodesRef.current.set(widgetId, container);
			}

			// Add node to graph
			setGraphData((prev) => {
				const widgetLinks = [];
				const parameters = prev.nodes?.filter(
					(n) =>
						n?.meta?.id === `${widgetId}` && n.group === "externalParameter",
				);
				for (const p of parameters) {
					widgetLinks.push({
						source: p.id,
						target: widgetId,
						meta: {
							type: "internal-link",
							width: 1,
						},
					});
				}
				return {
					nodes: [
						...prev.nodes,
						{
							id: widgetId,
							name: widgetType,
							group: "widget",
							meta: { type: widgetType },
						},
					],
					links: [...prev.links, ...widgetLinks],
				};
			});
			return [
				...oldWidgets,
				{
					id: widgetId,
					num: nextId,
					type: widgetType,
					component: Component,
					group: "widget",
				},
			];
		});
	};

	const handleNodeClick = useCallback(
		(node) => {
			if (mode === "navigation") {
				// Aim at node from outside it
				const distance = 80;
				const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);

				fgRef.current.cameraPosition(
					{
						x: node.x * distRatio,
						y: node.y * distRatio,
						z: node.z * distRatio,
					}, // new position
					node, // lookAt ({ x, y, z })
					3000, // ms transition duration
				);
				return;
			}
			// We are in normal association mode
			if (
				node.meta?.type === "midiParameter" ||
				node.meta?.type === "virtualParameter"
			) {
				// We handle the association
				if (selection.length === 0) {
					setSelection([node.id]);
					return;
				} else if (selection.length === 1) {
					if (selection[0] === node.id) {
						setSelection([]);
						return;
					}
					// second selection, create connection if valid
					const srcParam = selection[0];
					const dstParam = node.id;
					const unbind = graphData.links.find(
						(l) => l.source.id === srcParam && l.target.id === dstParam,
					);
					trevorSocket?.associate(srcParam, dstParam, Boolean(unbind));
					setSelection([]);
					return;
				}
			}
			if (node.group === "midiDeviceSection" || node.meta.type === "virtual") {
				const objId = node.meta.id;
				const form = settings.find((s) => s.id === objId);
				if (form) {
					cssNodesRef.current.delete(objId);
					setSettings((prev) => prev.filter((s) => s.id !== objId));
					const obj = fgRef.current.scene().getObjectByName(objId);
					if (obj) {
						fgRef.current.scene().remove(obj);
					}
					return;
				}
				const container = document.createElement("div");
				container.style.width = "250px";
				container.style.height = "300px";
				cssNodesRef.current.set(objId, container);
				setSettings((prev) => [
					...prev,
					{
						id: objId,
						component: ParametersForm,
						object: node.meta.object,
						device: node.meta.device,
						parameters:
							node.meta.type === "virtual"
								? node.meta.object.meta.parameters
								: node.meta.object.parameters,
						repr: node.meta.object.repr || node.meta.object.name,
					},
				]);
				const obj = new CSS3DObject(container);
				obj.scale.set(0.2, 0.2, 0.2);

				obj.position.set(node.x + 30, node.y, node.z);
				obj.name = objId;
				const camera = fgRef.current.camera();
				obj.rotation.copy(camera.rotation);
				fgRef.current.scene().add(obj);
			}
		},
		[mode, selection, settings],
	);

	const handleLinkClick = useCallback(
		(link) => {
			if (link.meta.type !== "link") {
				return;
			}
			const form = settings.find((s) => s.id === link.meta.id);
			if (form) {
				cssNodesRef.current.delete(link.meta.id);
				setSettings((prev) => prev.filter((s) => s.id !== link.meta.id));
				const obj = fgRef.current.scene().getObjectByName(link.meta.id);
				if (obj) {
					fgRef.current.scene().remove(obj);
				}
				return;
			}
			const container = document.createElement("div");
			container.style.width = "250px";
			container.style.height = "200px";
			cssNodesRef.current.set(link.meta.id, container);
			setSettings((prev) => [
				...prev,
				{
					id: link.meta.id,
					component: ScalerForm,
					object: link.meta.object,
				},
			]);
			const obj = new CSS3DObject(container);
			obj.scale.set(0.2, 0.2, 0.2);

			const midX = (link.source.x + link.target.x) / 2;
			const midY = (link.source.y + link.target.y) / 2 - 35;
			const midZ = (link.source.z + link.target.z) / 2;
			obj.position.set(midX, midY, midZ);
			obj.name = link.meta.id;
			const camera = fgRef.current.camera();
			obj.rotation.copy(camera.rotation);
			fgRef.current.scene().add(obj);
		},
		[settings],
	);

	const update3DView = () => {
		const midiNodes = buildMidiNodes(midiDevices);
		const virtualNodes = buildVirtualNodes(virtualDevices);
		const interDeviceLinks = buildLinks(connections);
		const nodes = [...midiNodes.nodes, ...virtualNodes.nodes];
		const links = [
			...midiNodes.links,
			...virtualNodes.links,
			...interDeviceLinks,
		];
		const widgets = getWidgetNodes(graphData);
		const widgetLinks = buildWidgetPortLinks(widgets, nodes);
		setGraphData({
			nodes: [...nodes, ...widgets],
			links: [...links, ...widgetLinks],
		});
	};

	useEffect(() => {
		update3DView();
	}, [midiDevices, virtualDevices, connections, widgets]);

	const handleModeSwitch = () => {
		setMode((prev) => (prev === "navigation" ? "association" : "navigation"));
	};

	return (
		<div
			ref={containerRef}
			style={{
				width: "100vw",
				display: "flex",
				flexDirection: "column",
				height: "100vh",
			}}
		>
			<div>
				<ForceGraph3D
					ref={fgRef}
					graphData={graphData}
					showNavInfo={false}
					linkWidth={computeLineWidth}
					linkDirectionalArrowLength={computeArrow}
					linkDirectionalArrowRelPos={1}
					linkDirectionalParticles={computeEmitParticle}
					linkDirectionalParticleSpeed={0.005}
					linkDirectionalParticleWidth={5}
					nodeAutoColorBy="group"
					onNodeClick={handleNodeClick}
					onLinkClick={handleLinkClick}
					width={dimensions.width}
					height={dimensions.height}
					nodeThreeObjectExtend={(node) => node?.group !== "widget"}
					nodeThreeObject={(node) => {
						if (
							node?.group === "midiDevice" ||
							node?.meta?.type === "virtual"
						) {
							const sprite = new SpriteText(node.name);
							sprite.color = node.color;
							sprite.textHeight = 8;
							sprite.fontFace = "TopazPlusA1200";
							return sprite;
						}
						if (
							node?.meta?.type === "midiParameter" ||
							node?.meta?.type === "virtualParameter"
						) {
							let shape = null;
							if (selection.includes(node.id)) {
								const sphere = new THREE.SphereGeometry(6);
								const material = new THREE.MeshBasicMaterial({
									color: "yellow",
								});
								material.wireframe = true;
								const mesh = new THREE.Mesh(sphere, material);
								shape = mesh;
							}
							if (displayLabels) {
								const sprite = new SpriteText(node.name);
								sprite.color = "white";
								sprite.textHeight = 4;
								sprite.fontFace = "TopazPlusA1200";
								if (shape) {
									shape.add(sprite);
								} else {
									shape = sprite;
								}
							}
							return shape;
						}
						if (node?.group === "widget") {
							const id = node.id;
							const container = cssNodesRef.current.get(id);
							const obj = new CSS3DObject(container);
							obj.name = id;
							obj.scale.set(0.3, 0.3, 0.3);
							const camera = fgRef.current?.camera();
							if (camera) {
								obj.rotation.copy(camera.rotation);
							}
							return obj;
						}
						return false;
					}}
					extraRenderers={[cssRenderRef.current]}
					backgroundColor="rgba(34, 34, 33, 1)"
					linkPositionUpdate={(linkObject, { start, end }, link) => {
						if (!link?.meta?.id) {
							return;
						}
						const scene = fgRef.current.scene();
						const obj = scene.getObjectByName(link.meta.id);
						if (obj) {
							obj.position.set(
								(start.x + end.x) / 2,
								(start.y + end.y) / 2 - 35,
								(start.z + end.z) / 2,
							);
							if (alwaysFaceMe) {
								const camera = fgRef.current?.camera();
								obj.rotation.copy(camera.rotation);
							}
						} else {
							// console.debug("Cannot find object for link", link.meta.id);
						}
					}}
					nodePositionUpdate={(nodeObject, { x, y, z }, node) => {
						if (!alwaysFaceMe) {
							return;
						}
						if (node?.group === "widget") {
							const obj = nodeObject;
							const camera = fgRef.current?.camera();
							if (camera) {
								obj.rotation.copy(camera.rotation);
							}
						} else if (
							node?.group === "midiDeviceSection" ||
							node?.meta?.type === "virtual"
						) {
							const id = node?.meta?.id;
							const scene = fgRef.current.scene();
							const obj = scene.getObjectByName(id);
							if (!obj) {
								return;
							}
							obj.position.set(node.x + 30, node.y, node.z);
							if (alwaysFaceMe) {
								const camera = fgRef.current?.camera();
								obj.rotation.copy(camera.rotation);
							}
						}
					}}
				/>
			</div>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: "10px",
					margin: "10px",
					position: "absolute",
				}}
			>
				<div
					style={{
						height: "26px",
						width: "fit-content",
						display: "flex",
						flexDirection: "row",
						gap: "10px",
					}}
				>
					<Button
						text="X"
						tooltip="Close 3D view"
						variant="big"
						onClick={onCloseView}
					/>
					<Button
						text="N"
						tooltip="Switch to navigation mode"
						variant="big"
						activated={mode === "navigation"}
						onClick={handleModeSwitch}
					/>
					<Button
						text="L"
						tooltip="Display parameter labels"
						variant="big"
						activated={displayLabels}
						onClick={() => setDisplayLabels((prev) => !prev)}
					/>
					<Button
						text="F"
						tooltip="Fit to view"
						variant="big"
						onClick={() => fgRef.current.zoomToFit(500, 0)}
					/>

					<Button
						text="A"
						tooltip="Widgets always face me"
						variant="big"
						activated={alwaysFaceMe}
						onClick={() => {
							setAlwaysFaceMe((prev) => !prev);
						}}
					/>
					<select
						className="flat-select"
						value=""
						title="Adds a MIDI device to the system"
						onChange={(e) => {
							const val = e.target.value;
							if (val) {
								handleDeviceClassClick(val);
							}
						}}
					>
						<option value="">M</option>
						{midiClasses.map((cls) => (
							<option key={cls} value={cls}>
								{cls}
							</option>
						))}
					</select>
					<select
						className="flat-select"
						value={""}
						title="Adds a virtual device to the system"
						onChange={(e) => {
							const val = e.target.value;
							if (val) {
								handleDeviceClassClick(val);
							}
						}}
					>
						<option value={""}>V</option>
						{virtualClasses.map((cls) => (
							<option key={cls} value={cls}>
								{cls}
							</option>
						))}
					</select>
					<select
						className="flat-select"
						value={"wdg"}
						title="Adds a new widget to the system"
						onChange={(e) => {
							const val = e.target.value;
							if (val && WidgetComponents[val]) {
								addWidget(WidgetComponents[val], val.toLocaleLowerCase());
							}
						}}
					>
						<option value={""}>W</option>
						{Object.keys(WidgetComponents).map((name) => (
							<option key={name} value={name}>
								{name}
							</option>
						))}
					</select>
				</div>
				<Button
					text="FS"
					tooltip="Full state"
					variant="big"
					onClick={() => {
						trevorSocket?.pullFullState();
					}}
				/>
			</div>

			{widgetPortals}
			{settingsPortals}
		</div>
	);
};

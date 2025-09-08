import { useTrevorSelector } from "../../store";
import ForceGraph3D from "react-force-graph-3d";
import {
	buildParameterId,
	buildSectionId,
	findFirstMissingValue,
} from "../../utils/utils";
import SpriteText from "three-spritetext";
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

interface PatchingDevice3DProps {
	onCloseView?: () => void;
}

const WidgetComponents = {
	Scope,
	XYScope,
	XYZScope,
};

export const PatchingDevice3D = ({ onCloseView }: PatchingDevice3DProps) => {
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

	const portals = useMemo(
		() =>
			widgets.map((w) => {
				const container = cssNodesRef.current.get(w.id);
				if (!container) {
					return null;
				}
				return createPortal(
					<w.component id={w.id} num={w.num} />,
					container,
					w.id,
				);
			}),
		[widgets],
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
				// container.style.pointerEvents = "auto";
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
				// setTimeout(() => {
				// 	update3DView();
				// }, 1000);
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

	const handleClick = useCallback(
		(node) => {
			if (mode === "navigation") {
				// Aim at node from outside it
				const distance = 40;
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
			} else {
			}
		},
		[fgRef, mode],
	);

	const buildMidiNodes = () => {
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

	const buildVirtualNodes = () => {
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

	const buildLinks = () => {
		const links = [];
		for (const connection of connections) {
			links.push({
				meta: {
					type: "link",
					object: connection,
					width: 1,
					arrow: true,
					emitParticles: true,
				},
				source: buildParameterId(
					connection.src.device,
					connection.src.parameter,
				),
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

	const update3DView = () => {
		const midiNodes = buildMidiNodes();
		const virtualNodes = buildVirtualNodes();
		const interDeviceLinks = buildLinks();
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

	const computeLineWidth = useCallback(
		(link) => link?.meta?.width,
		[midiDevices, virtualDevices, connections],
	);

	const computeArrow = useCallback(
		(link) => (link?.meta?.arrow ? 20 : 0),
		[midiDevices, virtualDevices, connections],
	);

	const computeEmitParticle = useCallback(
		(link) => (link?.meta?.emitParticles ? 5 : 0),
		[midiDevices, virtualDevices, connections],
	);

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
					onNodeClick={handleClick}
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
						if (node?.group === "widget") {
							const id = node.id;
							const container = cssNodesRef.current.get(id);
							const obj = new CSS3DObject(container);
							obj.scale.set(0.5, 0.5, 0.5);
							return obj;
						}
						return false;
					}}
					extraRenderers={[cssRenderRef.current]}
					backgroundColor="rgba(34, 34, 33, 1)"
				/>
			</div>
			<div
				style={{
					height: "26px",
					position: "absolute",
					margin: "10px",
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
				{/* <Button
					text="A"
					tooltip="Add widget"
					variant="big"
					onClick={() =>
						addWidget(
							WidgetComponents.Scope,
							WidgetComponents.Scope.name.toLocaleLowerCase(),
						)
					}
				/> */}
				<select
					className="flat-select"
					value={""}
					title="Adds a new widget to the system"
					onChange={(e) => {
						const val = e.target.value;
						if (val && WidgetComponents[val]) {
							addWidget(WidgetComponents[val], val.toLocaleLowerCase());
						}
					}}
				>
					<option className="flat-option" value={""}>
						--
					</option>
					{Object.keys(WidgetComponents).map((name) => (
						<option className="flat-option" key={name} value={name}>
							{name}
						</option>
					))}
				</select>
			</div>
			{portals}
		</div>
	);
};

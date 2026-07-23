import type { Connection } from "../model";
import { useTrevorSelector } from "../store";
import { buildConnectionName, connectionId } from "../utils/utils";
import { Button } from "./widgets/BaseComponents";

interface ConnectionListProps {
	selectedConnection: string | undefined;
	onConnectionClick: (connection: Connection) => void;
	onDeleteAllConnections: () => void;
}

export const ConnectionList = ({
	selectedConnection,
	onConnectionClick,
	onDeleteAllConnections,
}: ConnectionListProps) => {
	const allConnections = useTrevorSelector(
		(state) => state.nallely.connections,
	);

	return (
		<details>
			<summary>Connections</summary>
			<div className="details-content">
				<div
					className="connection-setup"
					style={{
						height: "150px",
						position: "relative",
						overflowX: "auto",
						width: "100%",
						boxSizing: "border-box",
					}}
				>
					<ul className="connections-list">
						{allConnections.map((connection) => (
							<li
								key={buildConnectionName(connection)}
								onClick={() => onConnectionClick(connection)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										onConnectionClick(connection);
									}
								}}
								onKeyUp={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
									}
								}}
								className={`connection-item ${selectedConnection === connectionId(connection) ? "selected" : ""}`}
							>
								{buildConnectionName(connection)}
							</li>
						))}
					</ul>
				</div>
			</div>
			{allConnections.length > 0 && (
				<Button
					text="Delete all"
					tooltip="Deletes all patchs from the session"
					onClick={onDeleteAllConnections}
					className="menu-button"
					style={{ width: "100%" }}
				/>
			)}
		</details>
	);
};

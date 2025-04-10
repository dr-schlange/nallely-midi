import React, { useEffect, useState, useRef } from "react";
import { RackRow } from "./RackRow";
import PatchingModal from "./PatchingModal";
import InstanceCreation from "./InstanceCreation";

const DevicePatching = () => {
  const mainSectionRef = useRef(null);
  const [numberOfRows, setNumberOfRows] = useState(1);
  const [rackRowHeight, setRackRowHeight] = useState(130); // Default height
  const [rackRows, setRackRows] = useState(Array.from({ length: 1 }, () => []));
  const [associateMode, setAssociateMode] = useState(false);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSectionDetails, setSelectedSectionDetails] = useState<{
    firstSection: { name: string; parameters: string[] } | null;
    secondSection: { name: string; parameters: string[] } | null;
  }>({ firstSection: null, secondSection: null });
  const [connections, setConnections] = useState<{ from: string; to: string }[]>([]); // Store connections

  useEffect(() => {
    const updateRackRows = () => {
      if (mainSectionRef.current) {
        const mainSectionHeight = mainSectionRef.current.offsetHeight;
        const maxRows = Math.floor(mainSectionHeight / 130); // Use default height for calculation
        const adjustedHeight = mainSectionHeight / (maxRows > 0 ? maxRows : 1); // Adjust height to fit
        setNumberOfRows(maxRows > 0 ? maxRows : 0);
        setRackRowHeight(adjustedHeight);
        setRackRows(Array.from({ length: maxRows }, () => [])); // Ensure rackRows is filled with rows
      }
    };

    updateRackRows();

    window.addEventListener("resize", updateRackRows); // Recalculate on window resize
    return () => {
      window.removeEventListener("resize", updateRackRows);
    };
  }, []); // Run only once on mount

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mainSectionRef.current &&
        !mainSectionRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).classList.contains("section-box") &&
        !(event.target as HTMLElement).classList.contains("section-name")
      ) {
        setSelectedSections([]); // Deselect sections when clicking outside or on non-section elements
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const toggleAssociateMode = () => {
    setAssociateMode((prev) => !prev);
    setSelectedSections([]); // Reset selections when toggling mode
  };

  const handleSectionClick = (sectionId: string) => {
    if (!associateMode) return;

    setSelectedSections((prev) => {
      if (prev.includes(sectionId)) {
        // Unselect if already selected
        return prev.filter((id) => id !== sectionId);
      } else if (prev.length < 2) {
        // Add to selection if less than 2 sections are selected
        const newSelection = [...prev, sectionId];
        if (newSelection.length === 2) {
          // Open modal when 2 sections are selected
          const firstSection = {
            name: newSelection[0],
            parameters: ["Param1", "Param2", "Param3"], // Replace with actual parameters
          };
          const secondSection = {
            name: newSelection[1],
            parameters: ["ParamA", "ParamB", "ParamC"], // Replace with actual parameters
          };
          setSelectedSectionDetails({ firstSection, secondSection });
          setIsModalOpen(true);
        }
        return newSelection;
      }
      return prev;
    });
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedSections([]); // Reset selected sections, but keep associate mode active
  };

  const updateConnections = () => {
    const svg = document.querySelector(".device-patching-svg") as SVGSVGElement;
    if (!svg) return;

    svg.innerHTML = ""; // Clear existing lines

    connections.forEach((connection) => {
      const fromElement = document.querySelector(`[data-dp-section-id="${connection.from}"]`);
      const toElement = document.querySelector(`[data-dp-section-id="${connection.to}"]`);

      if (fromElement && toElement) {
        const fromRect = fromElement.getBoundingClientRect();
        const toRect = toElement.getBoundingClientRect();
        const svgRect = svg.getBoundingClientRect();

        const fromX = fromRect.right - svgRect.left; // Right side of the source
        const fromY = fromRect.top + fromRect.height / 2 - svgRect.top; // Center vertically
        const toX = toRect.left - svgRect.left; // Left side of the target
        const toY = toRect.top + toRect.height / 2 - svgRect.top; // Center vertically

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", fromX.toString());
        line.setAttribute("y1", fromY.toString());
        line.setAttribute("x2", toX.toString());
        line.setAttribute("y2", toY.toString());
        line.setAttribute("stroke", "orange");
        line.setAttribute("stroke-width", "2");
        svg.appendChild(line);
      }
    });
  };

  useEffect(() => {
    updateConnections();
  }, [connections, rackRows]); // Update lines when connections or rackRows change

  const handleDeviceDrop = (
    draggedDevice: any,
    targetSlot: number,
    targetRow: number
  ) => {
    setRackRows((prevRackRows) => {
      const updatedRackRows = [...prevRackRows];
      const sourceRow = updatedRackRows[draggedDevice.rowIndex];
      const targetRowDevices = updatedRackRows[targetRow];

      // Remove the dragged device from its original row
      updatedRackRows[draggedDevice.rowIndex] = sourceRow.filter(
        (device: any) => device.slot !== draggedDevice.slot
      );

      if (draggedDevice.rowIndex === targetRow) {
        // Swap devices within the same row
        const targetDevice = targetRowDevices.find(
          (device: any) => device.slot === targetSlot
        );
        if (targetDevice) {
          targetDevice.slot = draggedDevice.slot;
        }
        draggedDevice.slot = targetSlot;
        updatedRackRows[targetRow] = [...targetRowDevices];
      } else {
        // Move the dragged device to the right of the target device in a different row
        draggedDevice.slot = targetRowDevices.length;
        updatedRackRows[targetRow] = [...targetRowDevices, draggedDevice];
      }

      return updatedRackRows;
    });

    updateConnections(); // Update connections after device drop
  };

  const addDeviceToRack = (newDevice: any) => {
    setRackRows((prevRackRows) => {
      const updatedRackRows = [...prevRackRows];
      for (let rowIndex = 0; rowIndex < updatedRackRows.length; rowIndex++) {
        const row = updatedRackRows[rowIndex];
        if (row.length < Math.floor(mainSectionRef.current.offsetWidth / 250)) {
          // Add to the first row with available space
          updatedRackRows[rowIndex] = [...row, { ...newDevice, slot: row.length, rowIndex }];
          return updatedRackRows;
        }
      }
      // If no space is available, add a new row
      updatedRackRows.push([{ ...newDevice, slot: 0, rowIndex: updatedRackRows.length }]);
      return updatedRackRows;
    });
  };

  const handleNonSectionClick = () => {
    setSelectedSections([]); // Deselect sections
  };

  return (
    <div className="device-patching">
      <svg className="device-patching-svg" style={{ position: "absolute", width: "100%", height: "100%", pointerEvents: "none" }}></svg>
      <div className="device-patching-main-section" ref={mainSectionRef}>
        {rackRows.map((_, index) => (
          <RackRow
            key={index}
            height={rackRowHeight}
            rowIndex={index}
            onDeviceDrop={handleDeviceDrop}
            onSectionClick={handleSectionClick}
            onNonSectionClick={handleNonSectionClick}
            selectedSections={selectedSections}
          />
        ))}
      </div>
      <div className="device-patching-side-section">
        <div className="device-patching-top-panel">
          <button
            className={`associate-button ${associateMode ? "active" : ""}`}
            onClick={toggleAssociateMode}
          >
            Associate
          </button>
        </div>
        <div className="device-patching-middle-panel">
          <div className="information-panel">
            <h3>Information</h3>
            {selectedSections.length === 1 ? (
              <p>Details about {selectedSections[0]}</p>
            ) : selectedSections.length === 2 ? (
              <p>Associating {selectedSections[0]} with {selectedSections[1]}</p>
            ) : (
              <p>Select a section to view details or associate sections.</p>
            )}
          </div>
        </div>
        <div className="device-patching-bottom-panel"></div>
      </div>
      {isModalOpen && (
        <PatchingModal
          onClose={closeModal}
          firstSection={selectedSectionDetails.firstSection}
          secondSection={selectedSectionDetails.secondSection}
          onConnectionCreate={(newConnection) => setConnections((prev) => [...prev, newConnection])}
        />
      )}
    </div>
  );
};

export default DevicePatching;

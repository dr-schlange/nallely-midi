import React, { useEffect, useState, useRef } from "react";
import { RackRow } from "./RackRow";
import PatchingModal from "./PatchingModal";

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
        if (prev.length === 1) {
          // If the same section is clicked twice, open the modal with it as both source and target
          const sectionDetails = {
            name: sectionId,
            parameters: ["Param1", "Param2", "Param3"], // Replace with actual parameters
          };
          setSelectedSectionDetails({
            firstSection: sectionDetails,
            secondSection: sectionDetails,
          });
          setIsModalOpen(true);
          return [];
        }
        // Unselect if already selected
        return prev.filter((id) => id !== sectionId);
      } else if (prev.length < 2) {
        // Add to selection if less than 2 sections are selected
        const newSelection = [...prev, sectionId];
        if (newSelection.length === 2) {
          // Fetch parameters for the selected sections
          const firstSection = {
            name: newSelection[0],
            parameters: ["Param1", "Param2", "Param3"], // Replace with actual parameters
          };
          const secondSection = {
            name: newSelection[1],
            parameters: ["ParamA", "ParamB", "ParamC"], // Replace with actual parameters
          };
          setSelectedSectionDetails({ firstSection, secondSection });
          setIsModalOpen(true); // Open modal when 2 sections are selected
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
  };

  const handleNonSectionClick = () => {
    setSelectedSections([]); // Deselect sections
  };

  return (
    <div className="device-patching">
      <div className="device-patching-main-section" ref={mainSectionRef}>
        {rackRows.map((_, index) => (
          <RackRow
            key={index}
            height={rackRowHeight}
            rowIndex={index}
            onDeviceDrop={handleDeviceDrop}
            onSectionClick={handleSectionClick}
            onNonSectionClick={handleNonSectionClick} // Pass deselection handler
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
        <div className="device-patching-middle-panel"></div>
        <div className="device-patching-bottom-panel"></div>
      </div>
      {isModalOpen && (
        <PatchingModal
          onClose={closeModal}
          firstSection={selectedSectionDetails.firstSection}
          secondSection={selectedSectionDetails.secondSection}
        />
      )}
    </div>
  );
};

export default DevicePatching;

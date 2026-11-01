import { createContext, useContext } from "react";

// How much the racks are zoomed (1 = not). The rects the browser reports are in screen pixels
// while the racks lay out in their own, so what mixes both has to know the factor.
export const RackScaleContext = createContext(1);

export const useRackScale = () => useContext(RackScaleContext);

// For what must keep its size on screen inside the zoomed racks (the buttons on top of each
// rack): the inverse zoom, spread in its style. The racks' scale brings it back to normal.
export const useCounterZoom = (): React.CSSProperties => {
	const scale = useRackScale();
	return scale === 1 ? {} : { zoom: 1 / scale };
};

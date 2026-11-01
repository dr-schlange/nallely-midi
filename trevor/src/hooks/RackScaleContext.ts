import { createContext, useContext } from "react";

// How much the racks are zoomed (1 = not). The rects the browser reports are in screen pixels
// while the racks lay out in their own, so what mixes both has to know the factor.
export const RackScaleContext = createContext(1);

export const useRackScale = () => useContext(RackScaleContext);

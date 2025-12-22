import { type ReactNode, useEffect, useState, memo } from "react";
import { createPortal } from "react-dom";

interface PortalProps {
	children: ReactNode;
}

export const Portal = memo(({ children }: PortalProps) => {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);
	if (!mounted) {
		return null;
	}
	return createPortal(children, document.body);
});

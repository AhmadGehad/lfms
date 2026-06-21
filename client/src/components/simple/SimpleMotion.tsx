import { useDesign } from "@/contexts/DesignContext";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef, type ReactNode } from "react";
import { useLocation } from "wouter";

gsap.registerPlugin(useGSAP);

interface SimpleMotionProps {
  children: ReactNode;
}

export function SimpleMotion({ children }: SimpleMotionProps) {
  const scope = useRef<HTMLDivElement>(null);
  const [location] = useLocation();
  const { designVersion } = useDesign();

  useGSAP(
    () => {
      const element = scope.current;
      if (!element) return;

      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      if (designVersion !== "simple" || reducedMotion) {
        gsap.set(element, { clearProps: "all" });
        return;
      }

      gsap.fromTo(
        element,
        { autoAlpha: 0, y: 8 },
        {
          autoAlpha: 1,
          clearProps: "opacity,transform,visibility",
          duration: 0.22,
          ease: "power2.out",
          y: 0,
        }
      );
    },
    {
      dependencies: [designVersion, location],
      revertOnUpdate: true,
      scope,
    }
  );

  return (
    <div ref={scope} className="min-h-full" data-simple-motion>
      {children}
    </div>
  );
}

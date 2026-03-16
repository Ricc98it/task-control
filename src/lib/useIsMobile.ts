"use client";

import { useEffect, useState } from "react";

const NARROW_QUERY = "(max-width: 900px)";
const TOUCH_QUERY = "(max-width: 1100px) and (pointer: coarse)";

function computeIsMobile() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("forceMobile") === "1") return true;

  const narrow = window.matchMedia(NARROW_QUERY).matches;
  const touch = window.matchMedia(TOUCH_QUERY).matches;
  const hoverNone = window.matchMedia("(hover: none)").matches;
  const touchCapable =
    navigator.maxTouchPoints > 0 ||
    "ontouchstart" in window;
  const uaMobile = /iPhone|iPad|iPod|Android|Mobile/i.test(
    navigator.userAgent
  );
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  const longSide = Math.max(window.innerWidth, window.innerHeight);
  const compactTouchScreen = touchCapable && shortSide <= 900 && longSide <= 1400;
  const touchNoHover = touchCapable && hoverNone && shortSide <= 1200;

  return (
    narrow ||
    touch ||
    compactTouchScreen ||
    touchNoHover ||
    (uaMobile && touchCapable)
  );
}

function subscribeMedia(
  media: MediaQueryList,
  handler: () => void
) {
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", handler);
    return () => {
      media.removeEventListener("change", handler);
    };
  }

  media.addListener(handler);
  return () => {
    media.removeListener(handler);
  };
}

export function useIsMobile() {
  // Keep first client render aligned with server render to avoid hydration mismatch.
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const narrowMedia = window.matchMedia(NARROW_QUERY);
    const touchMedia = window.matchMedia(TOUCH_QUERY);
    const update = () => {
      setIsMobile(computeIsMobile());
    };

    update();
    const unsubscribeNarrow = subscribeMedia(narrowMedia, update);
    const unsubscribeTouch = subscribeMedia(touchMedia, update);
    return () => {
      unsubscribeNarrow();
      unsubscribeTouch();
    };
  }, []);

  return isMobile;
}

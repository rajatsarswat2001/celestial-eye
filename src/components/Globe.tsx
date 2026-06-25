"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Viewer, Entity, PointGraphics, LabelGraphics } from "resium";
import * as Cesium from "cesium";

export interface PickedCoordinate {
  lat: number;
  lon: number;
}

interface GlobeProps {
  onPick: (coord: PickedCoordinate) => void;
  picked: PickedCoordinate | null;
  /** Sub-points of tracked satellites, rendered as small blips on the globe surface. */
  satelliteBlips?: { id: string; lat: number; lon: number; isIss: boolean }[];
  issPosition?: { lat: number; lon: number } | null;
}

// Cesium needs to know where to load its workers/assets from at runtime.
// We copy node_modules/cesium/Build/Cesium into public/cesium during setup
// (see README) so this can stay a plain static path.
if (typeof window !== "undefined") {
  (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = "/cesium/";
  // We deliberately avoid Cesium ion (imagery/terrain streaming, geocoding):
  // it requires a personal access token and counts against a free-tier
  // request quota. Clearing the default token avoids the "using Cesium's
  // default ion access token" console warning — our base layer below is
  // CARTO's free, keyless Dark Matter tile set instead.
  Cesium.Ion.defaultAccessToken = "";
}

// CARTO Dark Matter — free, no API key, OSM-derived. Requires the standard
// attribution credit, which we keep visible (restyled, not hidden) in
// globals.css to stay compliant with CARTO/OSM terms.
const darkMatterLayer = new Cesium.ImageryLayer(
  new Cesium.UrlTemplateImageryProvider({
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    subdomains: ["a", "b", "c", "d"],
    maximumLevel: 19,
    credit: new Cesium.Credit(
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
      true
    ),
  })
);

// Tuned for mobile robustness: failIfMajorPerformanceCaveat=false lets
// devices that would otherwise refuse a WebGL context (older/weaker mobile
// GPUs, or a GPU temporarily under memory pressure from other tabs) fall
// back to a lower-tier context instead of failing outright. antialias=false
// and powerPreference="default" reduce the memory/GPU footprint, which is
// the main lever against context loss on phones.
const webglContextOptions: Cesium.ContextOptions = {
  webgl: {
    alpha: false,
    antialias: false,
    powerPreference: "default",
    failIfMajorPerformanceCaveat: false,
    preserveDrawingBuffer: false,
  },
  allowTextureFilterAnisotropic: false,
};

export default function Globe({ onPick, picked, satelliteBlips, issPosition }: GlobeProps) {
  const viewerRef = useRef<{ cesiumElement?: Cesium.Viewer }>(null);
  const [ready, setReady] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  const handleClick = useCallback(
    (movement: { position: Cesium.Cartesian2 }) => {
      const viewer = viewerRef.current?.cesiumElement;
      if (!viewer) return;

      const cartesian = viewer.camera.pickEllipsoid(
        movement.position,
        viewer.scene.globe.ellipsoid
      );
      if (!cartesian) return;

      const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
      const lat = Cesium.Math.toDegrees(cartographic.latitude);
      const lon = Cesium.Math.toDegrees(cartographic.longitude);
      onPick({ lat, lon });
    },
    [onPick]
  );

  useEffect(() => {
    let handler: Cesium.ScreenSpaceEventHandler | undefined;
    let canvas: HTMLCanvasElement | undefined;
    let cancelled = false;

    function onContextLost(e: Event) {
      // WebGL contexts get reclaimed by the OS/browser under memory
      // pressure — common on phones, especially with several tabs open.
      // The default behavior with no listener is for the whole page to
      // hard-crash on mobile Chrome ("This page couldn't load"). Calling
      // preventDefault keeps the page alive long enough to show a real
      // recovery message instead of dying silently.
      e.preventDefault();
      setContextLost(true);
    }

    // resium constructs the underlying Cesium.Viewer inside its own
    // mount-time effects, which normally finish before this parent effect
    // runs (child effects commit before parent effects on the same mount).
    // We still guard with a short poll rather than assuming that ordering
    // holds across every resium/React version, since a silent no-op here
    // (click handler never attached) would be a hard-to-notice bug.
    function trySetup() {
      const viewer = viewerRef.current?.cesiumElement;
      if (!viewer || viewer.isDestroyed()) {
        if (!cancelled) requestAnimationFrame(trySetup);
        return;
      }

      // Void-black backdrop instead of Cesium's default blue sky — this is
      // an instrument console, not a tourist globe. We skip skyBox (depends
      // on Ion-hosted cube map textures we're deliberately not using) and
      // let the scene background carry it instead.
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#05080d");
      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.show = false;
      }
      viewer.scene.globe.showGroundAtmosphere = false;
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#0b1220");
      viewer.scene.fog.enabled = false;

      canvas = viewer.scene.canvas;
      canvas.addEventListener("webglcontextlost", onContextLost, false);

      handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction(handleClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      setReady(true);
    }

    trySetup();

    return () => {
      cancelled = true;
      handler?.destroy();
      canvas?.removeEventListener("webglcontextlost", onContextLost, false);
    };
  }, [handleClick]);

  // requestRenderMode means Cesium won't auto-redraw when our React-driven
  // entity props change (new satellite positions, picked point, etc.) — we
  // have to explicitly ask for a render each time those change.
  useEffect(() => {
    viewerRef.current?.cesiumElement?.scene.requestRender();
  }, [picked, satelliteBlips, issPosition, ready]);

  if (contextLost) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-void">
        <div className="rounded border border-panel-edge bg-panel px-5 py-4 text-center">
          <p className="font-mono text-xs uppercase tracking-wider text-amber">
            Graphics context lost
          </p>
          <p className="mt-2 max-w-xs font-mono text-[11px] text-grey">
            Your device reclaimed graphics memory, often from too many open
            tabs. Close some tabs, then reload.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 rounded bg-cyan-dim px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-cyan"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <Viewer
        ref={viewerRef}
        full
        timeline={false}
        animation={false}
        baseLayerPicker={false}
        homeButton={false}
        sceneModePicker={false}
        navigationHelpButton={false}
        fullscreenButton={false}
        geocoder={false}
        infoBox={false}
        selectionIndicator={false}
        baseLayer={darkMatterLayer}
        skyBox={false}
        contextOptions={webglContextOptions}
        requestRenderMode
        maximumRenderTimeChange={Infinity}
        msaaSamples={1}
      >
        {ready && picked && (
          <Entity position={Cesium.Cartesian3.fromDegrees(picked.lon, picked.lat, 0)}>
            <PointGraphics
              pixelSize={14}
              color={Cesium.Color.fromCssColorString("#27e1c1")}
              outlineColor={Cesium.Color.fromCssColorString("#05080d")}
              outlineWidth={2}
              heightReference={Cesium.HeightReference.CLAMP_TO_GROUND}
              disableDepthTestDistance={Number.POSITIVE_INFINITY}
            />
          </Entity>
        )}

        {ready &&
          satelliteBlips?.map((blip) => (
            <Entity
              key={blip.id}
              position={Cesium.Cartesian3.fromDegrees(blip.lon, blip.lat, 0)}
            >
              <PointGraphics
                pixelSize={blip.isIss ? 9 : 4}
                color={Cesium.Color.fromCssColorString(blip.isIss ? "#ff8a3d" : "#5b6b82")}
                outlineColor={Cesium.Color.fromCssColorString("#05080d")}
                outlineWidth={1}
                disableDepthTestDistance={Number.POSITIVE_INFINITY}
              />
            </Entity>
          ))}

        {ready && issPosition && (
          <Entity position={Cesium.Cartesian3.fromDegrees(issPosition.lon, issPosition.lat, 0)}>
            <PointGraphics
              pixelSize={10}
              color={Cesium.Color.fromCssColorString("#ff8a3d")}
              outlineColor={Cesium.Color.fromCssColorString("#05080d")}
              outlineWidth={2}
              disableDepthTestDistance={Number.POSITIVE_INFINITY}
            />
            <LabelGraphics
              text="ISS"
              font="500 12px IBM Plex Mono, monospace"
              fillColor={Cesium.Color.fromCssColorString("#ff8a3d")}
              pixelOffset={new Cesium.Cartesian2(0, -18)}
              disableDepthTestDistance={Number.POSITIVE_INFINITY}
            />
          </Entity>
        )}
      </Viewer>
    </div>
  );
}

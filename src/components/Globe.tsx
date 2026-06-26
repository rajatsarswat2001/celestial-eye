"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Viewer, Entity, PointGraphics, LabelGraphics, PolylineGraphics } from "resium";
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
  /** ID of the currently selected satellite — gets a halo on the globe */
  selectedId?: string | null;
  /** Orbital trails for satellites */
  satelliteTrails?: { id: string; points: { lat: number; lon: number }[] }[];
}

// Cesium needs to know where to load its workers/assets from at runtime.
if (typeof window !== "undefined") {
  (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = "/cesium/";
  Cesium.Ion.defaultAccessToken = "";
}

// Define a free, high-res realistic satellite imagery base layer (Esri World Imagery)
const earthImageryLayer = new Cesium.ImageryLayer(
  new Cesium.UrlTemplateImageryProvider({
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maximumLevel: 19,
    credit: "Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
  })
);

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

export default function Globe({ onPick, picked, satelliteBlips, issPosition, selectedId, satelliteTrails }: GlobeProps) {
  const viewerRef = useRef<{ cesiumElement?: Cesium.Viewer }>(null);
  const [ready, setReady] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  
  // Track interaction states for the auto-rotation idle loop
  const pickedRef = useRef(picked);
  const selectedIdRef = useRef(selectedId);
  const lastInteractionRef = useRef(Date.now());
  
  useEffect(() => { pickedRef.current = picked; }, [picked]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  const handleClick = useCallback(
    (movement: { position: Cesium.Cartesian2 }) => {
      lastInteractionRef.current = Date.now();
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
    let clockRefCleanup: Cesium.Clock | undefined;
    let tickListenerCleanup: (() => void) | undefined;

    function onContextLost(e: Event) {
      e.preventDefault();
      setContextLost(true);
    }

    function onWindowResize() {
      const viewer = viewerRef.current?.cesiumElement;
      if (!viewer || viewer.isDestroyed()) return;
      viewer.resize();
      viewer.scene.requestRender();
    }
    window.addEventListener("resize", onWindowResize);

    function trySetup() {
      const viewer = viewerRef.current?.cesiumElement;
      if (!viewer || viewer.isDestroyed()) {
        if (!cancelled) requestAnimationFrame(trySetup);
        return;
      }
      const activeViewer: Cesium.Viewer = viewer;

      // Removed custom dark background colors to allow SkyBox and default atmosphere to render
      viewer.scene.fog.enabled = false;
      viewer.scene.globe.enableLighting = true;
      viewer.clock.shouldAnimate = true;

      function frameGlobe() {
        if (activeViewer.isDestroyed()) return;
        activeViewer.resize();
        activeViewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(0, 10, 25_000_000),
        });
        activeViewer.scene.requestRender();
      }

      frameGlobe();
      requestAnimationFrame(frameGlobe);
      requestAnimationFrame(() => requestAnimationFrame(frameGlobe));

      canvas = viewer.scene.canvas;
      canvas.addEventListener("webglcontextlost", onContextLost, false);

      const markInteraction = () => { lastInteractionRef.current = Date.now(); };
      handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction(handleClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      handler.setInputAction(markInteraction, Cesium.ScreenSpaceEventType.LEFT_DOWN);
      handler.setInputAction(markInteraction, Cesium.ScreenSpaceEventType.RIGHT_DOWN);
      handler.setInputAction(markInteraction, Cesium.ScreenSpaceEventType.MIDDLE_DOWN);
      handler.setInputAction(markInteraction, Cesium.ScreenSpaceEventType.WHEEL);
      handler.setInputAction(markInteraction, Cesium.ScreenSpaceEventType.PINCH_START);

      const tickListener = () => {
        if (!pickedRef.current && !selectedIdRef.current) {
          const idleTime = Date.now() - lastInteractionRef.current;
          if (idleTime > 5000) {
            viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.0005);
            viewer.scene.requestRender();
          }
        }
      };
      viewer.clock.onTick.addEventListener(tickListener);
      clockRefCleanup = viewer.clock;
      tickListenerCleanup = tickListener;

      setReady(true);
    }

    trySetup();

    return () => {
      cancelled = true;
      handler?.destroy();
      canvas?.removeEventListener("webglcontextlost", onContextLost, false);
      window.removeEventListener("resize", onWindowResize);
      if (clockRefCleanup && tickListenerCleanup) {
         clockRefCleanup.onTick.removeEventListener(tickListenerCleanup);
      }
    };
  }, [handleClick]);

  useEffect(() => {
    viewerRef.current?.cesiumElement?.scene.requestRender();
  }, [picked, satelliteBlips, issPosition, ready, selectedId]);

  if (contextLost) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-void-deep">
        <div className="glass-card rounded p-5 text-center max-w-xs">
          <p className="font-mono text-xs uppercase tracking-wider text-amber">
            Graphics context lost
          </p>
          <p className="mt-2 font-mono text-[11px] text-grey">
            Your device reclaimed graphics memory. Close some tabs, then reload.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 rounded bg-cyan-dim px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-cyan hover:bg-cyan hover:text-void-deep transition-colors"
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
        baseLayer={earthImageryLayer}
        contextOptions={webglContextOptions}
        requestRenderMode
        maximumRenderTimeChange={Infinity}
        msaaSamples={1}
      >
        {/* Observer pin */}
        {ready && picked && (
          <Entity position={Cesium.Cartesian3.fromDegrees(picked.lon, picked.lat, 0)}>
            <PointGraphics
              pixelSize={12}
              color={Cesium.Color.fromCssColorString("#27e1c1")}
              outlineColor={Cesium.Color.fromCssColorString("#020408")}
              outlineWidth={2}
              heightReference={Cesium.HeightReference.CLAMP_TO_GROUND}
              disableDepthTestDistance={Number.POSITIVE_INFINITY}
            />
          </Entity>
        )}

        {/* Satellite sub-point blips */}
        {ready &&
          satelliteBlips?.map((blip) => {
            const isSelected = blip.id === selectedId;
            const color = blip.isIss
              ? "#ff8a3d"
              : isSelected
                ? "#27e1c1"
                : "#3d5a7a";
            return (
              <Entity
                key={blip.id}
                position={Cesium.Cartesian3.fromDegrees(blip.lon, blip.lat, 0)}
              >
                <PointGraphics
                  pixelSize={blip.isIss ? 9 : isSelected ? 16 : 4}
                  color={Cesium.Color.fromCssColorString(color)}
                  outlineColor={Cesium.Color.fromCssColorString(
                    isSelected ? "#27e1c1" : "#020408"
                  )}
                  outlineWidth={isSelected ? 4 : 1}
                  disableDepthTestDistance={Number.POSITIVE_INFINITY}
                />
                {isSelected && (
                  <LabelGraphics
                    text="TARGET LOCKED"
                    font="bold 10px monospace"
                    fillColor={Cesium.Color.fromCssColorString("#27e1c1")}
                    pixelOffset={new Cesium.Cartesian2(0, -20)}
                    disableDepthTestDistance={Number.POSITIVE_INFINITY}
                  />
                )}
              </Entity>
            );
          })}

        {/* ISS real-time position */}
        {ready && issPosition && (
          <Entity position={Cesium.Cartesian3.fromDegrees(issPosition.lon, issPosition.lat, 0)}>
            <PointGraphics
              pixelSize={11}
              color={Cesium.Color.fromCssColorString("#ff8a3d")}
              outlineColor={Cesium.Color.fromCssColorString("#020408")}
              outlineWidth={2}
              disableDepthTestDistance={Number.POSITIVE_INFINITY}
            />
            <LabelGraphics
              text="ISS"
              font="500 11px IBM Plex Mono, monospace"
              fillColor={Cesium.Color.fromCssColorString("#ff8a3d")}
              outlineColor={Cesium.Color.fromCssColorString("#020408")}
              outlineWidth={2}
              pixelOffset={new Cesium.Cartesian2(0, -18)}
              disableDepthTestDistance={Number.POSITIVE_INFINITY}
            />
          </Entity>
        )}
        {satelliteTrails &&
        satelliteTrails.map((trail) => {
          const positions = Cesium.Cartesian3.fromDegreesArray(
            trail.points.flatMap((p) => [p.lon, p.lat])
          );
          return (
            <Entity key={`trail-${trail.id}`}>
              <PolylineGraphics
                positions={positions}
                width={trail.id === "iss" ? 2 : 1.5}
                material={
                  new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.1,
                    taperPower: 0.5,
                    color: Cesium.Color.fromCssColorString(
                      trail.id === "iss" ? "#ff8a3d" : "#27e1c1"
                    ).withAlpha(0.5),
                  })
                }
              />
            </Entity>
          );
        })}
    </Viewer>
    </div>
  );
}

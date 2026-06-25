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

export default function Globe({ onPick, picked, satelliteBlips, issPosition }: GlobeProps) {
  const viewerRef = useRef<{ cesiumElement?: Cesium.Viewer }>(null);
  const [ready, setReady] = useState(false);

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
    let cancelled = false;

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

      handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction(handleClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      setReady(true);
    }

    trySetup();

    return () => {
      cancelled = true;
      handler?.destroy();
    };
  }, [handleClick]);

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

/**
 * @fileoverview Initializing logic expanding base Leaflet library functionalities.
 * @package
 */

/** Default map zoom level at load without valid sensor parameters. */
const FALLBACK_VIEW_LEVEL = 3;

/** Leaflet map object used as map substrate for the current web app instance. */
var mapObj = null;

/** Pre-initialized settings defining the home. */
var home = { origin: new L.latLng(0, 0), bounds: undefined };

/** Wires zoom in event with its effecting logic. */
window.zoomIn = () =>
    mapObj.zoomIn(mapObj.options.zoomDelta);

/** Wires zoom out event with its effecting logic. */
window.zoomOut = () =>
    mapObj.zoomOut(mapObj.options.zoomDelta);

/** Wires West pan event with its effecting logic. */
window.panLeft = () =>
    mapObj.panBy([-mapObj.options.keyboardPanDelta, 0]);

/** Wires East pan event with its effecting logic. */
window.panRight = () =>
    mapObj.panBy([+mapObj.options.keyboardPanDelta, 0]);

/** Wires North pan event with its effecting logic. */
window.panUp = () =>
    mapObj.panBy([0, -mapObj.options.keyboardPanDelta]);

/** Wires South pan event with its effecting logic. */
window.panDown = () =>
    mapObj.panBy([0, +mapObj.options.keyboardPanDelta]);

/** Wires the reset to home event with its effecting logic. */
window.goToHome = () => {
    if (home.bounds)
        mapObj.fitBounds(home.bounds);
    else
        mapObj.setView(home.origin, FALLBACK_VIEW_LEVEL);
}

/**
 * Initializes the Leaflet map substrate.
 */
function initialize() {
    mapObj = L.map('map-id', {
        pane: 'mapView',
        zoomControl: false,
        preferCanvas: true,
    });

    L.DomUtil.addClass(mapObj._container, 'crosshair-cursor-enabled');

    if (home.bounds)
        mapObj.fitBounds(home.bounds);
    else
        mapObj.setView(home.origin, FALLBACK_VIEW_LEVEL);

    document.getElementById('latitudeView').textContent = getLatitudeView(origin[0]);
    document.getElementById('longitudeView').textContent = getLongitudeView(origin[1]);

    mapObj.on('mousemove', (e) => {
        document.getElementById('latitudeView').textContent = getLatitudeView(e.latlng.lat);
        document.getElementById('longitudeView').textContent = getLongitudeView(e.latlng.lng);
    });
}

/**
 * Set the location that the camera should return as its defined home.
 * @param {number[]} origin - Comma-separated home Latitude and Longitude values. [decimal degrees]
 * @param {number} range - Home sensor range. [meters]
 */
function setCameraDefault(origin, range) {
    home.origin = new L.latLng(origin[0], origin[1]);
    if (range && (range != 'NaN')) {
        home.bounds = home.origin.toBounds(range * 2);
        mapObj.fitBounds(home.bounds);
    }
}

/**
 * Trigger a complete redraw of layers applied to the Leaflet substrate by re-setting the active view at the current map coordinates.
 */
function redraw() {
    mapObj.setView(mapObj.getCenter());
}

/**
 * Formats a Latitude value to a display string (for potential migration to lib/client)
 * @param {number} latitude - Latitude value (decimal degrees).
 */
function getLatitudeView(latitude) {
    return `${Math.abs(latitude).toFixed(6).padStart(9, '0')}° ${(latitude >= 0 ? "N" : "S")}`;
}

/**
 * Formats a Longitude value to a display string (for potential migration to lib/client)
 * @param {number} longitude - Longitude value. [decimal degrees]
 */
function getLongitudeView(longitude) {
    return `${Math.abs(longitude).toFixed(6).padStart(10, '0')}° ${(longitude >= 0 ? "E" : "W")}`;
}

export * as heatMap from "./components/heat-map.js";
export * as measureLine from "./components/measure-line.js";
export * as plots from "./components/plots.js";
export * as rosette from './components/rosette.js';
export * as strobes from "./components/strobes.js";
export * as tiles from "./components/tiles.js";
export * as tracks from "./components/tracks.js";

export {
    mapObj as obj,
    initialize,
    redraw,
    setCameraDefault,
};
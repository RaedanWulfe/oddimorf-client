/**
 * @fileoverview Primary logic of the rosette functionalities as available for instancing from client.
 * @package
 */

import * as util from "Modules/leaflet-geometryutil/src/leaflet.geometryutil.js";

/** Rosette DOM element postfix for the major range ring/azimuth marker lines. */
const MAJOR_LINE_PANE_NAME = 'majorLineViews';

/** Rosette DOM element postfix for the minor range ring/azimuth marker lines. */
const MINOR_LINE_PANE_NAME = 'minorLineViews';

/** Rosette DOM element postfix for the trivial range ring/azimuth marker lines. */
const TRIVIAL_LINE_PANE_NAME = 'trivialLineViews';

/** Rosette DOM element postfix for range ring/azimuth marker labels. */
const LABEL_PANE_NAME = 'labelViews';

/** Collection of rosette visual elements. */
var views = {};

/** Range ring line elements valid to the currently defined active sensor. */
var activeRangeRings = [];

/** Azimuth marker line elements valid to the currently defined active sensor. */
var activeAzimuthLines = [];

/**
 * Initialize a new layer for rosette to a home sensor.
 * @param {Object} map - Leaflet map object active to the current client instance.
 * @param {string} layerId - ID of the layer serving as the active map container for a full rosette collection.
 * @param {number[]} origin - Comma-separated sensor Latitude and Longitude values. [decimal degrees]
 * @param {number} range - Sensor radius specifying the outer range ring distance. [meters]
 * @param {number} opacityLevel - Level of the opacity to apply to the initialized element. [0,1,2]
 * @param {Boolean} isVisible - True if map layer should be visible on map, False otherwise.
 */
function initialize(map, layerId, origin, range, opacityLevel, isVisible) {
    if (!(layerId in views)) {
        views[layerId] = { isVisible: true, panes: [] };

        views[layerId].panes.push(map.createPane(`${layerId}.${MAJOR_LINE_PANE_NAME}`));
        views[layerId].panes.push(map.createPane(`${layerId}.${MINOR_LINE_PANE_NAME}`));
        views[layerId].panes.push(map.createPane(`${layerId}.${TRIVIAL_LINE_PANE_NAME}`));
        views[layerId].panes.push(map.createPane(`${layerId}.${LABEL_PANE_NAME}`));
    }

    setOpacity(layerId, opacityLevel);
    setIsVisible(layerId, isVisible);

    clear(map);

    if ((range <= 0) ||
        (range == 'NaN') ||
        (origin[0] == 'NaN') ||
        (origin[1] == 'NaN'))
        return;

    let jsonOrigin = { lat: origin[0], lng: origin[1] };
    let FullKmLineCount = range * 0.001;
    let HalfKmLineCount = (2 * FullKmLineCount) - 1;

    // Draw thick range rings on each km from origin
    for (let i = 1; i <= FullKmLineCount; i++) {
        let range = i * 1_000;
        activeRangeRings.push(L.circle(origin, range, majorLineOptions(layerId)));
        activeRangeRings[activeRangeRings.length - 1].addTo(map);
        for (let j = 0; j < 4; j++)
            L.marker(util.destination(jsonOrigin, j * 90, range), labelOptions(layerId, `${Math.round(range * 0.001)}`)).addTo(map);
    }

    // Draw thin range rings on each 500m from origin
    for (let i = 1; i <= HalfKmLineCount; i += 2) {
        activeRangeRings.push(L.circle(origin, 500 * i, minorLineOptions(layerId)));
        activeRangeRings[activeRangeRings.length - 1].addTo(map);
    }

    // Draw thin range rings up to 3000m / coverage range from origin (whichever is smaller)
    for (let i = 1; i < (Math.min(3000, range) / 100); i++) {
        let drawRange = 100 * i;
        if (drawRange % 500 != 0) {
            activeRangeRings.push(L.circle(origin, drawRange, trivialLineOptions(layerId)));
            activeRangeRings[activeRangeRings.length - 1].addTo(map);
        }
    }

    // Draw thick azimuth line on cardinal directions
    for (let i = 0; i < 4; i++) {
        let azimuth = i * 90;
        activeAzimuthLines.push(L.polyline([origin, util.destination(jsonOrigin, azimuth, range)], majorLineOptions(layerId)))
        activeAzimuthLines[activeAzimuthLines.length - 1].addTo(map);
        L.marker(util.destination(jsonOrigin, azimuth, range * 1.06), labelOptions(layerId, `${Math.round(azimuth)}`)).addTo(map);
    }

    let drawMinorLinesOnAzimuth = 30;

    // Draw thin azimuth line at 30 degree intervals between the cardinal directions
    for (let i = 0; i < (360 / drawMinorLinesOnAzimuth); i++) {
        let drawAzimuth = i * drawMinorLinesOnAzimuth
        if (drawAzimuth % 90 != 0) {
            activeAzimuthLines.push(L.polyline([origin, util.destination(jsonOrigin, drawAzimuth, range)], minorLineOptions(layerId)));
            activeAzimuthLines[activeAzimuthLines.length - 1].addTo(map);
            L.marker(util.destination(jsonOrigin, drawAzimuth, range * 1.04), labelOptions(layerId, `${Math.round(drawAzimuth)}`)).addTo(map);
        }
    }
}

/**
 * Clear all active rosette elements to the client.
 * @param {Object} map - Leaflet map object active to the current client instance.
 */
function clear(map) {
    for (let i = 0; i < activeRangeRings.length; i++)
        map.removeLayer(activeRangeRings[i]);

    for (let i = 0; i < activeAzimuthLines.length; i++)
        map.removeLayer(activeAzimuthLines[i]);
}

/**
 * Set the visibility of the pre-registered map layer as indicated.
 * @param {string} layerId - ID of the layer serving as the active map container for a full rosette collection.
 * @param {Boolean} isVisible - True if map layer should be visible on map, False otherwise.
 */
function setIsVisible(layerId, isVisible) {
    views[layerId].isVisible = isVisible;
    for (let i = 0; i < views[layerId].panes.length; i++)
        views[layerId].panes[i].style.display = isVisible ? '' : 'none';
}

/**
 * Set the opacity of the pre-registered map layer according to the indicated level.
 * @param {string} layerId - ID of the layer serving as the active map container for a full rosette collection.
 * @param {number} opacityLevel - Level of the opacity to apply to the indicated element. [0,1,2]
 */
function setOpacity(layerId, opacityLevel) {
    views[layerId].opacity = opacityLevel;
    for (let i = 0; i < views[layerId].panes.length; i++)
        views[layerId].panes[i].style.opacity = (1 + opacityLevel) * 0.33;
}

/**
 * Create an object with the keyed pane parameter values for the new rosette label map layer.
 * @param {string} layerId - ID of the layer serving as the active map container for a full rosette collection.
 * @param {string} text - Label text value for a particular range/azimuth for display on the map.
 * @returns Object specifying the layer defaults.
 */
function labelOptions(layerId, text) {
    return {
        interactive: false,
        pane: `${layerId}.${LABEL_PANE_NAME}`,
        icon: L.divIcon({
            iconSize: [44, 20],
            iconAnchor: [22, 10],
            className: 'map-symbol-rosette-text',
            html: `<label>${text}</label>`,
            interactive: false
        })
    }
}

/**
 * Create an object with the keyed pane parameter values for the new major line map layer.
 * @param {string} layerId - ID of the layer serving as the active map container for a full rosette collection.
 * @returns Object specifying the layer defaults.
 */
function majorLineOptions(layerId) {
    return {
        pane: `${layerId}.${MAJOR_LINE_PANE_NAME}`,
        weight: 2,
        color: '#327F7FFF',
        opacity: 0.15,
        fillColor: '#000000',
        fillOpacity: 0,
        // className: 'major-rosette-line-style',
        interactive: false
    }
}

/**
 * Create an object with the keyed pane parameter values for the new minor line map layer.
 * @param {string} layerId - ID of the layer serving as the active map container for a full rosette collection.
 * @returns Object specifying the layer defaults.
 */
function minorLineOptions(layerId) {
    return {
        pane: `${layerId}.${MINOR_LINE_PANE_NAME}`,
        weight: 1,
        color: '#327F7FFF',
        opacity: 0.15,
        fillColor: '#000000',
        fillOpacity: 0,
        // className: 'minor-rosette-line-style',
        interactive: false
    }
}

/**
 * Create an object with the keyed pane parameter values for the new trivial line map layer.
 * @param {string} layerId - ID of the layer serving as the active map container for a full rosette collection.
 * @returns Object specifying the layer defaults.
 */
function trivialLineOptions(layerId) {
    return {
        pane: `${layerId}.${TRIVIAL_LINE_PANE_NAME}`,
        weight: 1,
        color: '#327F7FFF',
        opacity: 0.1,
        fillColor: '#000000',
        fillOpacity: 0,
        // className: 'trivial-rosette-line-style',
        interactive: false
    }
}

export {
    initialize,
    setIsVisible,
    setOpacity,
}
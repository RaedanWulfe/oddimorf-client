/**
 * @fileoverview Primary logic of the plot functionalities as available for instancing from client.
 * @package
 */

import * as gen from "Scripts/my-general.js";
import * as util from "Modules/leaflet-geometryutil/src/leaflet.geometryutil.js";

/** Polling interval for plot count update and pruning of old plots [milliseconds]. */
const REFRESH_INTERVAL = 1_000;

/** Number of layers to show from previous scans, presenting the plot history. */
const SCAN_LAYER_HISTORY = 6;

/** DOM element postfix for a plot layer. */
const PLOT_PANE_NAME = 'plotViews';

/** Collection of plot visual layer elements. */
var views = {};

/** Constant promise to serve as async sleep. */
const sleep = interval => new Promise(r => setTimeout(r, interval));

/** Registers local polled action with defined polling interval. */
const poll = (action, interval) => action()
    .then(sleep(interval)
        .then(() => poll(action, interval)));

/**
 * Initialize a new layer for plots from a specified source.
 * @param {Object} map - Leaflet map object active to the current client instance.
 * @param {string} layerId - ID of the layer serving as the active map container for a plot type collection.
 * @param {number[]} origin - Comma-separated sensor Latitude and Longitude values (decimal degrees)
 * @param {string} msg - Type initialization map defining the associate format of individual data records.
 * @param {number} opacityLevel - Level of the opacity to apply to the initialized element. [0,1,2]
 * @param {Boolean} isVisible - True if map layer should be visible on map, False otherwise.
 */
function initialize(map, layerId, origin, msg, opacityLevel, isVisible) {
    let paneId = `${layerId}.${PLOT_PANE_NAME}`;
    views[layerId] = {
        isVisible: isVisible,
        type: gen.PlacementType.LAT_LNG,
        origin: { lat: origin[0], lng: origin[1] },
        classifications: msg.classifications,
        currentLayer: 0,
        indices: [],
        panes: [],
        active: [],
        counts: [],
        lastCounts: [],
        scanPeriod: Math.round(gen.getMillisecondsFrom(msg.refreshPeriod) * 0.001, 0)
    };
    views[layerId].panes.push(map.createPane(paneId));

    map.getPane(paneId).style.pointerEvents = 'none';

    let headers = msg.header.split(',');

    views[layerId].indices = [
        headers.findIndex(h => h.startsWith('Type')),
        headers.findIndex(h => h.startsWith('Latitude')),
        headers.findIndex(h => h.startsWith('Longitude')),
        headers.findIndex(h => h.startsWith('Origin_Latitude')),
        headers.findIndex(h => h.startsWith('Origin_Longitude')),
        headers.findIndex(h => h.startsWith('Range')),
        headers.findIndex(h => h.startsWith('Azimuth')),
    ];

    if ((views[layerId].indices[1] < 0) &&
        (views[layerId].indices[2] < 0)) {
        views[layerId].type = ((views[layerId].indices[3] < 0) && (views[layerId].indices[4] < 0))
            ? gen.PlacementType.RANGE_AZ_FROM_SELF
            : gen.PlacementType.RANGE_AZ;
    }

    setOpacity(layerId, opacityLevel);
    setIsVisible(layerId, isVisible);

    for (let i = 0; i < SCAN_LAYER_HISTORY; i++) {
        views[layerId].active.push([]);
        for (let j = 0; j < views[layerId].classifications.length; j++) {
            views[layerId].active[i].push({ data: [], layer: L.heatLayer([], options(layerId, gen.Palettes[views[layerId].classifications[j].paletteIndex])) });
            map.addLayer(views[layerId].active[i][j].layer);
        }
    }

    let pruneInterval = gen.getMillisecondsFrom(msg.refreshPeriod);
    let lastRefresh = Date.now();
    let lastPrune = lastRefresh;

    poll(() => new Promise(() => {
        lastRefresh = Date.now();
        refresh(layerId);
        if (lastRefresh - lastPrune >= pruneInterval) {
            lastPrune = lastRefresh;
            clear(layerId);
        }
    }), REFRESH_INTERVAL);
}

/**
 * Enqueue a collection of plots from an incoming collection of packed records for interpretation and addition.
 * @param {string} layerId - ID of the layer serving as the active map container for a plot type collection.
 * @param {string} packet - Payload containing the packed collection of plot records for interpretation.
 */
function enqueue(layerId, packet) {
    if (!(layerId in views) || !packet)
        return;
    let msg = String(packet).split(',');
    add(layerId,
        views[layerId].type == gen.PlacementType.LAT_LNG
            ? [msg[views[layerId].indices[1]], msg[views[layerId].indices[2]]]
            : util.destination(views[layerId].origin, views[layerId].indices[3], views[layerId].indices[4]),
        msg[views[layerId].indices[0]]);
}

/**
 * Add a new plot to the indicated map layer at the indicated location.
 * @param {string} layerId - ID of the layer serving as the active map container for a plot type collection.
 * @param {Object} location - Formatted latLng object defining the plot location.
 * @param {string} type - Plot type from the initially defined range of valid values.
 */
function add(layerId, location, type) {
    views[layerId].active[views[layerId].currentLayer][type].data.push(location);
}

/**
 * Clear all elements under the indicated plot layer.
 * @param {string} layerId - ID of the layer serving as the active map container for a plot type collection.
 */
function clear(layerId) {
    views[layerId].currentLayer = views[layerId].currentLayer < SCAN_LAYER_HISTORY - 1 ? views[layerId].currentLayer + 1 : 0;
    for (let i = 0; i < views[layerId].classifications.length; i++)
        views[layerId].active[views[layerId].currentLayer][i].data = [];
}

/**
 * Traverse through all plots on the indicated layer, then set the plot layer intensities as appropriate by age, clearing the oldest layer and moving it to the top as the new active layer (ensures that new plots always appear over older plots).
 * @param {string} layerId - ID of the layer serving as the active map container for a plot type collection.
 */
function refresh(layerId) {
    let activeCounts = [];
    for (let i = 0; i < views[layerId].classifications.length; i++) {
        let data = views[layerId].active[views[layerId].currentLayer][i].data;
        activeCounts.push(data.length);
        views[layerId].active[views[layerId].currentLayer][i].layer.setLatLngs(data);
    }

    let countElement = document.getElementById(`${layerId}.LayerToggle.Default.count-label-content`);
    if (!countElement)
        return;

    if (views[layerId].counts.length >= views[layerId].scanPeriod)
        views[layerId].counts.shift();

    let newCounts = []
    let prevLayer = views[layerId].currentLayer > 0
        ? views[layerId].currentLayer - 1
        : SCAN_LAYER_HISTORY - 1;

    for (let i = 0; i < views[layerId].classifications.length; i++) {
        newCounts.push(views[layerId].lastCounts[i] <= activeCounts[i]
            ? activeCounts[i] - views[layerId].lastCounts[i]
            : views[layerId].active[prevLayer][i].data.length + activeCounts[i] - views[layerId].lastCounts[i]);
        views[layerId].lastCounts[i] = activeCounts[i];
    }

    views[layerId].counts.push(newCounts);
    let totals = [];
    for (let i = 0; i < views[layerId].classifications.length; i++) {
        let count = views[layerId].counts.reduce((prev, next) => prev + next[i], 0);
        totals.push(isNaN(count) ? activeCounts[i] : count);
    }
    countElement.innerHTML = totals.reduce((prev, next) => prev + next);
}

/**
 * Set the visibility of the pre-registered map layer as indicated.
 * @param {string} layerId - ID of the layer serving as the active map container for a plot type collection.
 * @param {Boolean} isVisible - True if map layer should be visible on map, False otherwise.
 */
function setIsVisible(layerId, isVisible) {
    views[layerId].isVisible = isVisible;
    for (let i = 0; i < views[layerId].panes.length; i++)
        views[layerId].panes[i].style.display = isVisible ? '' : 'none';
}

/**
 * Set the opacity of the pre-registered map layer according to the indicated level.
 * @param {string} layerId - ID of the layer serving as the active map container for a plot type collection.
 * @param {number} opacityLevel - Level of the opacity to apply to the indicated element. [0,1,2]
 */
function setOpacity(layerId, opacityLevel) {
    views[layerId].opacity = opacityLevel;
    let opacity = (1 + opacityLevel) * 0.33;
    for (let i = 0; i < views[layerId].panes.length; i++)
        views[layerId].panes[i].style.opacity = opacity;
}

/**
 * Create an object with the keyed pane parameter values for the new map layer.
 * @param {string} layerId - ID of the layer serving as the active map container for a plot type collection.
 * @param {string} colour - Colour hex value for the plot layer.
 * @returns Object specifying the layer defaults.
 */
function options(layerId, colour) {
    return {
        pane: `${layerId}.${PLOT_PANE_NAME}`,
        radius: 3.0,
        blur: 2.0,
        max: 10,
        maxZoom: 1,
        minOpacity: 1,
        gradient: { 0.0: '#0C0C0C', 0.9: colour }
    }
}

export {
    initialize,
    enqueue,
    setIsVisible,
    setOpacity,
}
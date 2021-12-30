/**
 * @fileoverview Primary logic of the heat-map functionalities as available for instancing from client.
 * @package
 */

import * as gen from "Scripts/my-general.js";
import * as util from "Modules/leaflet-geometryutil/src/leaflet.geometryutil.js";

/** Polling interval for refreshing of active heat-map layers. [milliseconds] */
const REFRESH_INTERVAL = 1_000;

/** Number of layers that a heat-map should show from previous scans (blends layers for history and reduces impression of a on/off flashing layers). */
const SCAN_HISTORY = 1;

/** DOM element postfix for a heat-map layer. */
const HEAT_MAP_PANE_NAME = 'heatMapMarkerView';

/** Generated from Cube-Helix formulations with (http://davidjohnstone.net/pages/cubehelix-gradient-picker). */
const Palettes = {
    VIRIDIS    : { 0.0: '#241512', 0.2: '#462041', 0.4: '#404788', 0.6: '#21928A', 0.8: '#5FC54F', 1.0: '#EAC87D' },
    MAGMA      : { 0.0: '#000000', 0.2: '#1F101B', 0.4: '#65283F', 0.6: '#B75352', 0.8: '#E99C6B', 1.0: '#FAF3FF' },
    CUBE_HELIX : { 0.0: '#000000', 0.2: '#0D140D', 0.4: '#273956', 0.6: '#AD4977', 0.8: '#A9C25A', 1.0: '#FFFFFF' },
    SPECTRAL   : { 0.0: '#9E0142', 0.2: '#F46D43', 0.4: '#FEE08B', 0.6: '#E6F598', 0.8: '#66C2A5', 1.0: '#5E4FA2' },
    OCEAN      : { 0.0: '#0C030B', 0.2: '#1E153C', 0.4: '#174A79', 0.6: '#149D83', 0.8: '#6DDE7A', 1.0: '#FFFFFF' },
};

/** Collection of heat-map visual elements. */
var views = {};

/** Constant promise to serve as async sleep. */
const sleep = interval => new Promise(r => setTimeout(r, interval));

/** Registers local polled action with defined polling interval. */
const poll = (action, interval) => action()
    .then(sleep(interval)
        .then(() => poll(action, interval)));

/**
 * Initialize a new layer for heat-map from a specified source.
 * @param {Object} map - Leaflet map object active to the current client instance.
 * @param {string} layerId - ID of the layer serving as the active map container for a nested heat-map.
 * @param {number[]} origin - Comma-separated sensor Latitude and Longitude values. [decimal degrees]
 * @param {string} msg - Type initialization map defining the associate format of individual data records.
 * @param {number} opacityLevel - Level of the opacity to apply to the indicated element. [0,1,2]
 * @param {Boolean} isVisible - True if map layer should be visible on map, False otherwise.
 */
function initialize(map, layerId, origin, msg, opacityLevel, isVisible) {
    let paneId = `${layerId}.${HEAT_MAP_PANE_NAME}`;
    views[layerId] = {
        isVisible: isVisible,
        type: gen.PlacementType.LAT_LNG,
        origin: { lat: origin[0], lng: origin[1] },
        indices: [],
        panes: [],
        active: null,
        previous: [],
        counts: [],
        lastCount: 0,
        scanPeriod: Math.round(gen.getMillisecondsFrom(msg.refreshPeriod) * 0.001, 0)
    };
    views[layerId].panes.push(map.createPane(paneId));

    map.getPane(paneId).style.pointerEvents = 'none';

    let headers = msg.header.split(',');

    views[layerId].indices = [
        headers.findIndex(h => h.startsWith('Intensity')),
        headers.findIndex(h => h.startsWith('Latitude')),
        headers.findIndex(h => h.startsWith('Longitude')),
        headers.findIndex(h => h.startsWith('Range')),
        headers.findIndex(h => h.startsWith('Azimuth')),
    ];

    if ((views[layerId].indices[1] < 0) &&
        (views[layerId].indices[2] < 0))
        views[layerId].type = gen.PlacementType.RANGE_AZ;

    let heatMapOptions = options(paneId, getRadius(map, msg.dotSize));

    views[layerId].active = { data: [], layer: L.heatLayer([], heatMapOptions) };
    for (let i = 0; i < SCAN_HISTORY; i++)
        views[layerId].previous[i] = { data: [], layer: L.heatLayer([], heatMapOptions) };

    setOpacity(layerId, opacityLevel);
    setIsVisible(layerId, isVisible);

    map.addLayer(views[layerId].active.layer);
    for (let i = 0; i < SCAN_HISTORY; i++)
        map.addLayer(views[layerId].previous[i].layer);

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

    map.on('zoomend', _ => {
        heatMapOptions.radius = getRadius(map, msg.dotSize);
        heatMapOptions.blur = heatMapOptions.radius;
        for (let i = 0; i < SCAN_HISTORY; i++) {
            views[layerId].previous[i].layer.setOptions(heatMapOptions);
            views[layerId].previous[i].layer.redraw();
        }
        views[layerId].active.layer.setOptions(heatMapOptions);
        views[layerId].active.layer.redraw();
    });
}

/**
 * Get the displayed cell radius from the actual size and current map zoom level.
 * @param {Object} map - Leaflet map object active to the current client instance.
 * @param {number} resolutionCellSize - Approximate size of a resolution cell, taken as a circle diameter. [meters]
 */
function getRadius(map, resolutionCellSize) {
    let bounds = map.getBounds();
    let size = map.getSize();
    let pixelsPerMeter = 0.5 * resolutionCellSize * Math.sqrt(Math.pow(size.x, 2), Math.pow(size.y, 2)) / bounds._northEast.distanceTo(bounds._southWest);
    return Math.max(Math.min(Math.round(pixelsPerMeter), 74), 3);
}

/**
 * Set all data points for a particular heat-map in bulk (faster to work with canvas in bulk at a controlled interval than messing with it continuously - GFX line of thinking applies here).
 * @param {string} layerId - ID of the layer serving as the active map container for a nested heat-map.
 * @param {number[][]} dataPoints - Collection of all data points that needs to be set to the indicated layer [Latitude, Longitude, Intensity]
 */
function set(layerId, dataPoints) {
    views[layerId].active.data = dataPoints;
    views[layerId].active.setData(dataPoints);
}

/**
 * Enqueue a collection of clutter points from an incoming collection of packed records for interpretation and update/addition.
 * @param {string} layerId - ID of the layer serving as the active map container for a nested heat-map.
 * @param {string} packet - Payload containing the packed collection of clutter point records for interpretation.
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
 * Add a new clutter intensity point to the indicated map layer at the indicated location.
 * @param {string} layerId - ID of the layer serving as the active map container for a nested heat-map.
 * @param {number[]} location - Comma-separated clutter point Latitude and Longitude values [decimal degrees].
 * @param {number} intensity - Intensity value of the heat map at the accompanying location.
 */
function add(layerId, location, intensity) {
    views[layerId].active.data.push([location[0], location[1], intensity]);
}

/**
 * Clear all elements under the indicated heat-map layer.
 * @param {string} layerId - ID of the layer serving as the active map container for a nested heat-map.
 */
function clear(layerId) {
    let lastScanData = views[layerId].active.data;
    views[layerId].active.data = [];
    for (let i = SCAN_HISTORY - 1; i > 0; i--) {
        views[layerId].previous[i].data = views[layerId].previous[i - 1].data;
        views[layerId].previous[i].layer.setLatLngs(views[layerId].previous[i].data);
    }
    views[layerId].previous[0].data = lastScanData;
    views[layerId].previous[0].layer.setLatLngs(views[layerId].previous[0].data);
}

/**
 * Traverse through all clutter points on the indicated layer, then set the layer intensities as appropriate by age, clearing the oldest layer and moving it to the top as the new active layer (ensures that new clutter points always appear over older points).
 * @param {string} layerId - ID of the layer serving as the active map container for a nested heat-map.
 */
function refresh(layerId) {
    views[layerId].active.layer.setLatLngs(views[layerId].active.data);

    let countElement = document.getElementById(`${layerId}.LayerToggle.Default.count-label-content`);
    if (!countElement)
        return;

    if (views[layerId].counts.length >= views[layerId].scanPeriod)
        views[layerId].counts.shift();

    let activeCount = views[layerId].active.data.length;
    views[layerId].counts.push(views[layerId].lastCount <= activeCount
        ? activeCount - views[layerId].lastCount
        : views[layerId].previous[0].data.length + activeCount - views[layerId].lastCount);
    views[layerId].lastCount = activeCount;
    countElement.innerHTML = views[layerId].counts.reduce((prev, next) => prev + next, 0);
}

/**
 * Set the visibility of the pre-registered map layer as indicated.
 * @param {string} layerId - ID of the layer serving as the active map container for a nested heat-map.
 * @param {Boolean} isVisible - True if map layer should be visible on map, False otherwise.
 */
function setIsVisible(layerId, isVisible) {
    views[layerId].isVisible = isVisible;
    for (let i = 0; i < views[layerId].panes.length; i++)
        views[layerId].panes[i].style.display = isVisible ? '' : 'none';
}

/**
 * Set the opacity of the pre-registered map layer according to the indicated level.
 * @param {string} layerId - ID of the layer serving as the active map container for a nested heat-map.
 * @param {number} opacityLevel - Level of the opacity to apply to the indicated element. [0,1,2]
 */
function setOpacity(layerId, opacityLevel) {
    views[layerId].opacity = opacityLevel;
    for (let i = 0; i < views[layerId].panes.length; i++)
        views[layerId].panes[i].style.opacity = (1 + opacityLevel) * 0.25;
}

/**
 * Create an object with the keyed pane parameter values for the new map layer.
 * @param {string} layerId - ID of the layer serving as the active map container for a nested heat-map.
 * @param {number} resolutionCellSize - Approximate size of a resolution cell, taken as a circle diameter. [meters]
 * @returns Object specifying the layer defaults.
 */
function options(layerId, resolutionCellSize) {
    return {
        pane: layerId,
        radius: resolutionCellSize,
        blur: resolutionCellSize,
        max: 20,
        maxZoom: 12,
        minOpacity: 0.1,
        gradient: Palettes.MAGMA
    }
}

export {
    initialize,
    set,
    enqueue,
    setIsVisible,
    setOpacity,
}
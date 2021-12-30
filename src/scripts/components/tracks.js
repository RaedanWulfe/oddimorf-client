/**
 * @fileoverview Primary logic of the track functionalities as available for instancing from client.
 * @package
 */

import * as gen from "Scripts/my-general.js";
import * as util from "Modules/leaflet-geometryutil/src/leaflet.geometryutil.js";

/** Polling interval for track count update and pruning of old tracks [milliseconds]. */
const REFRESH_INTERVAL = 1_000;

/** Track DOM element postfix for the track context panel. */
const POPUP_PANE_NAME = 'trackPopupViews';

/** Track DOM element postfix for the track's active hit area. */
const HOT_ZONE_PANE_NAME = 'trackHotZoneViews';

/** Track DOM element postfix for the track target. */
const TARGET_PANE_NAME = 'trackTargetViews';

/** Track DOM element postfix for the track trail. */
const TRAIL_PANE_NAME = 'trackTrailViews';

/** Predefined track target paths. */
const symbols = [
    "m 26,9 -7,25 7,-8 7,8 z",                                             // 0. Sharp
    "m 26,15 c -7,0 -7,10 -7,10 v 9 l 7,-8 7,8 v -9 c 0,0 0,-10 -7,-10 z", // 1. Round
    "m 19,17 v 17 l 7,-8 7,8 V 17 Z"                                       // 2. Flat
];

/** Collection of nested track visual elements. */
var views = {};

/** Leaflet map object used as map substrate for the current web app instance. */
var mapObj = null;

/** Constant promise to serve as async sleep. */
const sleep = interval => new Promise(r => setTimeout(r, interval));

/** Registers local polled action with defined polling interval. */
const poll = (action, interval) => action()
    .then(sleep(interval)
        .then(() => poll(action, interval)));

/**
 * Get a composite key for the track, using both the layer and individual track ID.
 * @param {string} layerId - ID of the layer serving as the active map container for a collection of track elements.
 * @param {string} trackId - ID of an individual track, associated to source.
 * @returns Composite key for the element ID under the specified layer.
 */
function getKey(layerId, trackId) {
    return `${layerId}.${trackId}`;
}

/**
 * Initialize a new layer for tracks from a specified source.
 * @param {Object} map - Leaflet map object active to the current client instance.
 * @param {string} layerId - ID of the layer serving as the active map container for a collection of track elements.
 * @param {number[]} origin - Comma-separated sensor Latitude and Longitude values. [decimal degrees]
 * @param {string} msg - Type initialization map defining the associate format of individual data records.
 * @param {number} opacityLevel - Level of the opacity to apply to the initialized element. [0,1,2]
 * @param {Boolean} isVisible - True if map layer should be visible on map, False otherwise.
 */
function initialize(map, layerId, origin, msg, opacityLevel, isVisible) {
    mapObj = map;
    views[layerId] = {
        items: new Set(),
        isVisible: isVisible,
        type: gen.PlacementType.LAT_LNG,
        origin: { lat: origin[0], lng: origin[1] },
        classifications: msg.classifications,
        indices: [],
        queue: [],
        panes: []
    };
    views[layerId].panes.push(map.createPane(`${layerId}.${HOT_ZONE_PANE_NAME}`));
    views[layerId].panes.push(map.createPane(`${layerId}.${TRAIL_PANE_NAME}`));
    views[layerId].panes.push(map.createPane(`${layerId}.${TARGET_PANE_NAME}`));
    views[layerId].panes.push(map.createPane(`${layerId}.${POPUP_PANE_NAME}`));

    map.getPane(`${layerId}.${HOT_ZONE_PANE_NAME}`).style.pointerEvents = 'all';
    map.getPane(`${layerId}.${TRAIL_PANE_NAME}`).style.pointerEvents = 'none';
    map.getPane(`${layerId}.${TARGET_PANE_NAME}`).style.pointerEvents = 'none';
    map.getPane(`${layerId}.${POPUP_PANE_NAME}`).style.pointerEvents = 'none';

    let headers = msg.header.split(',');

    views[layerId].indices = [
        headers.findIndex(h => h.startsWith('Identifier')),
        headers.findIndex(h => h.startsWith('Latitude')),
        headers.findIndex(h => h.startsWith('Longitude')),
        headers.findIndex(h => h.startsWith('Origin_Latitude')),
        headers.findIndex(h => h.startsWith('Origin_Longitude')),
        headers.findIndex(h => h.startsWith('Azimuth')),
        headers.findIndex(h => h.startsWith('Range')),
        headers.findIndex(h => h.startsWith('Speed')),
        headers.findIndex(h => h.startsWith('Bearing')),
        headers.findIndex(h => h.startsWith('Type')),
        headers.findIndex(h => h.startsWith('Info')),
    ];

    if ((views[layerId].indices[1] < 0) &&
        (views[layerId].indices[2] < 0)) {
        views[layerId].type = ((views[layerId].indices[3] < 0) && (views[layerId].indices[4] < 0))
            ? gen.PlacementType.RANGE_AZ_FROM_SELF
            : gen.PlacementType.RANGE_AZ;
    }

    setOpacity(layerId, opacityLevel);
    setIsVisible(layerId, isVisible);

    let pruneInterval = 4 * gen.getMillisecondsFrom(msg.refreshPeriod);

    poll(() => new Promise(() => {
        let pruneBefore = Date.now() - pruneInterval;
        let purgeList = [];
        for (let key in views[layerId].items)
            if (views[layerId].items[key].lastUpdate < pruneBefore)
                purgeList.push(key);

        if (purgeList.length > 0) {
            purgeList.forEach(key => remove(layerId, key));
            updateCount(layerId);
        }
    }), REFRESH_INTERVAL);
}

/**
 * Enqueue a collection of tracks from an incoming collection of packed records for interpretation and update/addition.
 * @param {string} layerId - ID of the layer serving as the active map container for a collection of track elements.
 * @param {string} packet - Payload containing the packed collection of track records for interpretation.
 */
function enqueue(layerId, packet) {
    if (!(layerId in views) || !packet)
        return;
    let msg = packet.split(',');
    addOrUpdate(layerId,
        msg[views[layerId].indices[0]].slice(1,-1),
        views[layerId].type == gen.PlacementType.LAT_LNG
            ? { lat: msg[views[layerId].indices[1]], lng: msg[views[layerId].indices[2]] }
            : util.destination(
                { lat: msg[views[layerId].indices[3]], lng: msg[views[layerId].indices[4]] },
                msg[views[layerId].indices[5]],
                msg[views[layerId].indices[6]]),
        msg[views[layerId].indices[7]],
        msg[views[layerId].indices[8]],
        views[layerId].classifications[msg[views[layerId].indices[9]]].symbolIndex,
        views[layerId].classifications[msg[views[layerId].indices[9]]].paletteIndex,
        msg[views[layerId].indices[10]].slice(1,-1));
}

/**
 * Remove the specified strobe from the indicated map layer.
 * @param {string} layerId - ID of the layer serving as the active map container for a collection of track elements.
 * @param {string} key - Key of the track that should be removed (see {@link getKey} for more info).
 */
function remove(layerId, key) {
    mapObj.removeLayer(views[layerId].items[key].hotZone);
    mapObj.removeLayer(views[layerId].items[key].popup);
    mapObj.removeLayer(views[layerId].items[key].target);
    if (views[layerId].items[key].trail)
        mapObj.removeLayer(views[layerId].items[key].trail);

    delete views[layerId].items[key];
}

/**
 * Adds a new track if not in the active dictionaries, or updates an active track as indicated if the track ID is already present.
 * @param {string} layerId - ID of the layer serving as the active map container for a collection of track elements.
 * @param {string} trackId - ID of an individual track, associated to source.
 * @param {Object} location - Formatted latLng object defining the track location.
 * @param {number} speed - Specified track target speed. [meters/second]
 * @param {number} bearing - Specified track target bearing. [degrees]
 * @param {number} symbolIndex - Enum defined value indicating the target type, as specified by the source.
 * @param {string} info - HTML formatted contents of the track target details contained in its context panel.
 */
function addOrUpdate(layerId, trackId, location, speed, bearing, symbolIndex, paletteIndex, info) {
    let key = getKey(layerId, trackId);
    if (!(views[layerId].items[key])) {
        let popup = new L.popup(popupOptions(layerId)).setContent(info);
        views[layerId].items[key] = {
            target: new L.marker(location, targetOptions(layerId, trackId, speed, bearing, symbolIndex, paletteIndex)).addTo(mapObj),
            history: [location],
            popup: popup,
            hotZone: new L.marker(location, hotZoneOptions(layerId)).addTo(mapObj).bindPopup(popup),
            trail: null,
            lastUpdate: null,
        }
        updateCount(layerId);
    }
    else {
        views[layerId].items[key].target.setLatLng(location);
        views[layerId].items[key].popup.setContent(info);
        views[layerId].items[key].hotZone.setLatLng(location);
        views[layerId].items[key].history.push(location);

        if (views[layerId].items[key].history.length === 2)
            views[layerId].items[key].trail = L.polyline(views[layerId].items[key].history, trailOptions(layerId, paletteIndex)).addTo(mapObj);
        else {
            let trackTrail = views[layerId].items[key].trail;
            trackTrail.options.color = gen.Palettes[paletteIndex];
            trackTrail.addLatLng(location);
        }

        let svgElement = document.getElementById(`${trackId}.track-symbol`);
        if (svgElement) {
            svgElement.setAttribute('transform', `rotate(${bearing},26,26)`);
            svgElement.childNodes[1].setAttribute("d", symbols[symbolIndex]);
            svgElement.childNodes[1].setAttribute("style", `fill: ${gen.Palettes[paletteIndex]}`);
        }
        let speedElement = document.getElementById(`${trackId}.track-speed`);
        if (speedElement)
            speedElement
                .innerHTML = String(Math.round(speed)).padStart(4, '0');

        let bearingElement = document.getElementById(`${trackId}.track-bearing`);
        if (bearingElement)
            bearingElement
                .innerHTML = String(Math.round(bearing)).padStart(3, '0');
    }
    views[layerId].items[key].lastUpdate = Date.now();
}

/**
 * Set the visibility of the pre-registered map layer as indicated.
 * @param {string} layerId - ID of the layer serving as the active map container for a collection of track elements.
 * @param {Boolean} isVisible - True if map layer should be visible on map, False otherwise.
 */
function setIsVisible(layerId, isVisible) {
    views[layerId].isVisible = isVisible;
    for (let i = 0; i < views[layerId].panes.length; i++)
        views[layerId].panes[i].style.display = isVisible ? '' : 'none';
}

/**
 * Set the opacity of the pre-registered map layer according to the indicated level.
 * @param {string} layerId - ID of the layer serving as the active map container for a collection of track elements.
 * @param {number} opacityLevel - Level of the opacity to apply to the indicated element. [0,1,2]
 */
function setOpacity(layerId, opacityLevel) {
    views[layerId].opacity = opacityLevel;
    let opacity = (1 + opacityLevel) * 0.33;
    for (let i = 0; i < views[layerId].panes.length; i++)
        views[layerId].panes[i].style.opacity = opacity;
}

/**
 * Create an object with the keyed pane parameter values for the new context panel.
 * @param {string} layerId - ID of the layer serving as the active map container for a collection of track elements.
 * @returns Object specifying the layer defaults.
 */
function popupOptions(layerId) {
    return {
        pane: `${layerId}.${POPUP_PANE_NAME}`,
        closeButton: false
    }
}

/**
 * Create an object with the keyed pane parameter values for the new active hit zone map layer.
 * @param {string} layerId - ID of the layer serving as the active map container for a collection of track elements.
 * @returns Object specifying the layer defaults.
 */
function hotZoneOptions(layerId) {
    return {
        pane: `${layerId}.${HOT_ZONE_PANE_NAME}`,
        interactive: true,
        icon: L.divIcon({
            iconSize: [50, 50],
            iconAnchor: [25, 25],
            popupAnchor: [0, -35],
            className: 'track-hot-zone-style',
            html: '<div width=50px;height=50px;></div>'
        })
    }
}

/**
 * Create an object with the keyed pane parameter values for the new trail map layer.
 * @param {string} layerId - ID of the layer serving as the active map container for a collection of track elements.
 * @param {number} paletteIndex - Index of palette to use from the list of pre-defined palettes for the trail.
 * @returns Object specifying the layer defaults.
 */
function trailOptions(layerId, paletteIndex) {
    return {
        pane: `${layerId}.${TRAIL_PANE_NAME}`,
        weight: 1.4,
        color: gen.Palettes[paletteIndex],
        opacity: 0.4,
        fillColor: '#000000',
        fillOpacity: 0,
        interactive: false
    }
}

/**
 * Create an object with the keyed pane parameter values for the new target map layer.
 * @param {string} layerId - ID of the layer serving as the active map container for a collection of track elements.
 * @param {string} trackId - ID of an individual track, associated to source.
 * @param {number} speed - Initially specified track target speed. [meters/second]
 * @param {number} bearing - Initially specified track target bearing. [degrees]
 * @param {number} symbolIndex - Enum defined value indicating the initial target type, as specified by the source.
 * @param {number} paletteIndex - Index of palette to use from the list of pre-defined palettes for the trail.
 * @returns Object specifying the layer defaults.
 */
function targetOptions(layerId, trackId, speed, bearing, symbolIndex, paletteIndex) {
    return {
        pane: `${layerId}.${TARGET_PANE_NAME}`,
        interactive: false,
        zIndexOffset: 9000,
        icon: L.divIcon({
            iconSize: [54, 54],
            iconAnchor: [26, 26],
            className: 'track-marker-style',
            html:
                `<div style='display:flex;flex-direction:row;'>` +
                    `<svg class='map-symbol-track-symbol' viewBox="0 0 54 54" style="width:100%; height:100%; position:absolute;">` +
                        `<defs>` +
                            `<filter id="drop-shadow" width="1.42" height="3" x="-0.25" y="-1" style="color-interpolation-filters:sRGB">` +
                                `<feGaussianBlur stdDeviation="8" />` +
                            `</filter>` +
                        `</defs>` +
                        `<g id="${trackId}.track-symbol" transform="rotate(${bearing},26,26)">` +
                            `<path class="symbol-shadow-style" d="${symbols[symbolIndex]}" filter="url(#drop-shadow)"/>` +
                            `<path class="symbol-icon-style" style="fill:${gen.Palettes[paletteIndex]}" d="${symbols[symbolIndex]}"/>` +
                            `<circle cx="26" cy="26" r="3"/>` +
                        `</g>` +
                    `</svg>` +
                    `<div class='map-symbol-track-label-style' style='display:flex;flex-direction:column;'>` +
                        `<label>TN:${trackId ? trackId : '-'}</label>` +
                        `<div style='display:flex;flex-direction:row;'>` +
                            `<label id='${trackId}.track-speed'>${speed ? String(Math.round(speed)).padStart(4, '0') : '-'}</label>` +
                            `<label>/</label>` +
                            `<label id='${trackId}.track-bearing'>${bearing ? String(Math.round(bearing)).padStart(3, '0') : '-'}</label>` +
                        `</div>` +
                    `</div>` +
                `</div>`,
            interactive: true
        })
    }
}

/**
 * Update the displayed DOM element count for the indicated map layer.
 * @param {string} layerId - ID of the layer serving as the active map container for a collection of track elements.
 */
function updateCount(layerId) {
    let countElement = document.getElementById(`${layerId}.LayerToggle.Default.count-label-content`);
    if (countElement)
        countElement.innerHTML = Object.keys(views[layerId].items).length;
}

export {
    initialize,
    enqueue,
    setIsVisible,
    setOpacity,
}
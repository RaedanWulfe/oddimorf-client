/**
 * @fileoverview Primary logic of the strobe functionalities as available for instancing from client.
 * @package
 */

import * as gen from "Scripts/my-general.js";
import * as util from "Modules/leaflet-geometryutil/src/leaflet.geometryutil.js";

/** Polling interval for strobe count update and pruning of old strobes [milliseconds]. */
const REFRESH_INTERVAL = 1_000;

/** DOM element postfix for a strobe. */
const STROBE_PANE_NAME = 'strobeViews';

/** Collection of strobe visual elements. */
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
 * Get a composite key for the strobe, using both the layer and individual strobe ID.
 * @param {string} layerId - ID of the layer serving as the active map container for a collection of strobe elements.
 * @param {string} strobeId - ID of an individual strobe, associated to source.
 * @returns Composite key for the element ID under the specified layer.
 */
function getKey(layerId, strobeId) {
    return `${layerId}.${strobeId}`;
}

/**
 * Initialize a new layer for strobes from a specified source.
 * @param {Object} map - Leaflet map object active to the current client instance.
 * @param {string} layerId - ID of the layer serving as the active map container for a strobe type collection.
 * @param {string} msg - Type initialization map defining the associate format of individual data records.
 * @param {number} opacityLevel - Level of the opacity to apply to the initialized element. [0,1,2]
 * @param {Boolean} isVisible - True if map layer should be visible on map, False otherwise.
 */
function initialize(map, layerId, origin, msg, opacityLevel, isVisible) {
    mapObj = map;
    let paneId = `${layerId}.${STROBE_PANE_NAME}`;
    views[layerId] = {
        items: new Set(),
        isVisible: true,
        type: gen.PlacementType.LAT_LNG,
        origin: { lat: origin[0], lng: origin[1] },
        classifications: msg.classifications,
        indices: [],
        queue: [],
        panes: []
    };
    views[layerId].panes.push(map.createPane(paneId));

    map.getPane(paneId).style.pointerEvents = 'none';

    let headers = msg.header.split(',');
    views[layerId].indices = [
        headers.findIndex(h => h.startsWith('Identifier')),
        headers.findIndex(h => h.startsWith('Latitude')),
        headers.findIndex(h => h.startsWith('Longitude')),
        headers.findIndex(h => h.startsWith('Origin_Latitude')),
        headers.findIndex(h => h.startsWith('Origin_Longitude')),
        headers.findIndex(h => h.startsWith('Azimuth')),
        headers.findIndex(h => h.startsWith('Range')),
        headers.findIndex(h => h.startsWith('Type')),
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
 * Enqueue a collection of strobes from an incoming collection of packed records for interpretation and update/addition.
 * @param {string} layerId - ID of the layer serving as the active map container for a strobe type collection.
 * @param {string} packet - Payload containing the packed collection of strobe records for interpretation.
 */
function enqueue(layerId, packet) {
    if (!(layerId in views) || !packet)
        return;
    let msg = String(packet).split(',');
    let origin = views[layerId].type == gen.PlacementType.RANGE_AZ_FROM_SELF
        ? views[layerId].origin
        : { lat: msg[views[layerId].indices[3]], lng: msg[views[layerId].indices[4]] };
    let destination = views[layerId].type == gen.PlacementType.LAT_LNG
        ? { lat: msg[views[layerId].indices[1]], lng: msg[views[layerId].indices[2]] }
        : util.destination(origin, msg[views[layerId].indices[5]]*1.0, msg[views[layerId].indices[6]]);
    let colour = gen.Palettes[views[layerId].classifications[msg[views[layerId].indices[7]]].paletteIndex];
    addOrUpdate(layerId,
        msg[views[layerId].indices[0]],
        origin,
        destination,
        colour);
}

/**
 * Remove the specified strobe from the indicated map layer.
 * @param {string} layerId - ID of the layer serving as the active map container for a strobe type collection.
 * @param {string} key - Key of the strobe that should be removed (see {@link getKey} for more info).
 */
function remove(layerId, key) {
    mapObj.removeLayer(views[layerId].items[key].strobe);
    delete views[layerId].items[key];
}

/**
 * Adds a new strobe if not in the active dictionaries, or updates an active strobe as indicated if the strobe ID is already present.
 * @param {string} layerId - ID of the layer serving as the active map container for a strobe type collection.
 * @param {string} strobeId - Unique ID of the incoming strobe, allowing for subsequent updates using this ID as a key.
 * @param {Object} origin - First line location, centered on the detecting sensor. [{lat,lng}]
 * @param {Object} destination - Second line location, as through the detected target. [{lat,lng}]
 * @param {string} colour - Colour hex value for the strobe layer.
 */
function addOrUpdate(layerId, strobeId, origin, destination, colour) {
    let key = getKey(layerId, strobeId);
    if (!(views[layerId].items[key])) {
        views[layerId].items[key] = {
            strobe: L.polyline([origin, destination], strobeOptions(layerId, colour)).addTo(mapObj),
            lastUpdate: null,
        }
        updateCount(layerId);
    }
    else
    views[layerId].items[key].strobe.setLatLngs([origin, destination]);

    views[layerId].items[key].lastUpdate = Date.now();
}

/**
 * Set the visibility of the pre-registered map layer as indicated.
 * @param {string} layerId - ID of the layer serving as the active map container for a strobe type collection.
 * @param {Boolean} isVisible - True if map layer should be visible on map, False otherwise.
 */
function setIsVisible(layerId, isVisible) {
    views[layerId].isVisible = isVisible;
    for (let i = 0; i < views[layerId].panes.length; i++)
        views[layerId].panes[i].style.display = isVisible ? '' : 'none';
}

/**
 * Set the opacity of the pre-registered map layer according to the indicated level.
 * @param {string} layerId - ID of the layer serving as the active map container for a strobe type collection.
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
 * @param {string} layerId - ID of the layer serving as the active map container for a strobe type collection.
 * @param {string} colour - Colour hex value for the strobe layer.
 * @returns Object specifying the layer defaults.
 */
function strobeOptions(layerId, colour) {
    return {
        pane: `${layerId}.${STROBE_PANE_NAME}`,
        weight: 3.0,
        color: colour,
        opacity: 0.6,
        fillColor: '#000000',
        fillOpacity: 0,
        interactive: false
    }
}

/**
 * Update the displayed DOM element count for the indicated map layer.
 * @param {string} layerId - ID of the layer serving as the active map container for a strobe type collection.
 */
function updateCount(layerId) {
    let countElement = document.getElementById(`${layerId}.LayerToggle.Default.count-label-content`);
    if (countElement) {
        let length = Object.values(views[layerId].items).length
        countElement.innerHTML = length;
    }
}

export {
    initialize,
    enqueue,
    setIsVisible,
    setOpacity,
}
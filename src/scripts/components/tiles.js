/**
 * @fileoverview Primary logic of the map tile functionalities as available for instancing from client.
 * @package
 */

/** Subscription key to the Azure based WMS, replace with specific key with new implementation. */
const AZURE_SUBSCRIPTION_KEY = 'stOxr4w6raYx1yBfV2pHxDvSNyneoMV8g20ehnLAzWg';

/** Default WMS details to use for light/dark mode with both an Azure and non-Azure use. */
const server = {
    default: {
        light: {
            url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png',
            setup: {
                maxZoom: 20,
                opacity: 0.4,
                attribution:
                    "© <a href='https://stadiamaps.com/'>Stadia Maps</a>, " +
                    "© <a href='https://openmaptiles.org/'>OpenMapTiles</a> " +
                    "© <a href='http://openstreetmap.org'>OpenStreetMap</a> contributors"
            }
        },
        dark: {
            url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
            setup: {
                maxZoom: 20,
                opacity: 0.4,
                attribution:
                    "© <a href='https://stadiamaps.com/'>Stadia Maps</a>, " +
                    "© <a href='https://openmaptiles.org/'>OpenMapTiles</a> " +
                    "© <a href='http://openstreetmap.org'>OpenStreetMap</a> contributors"
            }
        },
    },
    azure: {
        light: {
            url: 'https://atlas.microsoft.com/map/tile?subscription-key={subscriptionKey}&api-version=2.0&tilesetId={tilesetId}&tileSize=512&zoom={z}&x={x}&y={y}',
            setup: {
                maxZoom: 18,
                tileSize: 512,
                zoomOffset: -1,
                crossOrigin: true,
                tilesetId: 'microsoft.base.road',
                attribution:
                    `© ${new Date().getFullYear()} Microsoft,` +
                    `© ${new Date().getFullYear()} TomTom`,
                subscriptionKey: AZURE_SUBSCRIPTION_KEY
            }
        },
        dark: {
            url: 'https://atlas.microsoft.com/map/tile?subscription-key={subscriptionKey}&api-version=2.0&tilesetId={tilesetId}&tileSize=512&zoom={z}&x={x}&y={y}',
            setup: {
                maxZoom: 18,
                tileSize: 512,
                zoomOffset: -1,
                crossOrigin: true,
                tilesetId: 'microsoft.base.darkgrey',
                attribution:
                    `© ${new Date().getFullYear()} Microsoft,` +
                    `© ${new Date().getFullYear()} TomTom`,
                subscriptionKey: AZURE_SUBSCRIPTION_KEY
            }
        },
    }
}

/** Collection of tile-layer visual elements. */
var views = {};

/**
 * Initialize a map object to the current view with a newly registered layer and a set of defined parameters.
 * @param {Object} map - Leaflet map object active to the current client instance.
 * @param {string} layerId - ID of the layer serving as the active map container for a collection of map tile elements.
 * @param {number} opacityLevel - Level of the opacity to apply to the indicated element. [0,1,2]
 * @param {Boolean} isVisible - True if map layer should be visible on map, False otherwise.
 */
function initialize(map, layerId, opacityLevel, isVisible, isDayMode, isAzure) {
    var tileSet = isDayMode
        ? isAzure ? server.azure.light : server.default.light
        : isAzure ? server.azure.dark : server.default.dark;

    views[layerId] = {
        isVisible: isVisible,
        opacity: opacityLevel,
        active: L.tileLayer(tileSet.url, tileSet.setup).addTo(map),
    };

    setOpacity(layerId, opacityLevel);
    setIsVisible(layerId, isVisible);
}

/**
 * Registers a new map layer to the defined Leaflet map object.
 * @param {Object} map - Leaflet map object active to the current client instance.
 * @param {string} layerId - ID of the layer serving as the active map container for a collection of map tile elements.
 */
function setMap(map, layerId, isDayMode, isAzure) {
    var tileSet = isDayMode
        ? isAzure ? server.azure.light : server.default.light
        : isAzure ? server.azure.dark : server.default.dark;

    if (views[layerId])
        map.removeLayer(views[layerId].active);

    views[layerId].active = L.tileLayer(tileSet.url, tileSet.setup).addTo(map);

    setOpacity(layerId, views[layerId].opacity);
    setIsVisible(layerId, views[layerId].isVisible);
}

/**
 * Set the visibility of the pre-registered map layer as indicated.
 * @param {string} layerId - ID of the layer serving as the active map container for a collection of map tile elements.
 * @param {Boolean} isVisible - True if map layer should be visible on map, False otherwise.
 */
function setIsVisible(layerId, isVisible) {
    views[layerId].isVisible = isVisible;
    views[layerId].active.setOpacity(isVisible ? views[layerId].opacity : 0.0);
}

/**
 * Set the opacity of the pre-registered map layer according to the indicated level.
 * @param {string} layerId - ID of the layer serving as the active map container for a collection of map tile elements.
 * @param {number} opacityLevel - Level of the opacity to apply to the indicated element. [0,1,2]
 */
function setOpacity(layerId, opacityLevel) {
    let opacity = (1 + opacityLevel) * 0.33;
    views[layerId].opacity = opacity;
    views[layerId].active.setOpacity(opacity);
}

export {
    initialize,
    setMap,
    setIsVisible,
    setOpacity,
}
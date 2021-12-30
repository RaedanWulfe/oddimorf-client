/**
 * @fileoverview Logic of functionalities that apply to the menu panel for the layers under the active chain.
 * @package
 */

/** Web application IndexedDB name for client specific view settings. */
const DB_NAME = 'viewsDb';

/** Table name to use under the IndexedDB for the client specific layer display settings. */
const STORE_NAME = 'layers';

/** Identifying name to broadly associate with the map layer toggle. */
const CONTROL_TAG = 'LayerToggle';

/** Identifying name of the element containing the available layer control cards (as in the HTML). */
const DEFAULT_VIEW_CONTAINER_NAME = "layer-items-default-stack";

/** Identifying name of the element containing the available layer control cards in edit mode (as in the HTML). */
const EDIT_VIEW_CONTAINER_NAME = "layer-items-edit-stack";

/** Unique identifier of the processing chain that is currently in use. */
var selectedChainId = "";

/** Holding object for the retrieved IndexedDB. */
var viewsDb = null;

/** Sequence for changes to the IndexedDB, incremented with each update. */
var viewsSequence = 1;

/** Internal dictionary describing the current data context of available map view layers chains. */
var context = {};

/** Collection of parent subsystems to which the layers belong (for retrieval is the parent name). */
var subSystems = {};

/**
 * Class holding the basic implementation for a visual map layer.
 */
class Layer {
    constructor(name, opacityLevel, isVisible) {
        this.name = name;
        this.parentName = '';
        this.opacityLevel = opacityLevel;
        this.isVisible = isVisible;
    }
}

/** Event handler for initial load of toggle providing control over the associated map layer's visibility.*/
document.layerToggleLoaded = (chainId, subSystemId, layerId, source) => {
    let key = getKey(chainId, subSystemId, layerId);
    setParentLabelView(key, source, context[key].parentName);
    if (source === 'Edit')
        setOpacityView(key, source, context[key].opacityLevel);
}

// GENERAL

/**
 * Initialize the client-side Indexed-DB for the application.
 */
function initializeIdb() {
    return new Promise((resolve, reject) => {
        if (viewsDb) {
            resolve();
            return;
        }

        let request = indexedDB.open(DB_NAME, viewsSequence++);

        // Out of date DB version.
        request.onupgradeneeded = e => {
            let db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME))
                db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        };

        request.onerror = e => reject(`IndexedDB initialization error. ${e.target.errorCode}`);
        request.onsuccess = e => {
            viewsDb = e.target.result;
            resolve();
        }
    });
}

/**
 * Builds a formatted key from the indicated chain ID, subsystem ID and layer name.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 * @param {string} layerName - User friendly name of the layer.
 * @returns Properly formatted key.
 */
function getKey(chainId, subSystemId, layerName) {
    return `${chainId}.${subSystemId}.${getSanitized(layerName)}`;
}

/**
 * Remove special characters from specified string.
 * @param {string} name - String which potentially contains special characters.
 * @returns Name without any special characters.
 */
function getSanitized(name) {
    return name ? name.replace(/\s+/g, '') : "";
}

/**
 * Set active chain as indicated.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 */
function setSelectedChain(chainId) {
    if (selectedChainId &&
        selectedChainId !== '')
        pullCurrentSetupFromView(selectedChainId);

    let keys = Object.keys(context);
    let layers = Object.values(keys.filter(k => k.startsWith(selectedChainId)));
    for (let i in layers) {
        let parts = layers[i].split('.');
        if (parts[0] !== "Base") {
            removeView(parts[0], parts[1], parts[2], 'Default');
            removeView(parts[0], parts[1], parts[2], 'Edit');
        }
    }

    selectedChainId = chainId;

    layers = Object.values(keys.filter(k => k.startsWith(selectedChainId)));
    for (let i in layers) {
        let parts = layers[i].split('.');
        addOrUpdateDefaultView(parts[0], parts[1], parts[2]);
        addOrUpdateEditView(parts[0], parts[1], parts[2]);
    }
}

/**
 * Retrieve the current setup as defined from view to ensure that the client data model is in sync with the view (typically used on save).
 * @param {string} chainId - Unique identifier of a configured processing chain.
 */
function pullCurrentSetupFromView(chainId) {
    let key = '';
    let levels = [];
    let groups = Object.keys(context).filter(k => k.startsWith(chainId) || k.startsWith('Base')).reduce(
        (s, k) => {
            let p = k.split('.');
            (s[p[1]] = s[p[1]] ?? [])
                .push(p);
            return s;
        }, {});

    Object.values(groups).forEach(g => {
        Object.values(g).forEach(t => {
            key = getKey(t[0], t[1], t[2]);
            let viewKey = `${key}.${CONTROL_TAG}.Edit`;
            let checkElement = document
                .getElementById(`${viewKey}.opacity-level-group`);

            if (checkElement)
                levels = checkElement['opacity-level'];

            if (levels[0])
                context[key].opacityLevel =
                    levels[0].checked ? 0 :
                    levels[1].checked ? 1 : 2;
        });
    });
}

/**
 * Save global settings
 */
function saveSettings() {
    pullCurrentSetupFromView(selectedChainId);

    let availableChains = [];

    Object.keys(context).forEach(c => availableChains.push(c.split('.')[0]));
    let groups = Object.keys(context).reduce(
        (s, k) => {
            let p = k.split('.');
            (s[p[1]] = s[p[1]] ?? [])
                .push(p);
            return s;
        }, {});

    Object.values(groups).forEach(g => {
        Object.values(g).forEach(t => {
            let key = getKey(t[0], t[1], t[2]);
            let check = viewsDb
                .transaction([STORE_NAME], 'readwrite')
                .objectStore(STORE_NAME)
                .get(key);

            check.onsuccess = e => {
                if (!e.target.result)
                    return;

                let item = e.target.result;
                item.opacity = context[key].opacityLevel;

                viewsDb
                    .transaction([STORE_NAME], 'readwrite')
                    .objectStore(STORE_NAME)
                    .put(item);
            }
        });
    });
}

// INDEX DB

/**
 * Add the layer view settings as indicated as an update to the IndexedDB.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {string} layerName - User friendly name of the layer.
 * @param {number} opacityLevel - Level of the opacity to apply to the indicated element. [0,1,2]
 * @param {Boolean} isVisible - True if map layer should be visible on map, False otherwise.
 * @returns Promise to add stipulated entry to the IndexedDB.
 */
function addIdbEntry(key, layerName, opacityLevel, isVisible) {
    return new Promise((resolve, reject) => {
        if (!viewsDb) {
            reject("Could not add entry to local archive, missing IndexedDB.");
            return;
        }

        let request = viewsDb
            .transaction([STORE_NAME], 'readwrite')
            .objectStore(STORE_NAME)
            .add({ key: key, name: layerName, opacity: opacityLevel, isVisible: isVisible });

        request.onerror = e => e.stopPropagation;
        request.onsuccess = e => resolve();
    });
}

/**
 * Retrieve the keyed entry containing layer view settings from the IndexedDB.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 */
function getIdbEntry(key) {
    return new Promise((resolve) => {
        if (!viewsDb) {
            resolve({ opacity: 2, isVisible: true });
            return;
        }

        let request = viewsDb
            .transaction([STORE_NAME], 'readwrite')
            .objectStore(STORE_NAME)
            .get(key);

        request.onerror = e => resolve({ opacity: 2, isVisible: true });
        request.onsuccess = e => resolve(e.target.result);
    });
}

// ADD OR UPDATE

/**
 * Logic allowing for layer add/update functionality.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 * @param {string} layerName - User friendly name of the layer.
 */
function addOrUpdate(chainId, subSystemId, layerName) {
    let key = getKey(chainId, subSystemId, layerName);
    if (!context[key])
        getIdbEntry(key)
            .then(layer => {
                context[key] = layer
                    ? new Layer(layer.name, layer.opacity, layer.isVisible)
                    : new Layer(layerName, 2, true);
            });

    if (context[key] && subSystems[`${chainId}.${subSystemId}`]) {
        let parentName = subSystems[`${chainId}.${subSystemId}`];
        context[key].parentName = parentName ? parentName : '';
    }

    return new Promise(() => {
        initializeIdb()
            .then(addIdbEntry(getKey(chainId, subSystemId, layerName), layerName, 2, true))
            .then(() => {
                if ((chainId === selectedChainId) || (chainId === 'Base'))
                    addOrUpdateDefaultView(chainId, subSystemId, layerName);
            })
            .then(() => {
                if ((chainId === selectedChainId) || (chainId === 'Base'))
                    addOrUpdateEditView(chainId, subSystemId, layerName)
            });
    });
}

/**
 * Add/update the default usage control card for the specified layer.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 * @param {string} layerName - User friendly name of the layer.
 */
function addOrUpdateDefaultView(chainId, subSystemId, layerName) {
    let viewTag = 'Default';
    let key = getKey(chainId, subSystemId, layerName);
    getIdbEntry(key)
        .then(layer => {
            let viewKey = `${key}.${CONTROL_TAG}.${viewTag}`;
            if (!document.getElementById(viewKey)) {
                let layerId = getSanitized(layer.name);
                document.getElementById(DEFAULT_VIEW_CONTAINER_NAME).innerHTML +=
                `<label id="${viewKey}" class=${(layer.isVisible ? 'checked-toggle-leaf' : 'unchecked-toggle-leaf')}>` +
                    `<label id="${viewKey}.layer-label-content" class="main-label" for='${viewKey}.Toggle'>${layer.name}</label>` +
                    `<label id="${viewKey}.parent-label-content" class="parent-label" for='${viewKey}.Toggle'>${context[key].parentName}</label>` +
                    `<label id="${viewKey}.count-label-content" class="count-label" for='${viewKey}.Toggle'></label>` +
                    `<input id='${viewKey}.Toggle'` +
                        `onclick='viewLayerToggled("${chainId}","${subSystemId}","${layerId}",this.checked);'` +
                        `name='${viewKey}.Toggle'` +
                        `type='checkbox'` +
                        `${(layer.isVisible ? 'checked ' : '')}'/>` +
                    `<img src onerror='layerToggleLoaded("${chainId}","${subSystemId}","${layerId}","${viewTag}");'/>` +
                `</label>`;
            }
            else {
                context[key].name = name;
                context[key].isVisible = layer.isVisible;
                setParentLabelView(key, viewTag, context[key].parentName);
                setLayerLabelView(key, viewTag, layer.name);
            }
        });
}

/**
 * Add/update the edit only control card for the specified layer.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 * @param {string} layerName - User friendly name of the layer.
 */
function addOrUpdateEditView(chainId, subSystemId, layerName) {
    let viewTag = 'Edit';
    let key = getKey(chainId, subSystemId, layerName);
    getIdbEntry(key)
        .then(layer => {
            let viewKey = `${key}.${CONTROL_TAG}.${viewTag}`;
            if (!document.getElementById(viewKey)) {
                let parentName = subSystems[`${chainId}.${subSystemId}`];
                let layerId = getSanitized(layer.name);
                context[key].parentName = parentName ? parentName : " ";
                document.getElementById(EDIT_VIEW_CONTAINER_NAME).innerHTML +=
                    `<label id="${viewKey}" class="toggle-leaf">` +
                        `<label id="${viewKey}.layer-label-content" class="main-label">${layer.name}</label>` +
                        `<label id="${viewKey}.parent-label-content" class="parent-label">${context[key].parentName}</label>` +
                        `<form id="${viewKey}.opacity-level-group">` +
                            `<label class="container"><input id="${viewKey}.opacity-low" type="radio" name="opacity-level" value="0"/>L</label>` +
                            `<label class="container"><input id="${viewKey}.opacity-medium" type="radio" name="opacity-level" value="1"/>M</label>` +
                            `<label class="container"><input id="${viewKey}.opacity-high" type="radio" name="opacity-level" value="2"/>H</label>` +
                        `</form>` +
                        `<img src onerror='layerToggleLoaded("${chainId}","${subSystemId}","${layerId}","${viewTag}");'/>` +
                    `</label>`;
            }
            else {
                context[key].opacityLevel = layer.opacity;
                setParentLabelView(key, viewTag, context[key].parentName);
                setLayerLabelView(key, viewTag, layer.name);
                setOpacityView(key, viewTag, layer.opacity);
            }
        });
}

// OTHER

/**
 * Set label (this is used as part of key, so no live change expected).
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {string} viewTag - Tag identifying the specific control view to work on [e.g. "Default"/"Edit"/"Available"].
 * @param {string} layerName - User friendly name of the layer.
 */
function setLayerLabelView(key, viewTag, layerName) {
    let viewKey = `${key}.${CONTROL_TAG}.${viewTag}`;
    let checkElement = document.getElementById(`${viewKey}.layer-label-content`);
    if (!checkElement)
        checkElement.value = layerName;
};

/**
 * Set the opacity of the pre-registered map layer according to the indicated level.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {string} viewTag - Tag identifying the specific control view to work on [e.g. "Default"/"Edit"/"Available"].
 * @param {number} opacityLevel - Level of the opacity to apply to the indicated element. [0,1,2]
 */
function setOpacityView(key, viewTag, opacityLevel) {
    let viewKey = `${key}.${CONTROL_TAG}.${viewTag}`;
    let checkElement = undefined;
    checkElement = document.getElementById(`${viewKey}.opacity-low`);
    if (checkElement)
        checkElement.checked = opacityLevel == 0;
    checkElement = document.getElementById(`${viewKey}.opacity-medium`);
    if (checkElement)
        checkElement.checked = opacityLevel == 1;
    checkElement = document.getElementById(`${viewKey}.opacity-high`);
    if (checkElement)
        checkElement.checked = opacityLevel == 2;
}

// REMOVE

/**
 * Removes all the visual map layer in the subsystems under this chain.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 */
function removeAllLayersFromChain(chainId) {
    let keys = Object.keys(context);
    Object.values(keys.filter(k => k.startsWith(chainId))).forEach(k =>
        removeView(chainId, k.split('.')[1], context[k].name, 'Edit'));
}

/**
 * Removes the indicated card, for the associated layer, from the view.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 * @param {string} layerName - User friendly name of the layer.
 * @param {string} viewTag - Tag identifying the specific control view to work on [e.g. "Default"/"Edit"/"Available"].
 */
function removeView(chainId, subSystemId, layerName, viewTag) {
    let key = getKey(chainId, subSystemId, layerName);
    let viewKey = `${key}.${CONTROL_TAG}.${viewTag}`;
    let checkElement = document.getElementById(viewKey);
    if (checkElement)
        checkElement.remove();
}

// PARENT LABEL

/**
 * Set parent label directly from message.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} subSystemId - Unique identifier of a sub-system in the processing chain.
 * @param {string} parentName - Name of the subsystem under which this layer sits.
 */
function setParentLabel(chainId, subSystemId, parentName) {
    subSystems[`${chainId}.${subSystemId}`] = parentName;
    let keys = Object.keys(context);
    for (let i = 0; i < keys.length; i++) {
        if (keys[i].startsWith(`${chainId}.${subSystemId}.`)) {
            let key = getKey(chainId, subSystemId, keys[i].split('.')[2]);
            if (context[key]) {
                context[key].parentName = parentName;
                setParentLabelView(key, 'Default', parentName);
                setParentLabelView(key, 'Edit', parentName);
            }
        }
    }
}

/**
 * Set the parent subsystem name on the layer card in the view, allowing for specific identification (e.g. where layer names overlap)s.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {string} viewTag - Tag identifying the specific control view to work on [e.g. "Default"/"Edit"/"Available"].
 * @param {string} parentName - Name of the subsystem under which this layer sits.
 */
function setParentLabelView(key, viewTag, parentName) {
    let viewKey = `${key}.${CONTROL_TAG}.${viewTag}`;
    let checkElement = document.getElementById(`${viewKey}.parent-label-content`);
    if (checkElement && (checkElement.value !== parentName)) {
        checkElement.innerText = parentName;
    }
}

/**
 * Set the visibility of the pre-registered map layer as indicated.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {Boolean} isVisible - True if map layer should be visible on map, False otherwise.
 */
function setIsVisible(key, isVisible) {
    let viewTag = 'Default';
    let viewKey = `${key}.${CONTROL_TAG}.${viewTag}`;
    let checkElement = document.getElementById(viewKey);
    if (checkElement)
        checkElement.setAttribute('class', isVisible ? 'checked-toggle-leaf' : 'unchecked-toggle-leaf');

    let check = viewsDb
        .transaction([STORE_NAME], 'readwrite')
        .objectStore(STORE_NAME)
        .get(key);

    check.onsuccess = e => {
        if (!e.target.result)
            return;

        let item = e.target.result;
        item.isVisible = isVisible;
        viewsDb
            .transaction([STORE_NAME], 'readwrite')
            .objectStore(STORE_NAME)
            .put(item);
    }
}

export {
    setSelectedChain,
    initializeIdb,
    getIdbEntry,
    setIsVisible,
    addOrUpdate,
    removeAllLayersFromChain,
    saveSettings,
    setParentLabel,
}
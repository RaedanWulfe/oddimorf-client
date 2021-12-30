/**
 * @fileoverview Logic of functionalities that apply to the menu panel for the active chain.
 * @package
 */

import * as mqtt from "Scripts/my-mqtt.js";
import * as gen from "Scripts/my-general.js";

/** Identifying name of the element containing the collapsed chain controls (as in the HTML). */
const COLLAPSED_VIEW_CONTAINER_NAME = "chain-control-collapsed";

/** Identifying name of the element containing the chain control card in the default view (as in the HTML). */
const DEFAULT_VIEW_CONTAINER_NAME = "chain-control-default";

/** Identifying name of the element containing the chain control card in edit mode (as in the HTML). */
const EDIT_VIEW_CONTAINER_NAME = "chain-control-edit";

/** Identifying name of the element containing the dropdown panel from which the available processing chains can be configured (as in the HTML). */
const PANEL_VIEW_CONTAINER_NAME = "system-chains-dropdown-panel";

/** Identifying name of the element containing the system chain items in the panel used to configure the available chains (as in the HTML). */
const PANEL_VIEW_LIST_CONTAINER_NAME = "system-chains-list";

/** Unique identifier of the processing chain that is currently in use. */
var selectedChainId = "";

/** Internal dictionary describing the current data context of configured processing chains. */
var context = {};

/** Chains that need to be removed from the broker next time the settings are saved. */
var purgedChains = [];

/**
 * Class holding the basic implementation for a signal chain.
 */
class Chain {
    constructor(isRunning) {
        this.name = '';
        this.state = gen.State.UNKNOWN;
        this.isRunning = isRunning;
        this.isEnabled = false;
        this.origin = { 'latitude': 0.0, 'longitude': 0.0 };
        this.range = 0;
    }
}

/** Event handler on web app document load, ensuring that the DOM elements are properly initialized. */
document.chainHeaderLoaded = (chainId, viewTag) => {
    let key = getKey(chainId);

    if (viewTag === 'Collapsed') {
        setIsRunningView(key, viewTag, context[key].isRunning);
    }
    if (viewTag === 'Default') {
        setLabelView(key, 'Default', context[key].name);
        setIsRunningView(key, viewTag, context[key].isRunning);
        setStateView(key, viewTag, context[key].state);
    }
    if (viewTag === 'Edit') {
        setLabelView(key, 'Edit', context[key].name);
        setSensorOriginView(key, viewTag, context[key].origin, context[key].range);
    }
    if (viewTag === 'Panel')
        setLabelView(key, 'Panel', context[key].name);
}

/** Event handler on selecting a chain, properly effecting it as the current active. */
document.chainActiveToggled = chainId => {
    let key = getKey(chainId);
    let toggleToIsRunning = !context[key].isRunning;
    context[key].isRunning = toggleToIsRunning;

    mqtt.pubObj(`SelectedChain`, {
        id: selectedChainId,
        isRunning: context[key].isRunning
    });
}

/** Event handler on toggling the chain selection panel, expanding or contracting the panel as appropriate. */
document.toggleChainSelectPanel = isChainSelectPanelOpen => {
    document
        .getElementById(PANEL_VIEW_CONTAINER_NAME)
        .setAttribute('style', `transform:scaleX(${isChainSelectPanelOpen ? 1 : 0});`);
}

/** Event handler on the current state of the primary selected chain changing. */
window.updateChainState = (chainId, e) => {
    if (chainId == selectedChainId)
        setState(chainId,
            e.every(s => s === gen.State.OPERATIONAL) ? gen.State.OPERATIONAL :
            e.every(s => s === gen.State.UNKNOWN)     ? gen.State.UNKNOWN :
            e.some(s =>  s === gen.State.FAILURE)     ? gen.State.FAILURE :
            e.some(s =>  s === gen.State.CAUTION)     ? gen.State.CAUTION :
                                                        gen.State.CAUTION);
}

// GENERAL

/**
 * Builds a formatted key from the indicated chain ID.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @returns Properly formatted key.
 */
function getKey(chainId) {
    return `${chainId}.ChainHeader`;
}

/**
 * Set selected chain actively running, as indicated.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {Boolean} isRunning - True if selective chain is active, otherwise False.
 */
function setSelectedChain(chainId, isRunning) {
    if (chainId == "")
        return;

    if (selectedChainId &&
        selectedChainId !== '')
        pullCurrentSetupFromView(selectedChainId);

    let selectedKey = getKey(selectedChainId);
    let key = getKey(chainId);

    // clearView(PANEL_VIEW_LIST_CONTAINER_NAME);
    clearView(DEFAULT_VIEW_CONTAINER_NAME);
    clearView(COLLAPSED_VIEW_CONTAINER_NAME);
    clearView(EDIT_VIEW_CONTAINER_NAME);

    if (context[selectedKey]) {
        removeView(selectedChainId, "Edit");
        collapseSelectChainPanel();
    }

    if (!context[key])
        context[key] = new Chain();

    selectedChainId = chainId;
    if (context[key]) {
        context[key].isRunning = isRunning;
        addOrUpdateCollapsedView(chainId);
        addOrUpdateDefaultView(chainId);
        addOrUpdateEditView(chainId);
    }
};

/**
 * Retrieve the current setup as defined from view to ensure that the client data model is in sync with the view (typically used on save).
 * @param {string} chainId - Unique identifier of a configured processing chain.
 */
function pullCurrentSetupFromView(chainId) {
    let key = getKey(chainId);
    let viewKey = `${key}.Edit`;
    let checkElement = undefined;
    checkElement = document.getElementById(`${viewKey}.chain-label-content`);
    if (checkElement)
       context[key].name = checkElement.value;
    checkElement = document.getElementById(`${viewKey}.latitude-textbox-content`);
    if (checkElement)
        context[key].origin.latitude = checkElement.value *
            (document.getElementById(`${viewKey}.latitude-cardinal-north`).checked ? +1.0 : -1.0);
    checkElement = document.getElementById(`${viewKey}.longitude-textbox-content`);
    if (checkElement)
        context[key].origin.longitude = checkElement.value *
            (document.getElementById(`${viewKey}.longitude-cardinal-east`).checked ? +1.0 : -1.0);
    checkElement = document.getElementById(`${viewKey}.range-textbox-content`);
    if (checkElement)
       context[key].range = checkElement.value;
}

/**
 * Save global settings
 */
function saveSettings() {
    pullCurrentSetupFromView(selectedChainId);

    for (let i in purgedChains) {
        mqtt.pubClear(`Chains/${purgedChains[i]}/Setup`);
        mqtt.pubClear(`Chains/${purgedChains[i]}/Setup/SubSystems`);
    }

    let availableChains = [];
    Object.keys(context).forEach(chain => {
        if (chain)
            availableChains.push(chain.split('.')[0]);
    });
    mqtt.pubObj(`AvailableChains`, availableChains);

    for (let i in availableChains) {
        let key = getKey(availableChains[i]);

        mqtt.pubObj(`Chains/${availableChains[i]}/Setup`, {
            label: context[key].name ?? "",
            origin: {
                latitude: context[key].origin.latitude ?? 0.0,
                longitude: context[key].origin.longitude ?? 0.0
            },
            range: context[key].range ?? 0
        });
    }

    mqtt.pubObj(`SelectedChain`, {
        id: selectedChainId,
        isRunning: false
    });
}

// ADD OR UPDATE

/**
 * Logic allowing for chain add/update functionality.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} msg - Payload containing the latest details from the broker that the client should sync with.
 */
function addOrUpdate(chainId, msg) {
    if (chainId == "")
        return;

    let key = getKey(chainId);

    if (!context[key])
        context[key] = new Chain();

    context[key].range = msg.range;

    addOrUpdatePanelView(chainId);

    if (chainId === selectedChainId) {
        addOrUpdateCollapsedView(chainId);
        addOrUpdateDefaultView(chainId);
        addOrUpdateEditView(chainId);
    }
}

/**
 * Add/update the minimal subsystem view (single toggle in collapsed mode) for the specified chain.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 */
function addOrUpdateCollapsedView(chainId) {
    let viewTag = 'Collapsed';
    let key = getKey(chainId);
    let viewKey = `${key}.${viewTag}`
    let checkElement = document.getElementById(viewKey);
    if (!checkElement) {
        document.getElementById(COLLAPSED_VIEW_CONTAINER_NAME).innerHTML +=
            `<div id='${viewKey}'>` +
                `<input id='${viewKey}.Toggle' class='${(context[key].isRunning ?"enabled-play-button-style" : "disabled-play-button-style")}'` +
                    `onclick='chainActiveToggled("${chainId}",this.checked);'` +
                    `name='${viewKey}'` +
                    `type='checkbox'` +
                    `${(context[key].isRunning ? 'checked ' : '')}'/>` +
                `<img src onerror='chainHeaderLoaded("${chainId}","${viewTag}");'/>` +
            `</div>`;
    }
    else {
        setStateView(key, viewTag, context[key].state);
        setIsRunningView(key, viewTag, context[key].isRunning);
    }
}

/**
 * Add/update the default usage control card for the specified chain.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 */
function addOrUpdateDefaultView(chainId) {
    let viewTag = 'Default';
    let key = getKey(chainId);
    let viewKey = `${key}.${viewTag}`;
    let checkElement = document.getElementById(viewKey);
    if (!checkElement) {
        document.getElementById(DEFAULT_VIEW_CONTAINER_NAME).innerHTML +=
            `<div id='${viewKey}'>` +
                `<input id='${viewKey}.Toggle' class='${(context[key].isRunning ?"enabled-play-button-style" : "disabled-play-button-style")}'` +
                    `onclick='chainActiveToggled("${chainId}",this.checked);'` +
                    `name='${viewKey}'` +
                    `type='checkbox'` +
                    `${(context[key].isRunning ? 'checked ' : '')}'/>` +
                `<div class="labels-block-style">` +
                    `<label id="${viewKey}.chain-label-content" class="chain-label-style">${context[key].name}</label>` +
                    `<label id="${viewKey}.state-label-content" class="state-label-style">${context[key].state}</label>` +
                `</div>` +
                `<img src onerror='chainHeaderLoaded("${chainId}","${viewTag}");'/>` +
            `</div>`;
    }
    else {
        setLabelView(key, viewTag, context[key].name);
        setStateView(key, viewTag, context[key].state);
        setIsRunningView(key, viewTag, context[key].isRunning);
    }
}

/**
 * Add/update the edit only control card for the specified chain.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 */
function addOrUpdateEditView(chainId) {
    let viewTag = 'Edit';
    let key = getKey(chainId);
    let viewKey = `${key}.${viewTag}`;
    let checkElement = document.getElementById(viewKey);
    if (!checkElement) {
        document.getElementById(EDIT_VIEW_CONTAINER_NAME).innerHTML =
            `<form id="${viewKey}.cardinal-group">` +
                `<div style="display:flex;flex-direction:row;">` +
                    `<input id="${viewKey}.panel-toggle" type="checkbox" class="panel-toggle-style" onclick="toggleChainSelectPanel(this.checked);" />` +
                    `<textarea id="${viewKey}.chain-label-content" type="text" placeholder="chain name"` +
                        `maxlength="32" cols="17" rows="1" wrap="hard">-</textarea>` +
                `</div>` +
                `<div id='${viewKey}.locations' style="display:flex;flex-direction:column;">` +
                    `<div class="line-section">` +
                        `<input id="${viewKey}.latitude-textbox-content" type="text" placeholder="latitude" value='${Math.abs(context[key].origin.latitude)}'/>` +
                        `<label class="container"><input id="${viewKey}.latitude-cardinal-north" type="radio" name="latitude-cardinal" value="n" ${(context[key].origin.latitude >= 0 ? 'checked ' : '')}/>N</label>` +
                        `<label class="container"><input id="${viewKey}.latitude-cardinal-south" type="radio" name="latitude-cardinal" value="s" ${(context[key].origin.latitude < 0 ? 'checked ' : '')}/>S</label>` +
                    `</div>` +
                    `<div class="line-section">` +
                        `<input id="${viewKey}.longitude-textbox-content" type="text" placeholder="longitude" value='${Math.abs(context[key].origin.longitude)}'/>` +
                        `<label class="container"><input id="${viewKey}.longitude-cardinal-east" type="radio" name="longitude-cardinal" value="e" ${(context[key].origin.longitude >= 0 ? 'checked ' : '')}/>E</label>` +
                        `<label class="container"><input id="${viewKey}.longitude-cardinal-west" type="radio" name="longitude-cardinal" value="w" ${(context[key].origin.longitude < 0 ? 'checked ' : '')}/>W</label>` +
                    `</div>` +
                    `<div class="line-section">` +
                        `<input id="${viewKey}.range-textbox-content" type="text" placeholder="range" value='0'/>` +
                        `<label class="container" style="cursor:default;">m</label>` +
                    `</div>` +
                `</div>` +
                `<hr width="99%"/>` +
                `<img src onerror='chainHeaderLoaded("${chainId}","${viewTag}");'/>` +
            `</form>`;
    }
    else {
        setLabelView(key, viewTag, context[key].name);
        setStateView(key, viewTag, context[key].state);
        setSensorOriginView(key, viewTag, context[key].origin, context[key].range);
    }
}

/**
 * Add/update the chain entry in the chain popup panel which allows for their management.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 */
function addOrUpdatePanelView(chainId) {
    let viewTag = 'Panel';
    let key = getKey(chainId);
    let viewKey = `${key}.${viewTag}`;
    let checkElement = document.getElementById(viewKey);
    if (!checkElement) {
        let li = document.createElement('li');
        li.id = viewKey;
        // li.onload = "top.chainHeaderLoaded(this)";
        li.innerHTML =
            `<div id="${viewKey}.chain-label-content" onclick="top.localChainSelected(this.parentElement.id.split('.')[0])">${context[key].name}</div>` +
            `<i class="far fa-trash-alt delete-button-style" onclick="top.removeLocalChain(this)"></i>`;

        document.getElementById(PANEL_VIEW_LIST_CONTAINER_NAME).appendChild(li);
        document.chainHeaderLoaded(chainId, 'Panel');
    }
    else {
        setLabelView(key, 'Panel', context[key].name);
    }
}

// REMOVE

/**
 * Remove indicated chain from client and broker.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 */
function remove(chainId) {
    let key = getKey(chainId);
    if (Object.keys(context).indexOf(key) < 0)
        return;

    delete context[key];
    purgedChains.push(chainId);

    collapseSelectChainPanel();
    removeView(chainId, "Panel");
    removeView(chainId, "Edit");
}

/**
 * Remove controls associated with the indicated chain from the view.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} viewTag - Tag identifying the specific control view to work on [e.g. "Default"/"Edit"/"Available"].
 */
function removeView(chainId, viewTag) {
    let checkElement = document.getElementById(`${getKey(chainId)}.${viewTag}`);
    if (checkElement)
        checkElement.remove();
}

// CLEAR

/**
 * Removes all views.
 */
function clearChains() {
    context = {};
    clearView(PANEL_VIEW_LIST_CONTAINER_NAME);
    clearView(DEFAULT_VIEW_CONTAINER_NAME);
    clearView(COLLAPSED_VIEW_CONTAINER_NAME);
    clearView(EDIT_VIEW_CONTAINER_NAME);
}

/**
 * Remove all elements from the indicated signal chain's view.
 * @param {string} containerName - Name for the container in the DOM, as declared in the HTML.
 */
function clearView(containerName) {
    let list = document.getElementById(containerName);

    if (!list)
        return;

    while (list.firstChild)
        list.firstChild.remove();
}

// LABEL

/**
 * Set label directly from message.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} chainName - User friendly name of the processing chain, used to label the chain on the UI.
 */
function setLabel(chainId, chainName) {
    let key = getKey(chainId);
    context[key].name = chainName;

    setLabelView(key, 'Panel', chainName);

    if (chainId === selectedChainId) {
        setLabelView(key, 'Default', chainName);
        setLabelView(key, 'Edit', chainName);
    }
};

/**
 * Set the user friendly signal chain name on the selected chain's indicated card in the view.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {string} viewTag - Tag identifying the specific control view to work on [e.g. "Default"/"Edit"/"Available"].
 * @param {string} chainName - User friendly name of the processing chain, used to label the chain on the UI.
 */
function setLabelView(key, viewTag, chainName) {
    let checkElement = document.getElementById(`${key}.${viewTag}.chain-label-content`);
    if (checkElement)
        checkElement.innerHTML  = chainName;
}

// ORIGIN

/**
 * Set selected sensor's origin directly from message.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {Object} origin - Configured primary sensor origin, used to define the view bounds and range/az data elements.
 * @param {number} range - Configured primary sensor range, used to draw the rosette and set the view-bounds.
 */
function setSensorOrigin(chainId, origin, range) {
    let key = getKey(chainId);
    context[key].origin = origin;
    context[key].range = range;

    if (chainId === selectedChainId)
        setSensorOriginView(key, 'Edit', origin, range);
};

/**
 * Set the origin and range on the chain's edit card in the view.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {string} viewTag - Tag identifying the specific control view to work on [e.g. "Default"/"Edit"/"Available"].
 * @param {Object} origin - Configured primary sensor origin, used to define the view bounds and range/az data elements.
 * @param {number} range - Configured primary sensor range, used to draw the rosette and set the view-bounds.
 */
function setSensorOriginView(key, viewTag, origin, range) {
    let viewKey = `${key}.${viewTag}`
    let checkElement = undefined;
    checkElement = document.getElementById(`${viewKey}.latitude-textbox-content`);
    if (checkElement)
        checkElement.value = Math.abs(origin.latitude);
    checkElement = document.getElementById(`${viewKey}.longitude-textbox-content`);
    if (checkElement)
        checkElement.value = Math.abs(origin.longitude);
    checkElement = document.getElementById(`${viewKey}.range-textbox-content`);
    if (checkElement)
        checkElement.value = Math.abs(range);
    checkElement = document.getElementById(`${viewKey}.latitude-cardinal-north`);
    if (checkElement)
        checkElement.checked = origin.latitude >= 0;
    checkElement = document.getElementById(`${viewKey}.latitude-cardinal-south`);
    if (checkElement)
        checkElement.checked = origin.latitude < 0;
    checkElement = document.getElementById(`${viewKey}.longitude-cardinal-east`);
    if (checkElement)
        checkElement.checked = origin.longitude >= 0;
    checkElement = document.getElementById(`${viewKey}.longitude-cardinal-west`);
    if (checkElement)
        checkElement.checked = origin.longitude < 0;
}

// STATES

/**
 * Set state directly from message.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {string} state - Chain state as determined from the states of its component subsystems.
 */
function setState(chainId, state) {
    let key = getKey(chainId);
    let isEnabled = (state == gen.State.OPERATIONAL) ||
                    (state == gen.State.CAUTION) ||
                    context[key].isRunning;
    context[key].state = state;
    context[key].isEnabled = isEnabled;

    if (chainId === selectedChainId) {
       setStateView(key, 'Default', state);
       setEnabledView(key, 'Collapsed', isEnabled);
       setEnabledView(key, 'Default', isEnabled);
   }
}

/**
 * Set the current operational state of the selected chain on the indicated card in the view.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {string} viewTag - Tag identifying the specific control view to work on [e.g. "Default"/"Edit"/"Available"].
 * @param {string} state - Chain state as determined from the states of its component subsystems.
 */
function setStateView(key, viewTag, state) {
    let checkElement = document.getElementById(`${key}.${viewTag}.state-label-content`);
    if (checkElement) {
        checkElement.innerHTML = state;

        checkElement.setAttribute('class',
            state == gen.State.FAILURE     ? 'failure-text-style' :
            state == gen.State.CAUTION     ? 'caution-text-style' :
            state == gen.State.OPERATIONAL ? 'operational-text-style' :
            state == gen.State.UNKNOWN     ? 'inactive-text-style' :
                                             'state-label-style');
    }
}

// OTHER

/**
 * Disable chain activation (but not deactivation) with subsystem fail condition. All other states should allow for activation, with "caution" taken to indicate a lower level warning and "inactive" assumed as potentially indicating currently unknown conditions on a subsystem.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {string} viewTag - Tag identifying the specific control view to work on [e.g. "Default"/"Edit"/"Available"].
 * @param {Boolean} isEnabled - True if chain is enabled, False otherwise.
 */
function setEnabledView(key, viewTag, isEnabled) {
    let checkElement = document.getElementById(`${key}.${viewTag}.Toggle`);
    if (checkElement) {
        checkElement.setAttribute('class', isEnabled
            ? 'enabled-play-button-style'
            : 'disabled-play-button-style');
    }
}

/**
 * Set current chain is running state directly from message.
 * @param {string} chainId - Unique identifier of a configured processing chain.
 * @param {Boolean} isRunning - True if chain is active, False otherwise.
 */
function setIsRunning(chainId, isRunning) {
    let key = getKey(chainId);
    if (chainId === selectedChainId) {
        context[key].isRunning = isRunning;
        setIsRunningView(key, 'Collapsed', isRunning);
        setIsRunningView(key, 'Default', isRunning);
    }
    setState(chainId, context[key].state)
}

/**
 * Set chain active/inactive.
 * @param {string} key - Identifying key for previously registered internal elements (see {@link getKey} for more info).
 * @param {string} viewTag - Tag identifying the specific control view to work on [e.g. "Default"/"Edit"/"Available"].
 * @param {Boolean} isRunning - True if chain is active, False otherwise.
 */
function setIsRunningView(key, viewTag, isRunning) {
    let checkElement = document.getElementById(`${key}.${viewTag}.Toggle`);
    if (checkElement)
        checkElement.checked = isRunning;
}

/**
 * Force collapse of the signal chain management popup panel in the edit view.
 */
function collapseSelectChainPanel() {
    let viewKey = getKey(selectedChainId);
    let checkElement = document
        .getElementById(`${viewKey}.Edit.panel-toggle`);
    if (checkElement)
        checkElement.checked = false;
    document
        .getElementById(PANEL_VIEW_CONTAINER_NAME)
        .setAttribute('style', `transform:scaleX(0);`);
}

export {
    setSelectedChain,
    clearChains,
    addOrUpdate,
    remove,
    saveSettings,
    setLabel,
    setSensorOrigin,
    setState,
    setIsRunning,
};
/**
 * @fileoverview Primary logic of the measure-line functionalities as available to the client.
 * @package
 */

/** Defines the defaults to the library used as the basis for the measure-lines. */
const options = {
    position: 'bottomright',                // Position to show the control. Possible values are: 'topright', 'topleft', 'bottomright', 'bottomleft'
    unit: 'metres',                         // Show imperial or metric distances. Values: 'metres', 'landmiles', 'nauticalmiles'
    measureControlTitleOn: '',              // Title for the control going to be switched on
    measureControlTitleOff: '',             // Title for the control going to be switched off
    measureControlLabel: '',                // HTML to place inside the control
    measureControlClasses: [],              // Classes to apply to the control
    backgroundColor: '#000000',             // Background color for control when selected
    cursor: 'crosshair',                    // Cursor type to show when creating measurements
    clearMeasurementsOnStop: true,          // Clear all the measurements when the control is unselected
    tempLine: {                             // Styling settings for the temporary dashed line
        color: '#777777',                   // Dashed line color
        weight: 3                           // Dashed line weight
    },
    fixedLine: {                            // Styling for the solid line
        color: '#AAAAAA',                   // Solid line color
        weight: 3                           // Solid line weight
    },
    startCircle: {                          // Style settings for circle marker indicating the starting point of the polyline
        color: '#000000',                   // Color of the border of the circle
        weight: 1,                          // Weight of the circle
        fillColor: '#EEEEEE',               // Fill color of the circle
        fillOpacity: 0.8,                   // Fill opacity of the circle
        radius: 5                           // Radius of the circle
    },
    intermedCircle: {                       // Style settings for all circle markers between startCircle and endCircle
        color: '#000000',                   // Color of the border of the circle
        weight: 1,                          // Weight of the circle
        fillColor: '#BBBBBB',               // Fill color of the circle
        fillOpacity: 0.8,                   // Fill opacity of the circle
        radius: 4                           // Radius of the circle
    },
    currentCircle: {                        // Style settings for circle marker indicating the latest point of the polyline during drawing a line
        color: '#000000',                   // Color of the border of the circle
        weight: 1,                          // Weight of the circle
        fillColor: '#FFFFFF',               // Fill color of the circle
        fillOpacity: 0.8,                   // Fill opacity of the circle
        radius: 7                           // Radius of the circle
    },
    endCircle: {                            // Style settings for circle marker indicating the last point of the polyline
        color: '#000000',                   // Color of the border of the circle
        weight: 1,                          // Weight of the circle
        fillColor: '#EEEEEE',               // Fill color of the circle
        fillOpacity: 0.8,                   // Fill opacity of the circle
        radius: 5                           // Radius of the circle
    },
};

/** Primary object for the measure-line instance. */
var item = null;

/** Control element of the measure-line. */
var control = null;

/** Toggle button DOM element. */
var toggleButton = null;

/** On measure event to active window, toggle measurement functionality. */
window.measure = () =>
    toggle();

/**
 * Initialize the measure-line class.
 * @param {Object} map - Leaflet map object active to the current client instance.
 * @param {string} toggleControlId - HTML defined control name of the applicable DOM object.
 */
function initialize(map, toggleControlId) {
    item = L.control.polylineMeasure(options).addTo(map);
    control = item._measureControl;
    toggleButton = document.getElementById(toggleControlId);

    document.ondblclick = cancelMeasureFromEvent;
    document.oncontextmenu = cancelMeasureFromEvent;
    document.onkeydown = async e => {
        e = e || window.event;
        if (('key' in e) && (e.key === 'Escape' || e.key === 'Esc')) {
            await new Promise(r => setTimeout(r, 0));
            cancelMeasureFromEvent(e);
        }
    };
    clearView();
}

/**
 * Event handler logic for cancelling of measure line.
 * @param {Object} e - Triggering event.
 */
function cancelMeasureFromEvent(e) {
    if (item._measuring) {
        e.preventDefault();
        cancelMeasure();
    }
};

/**
 * Logic to cancel an ongoing measurement.
 */
function cancelMeasure() {
    if (item._measuring) {
        try {
            item._toggleMeasure();
        }
        catch (x) {
            if (!(x instanceof TypeError))
                console.log(x);
        }
        item._resetPathVariables();
        item._clearAllMeasurements();
        clearView();
    }
}

/**
 * Toggles measurement functionality on/off.
 */
function toggle() {
    if (item._measuring)
        cancelMeasure();
    else
        control.click();

    clearView();
}

/**
 * Clears the visual elements related to the measure line back to the defaults.
 */
function clearView() {
    control.style.visibility = false;
    control.style.opacity = 0;
    control.style.width = 0;
    control.style.height = 0;
    if (toggleButton &&
        toggleButton.contentDocument) {
        let svg = toggleButton
            .contentDocument
            .getElementsByTagName('svg');
        if (svg &&
            svg[0]) {
            let element = svg[0].getElementById('button-highlight');
            if (element)
                element
                    .style
                    .visibility = item._measuring ? 'visible' : 'hidden';
        }

    }
    document.getElementById('measure-toggle')
        .className = item._measuring ? 'selected-map-button-style' : 'map-button-style';
    // _toggle.isChecked = _item._measuring;
}

export {
    initialize,
    toggle,
}
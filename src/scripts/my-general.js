/**
 * @fileoverview Generally usable enums and functions.
 * @package
 */

/** Representative colours taken from https://devblogs.microsoft.com/commandline/updating-the-windows-console-colors/. */
const Palettes = [
    '#F2F2F2', //  0. Light White
    '#16C60C', //  1. Light Green
    '#3B78FF', //  2. Light Blue
    '#E74856', //  3. Light Red
    '#61D6D6', //  4. Light Cyan
    '#B4009E', //  5. Light Magenta
    '#F9F1A5', //  6. Light Yellow
    '#CCCCCC', //  7. Dark White
    '#13A10E', //  8. Dark Green
    '#0037DA', //  9. Dark Blue
    '#C50F1F', // 10. Dark Red
    '#3A96DD', // 11. Dark Cyan
    '#881798', // 12. Dark Magenta
    '#C19C00'  // 13. Dark Yellow
];

/** Regular expression to split of ISO8601 formatted date into its component parts. */
const DATE_TIME_REGEX = /(-)?P(?:([.,\d]+)Y)?(?:([.,\d]+)M)?(?:([.,\d]+)W)?(?:([.,\d]+)D)?(?:T(?:([.,\d]+)H)?(?:([.,\d]+)M)?(?:([.,\d]+)S)?)?/;

/** Number of milliseconds in each component of a DATE_TIME_REGEX split ISO8601 string. */
const MillisecondsIn = {
    SECOND:         1000,
    MINUTE:        60000,
    HOUR:        3600000,
    DAY:        86400000,
    WEEK:      604800000,
    MONTH:    2419200000,
    YEAR :  125798400000,
};

/** String enum for available states to the system, as used in the flexible data interchange formats. */
const State = {
    UNKNOWN     : 'Unknown',
    OPERATIONAL : 'Operational',
    CAUTION     : 'Caution',
    FAILURE     : 'Failure'
};

/** Integer enum for the placement types that may be used to specify a particular location. */
const PlacementType = {
    LAT_LNG: 0,
    RANGE_AZ: 1,
    RANGE_AZ_FROM_SELF: 2
};

/**
 * Get the current datetime formatted for display.
 */
function getFormattedDateTime() {
    let now = new Date();
    let year = now.getFullYear();
    let month = String(now.getMonth() + 1).padStart(2, '0');
    let day = String(now.getDate()).padStart(2, '0');
    let hour = String(now.getHours()).padStart(2, '0');
    let minute = String(now.getMinutes()).padStart(2, '0');
    let second = String(now.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * ISO8601 duration to equivalent time in milliseconds.
 * @param {string} duration - Date format in P<date>T<time> (i.e. P[n]Y[n]M[n]DT[n]H[n]M[n]S or P[n]W)
 */
function getMillisecondsFrom(duration) {
    let arr = duration.split(DATE_TIME_REGEX);

    let durationInMilliseconds =
        (arr[1] == "-" ? -1 : +1) * (
            parseInt(arr[2]   || '0') * MillisecondsIn.YEAR +
            parseInt(arr[3]   || '0') * MillisecondsIn.MONTH +
            parseInt(arr[4]   || '0') * MillisecondsIn.WEEK +
            parseInt(arr[5]   || '0') * MillisecondsIn.DAY +
            parseInt(arr[6]   || '0') * MillisecondsIn.HOUR +
            parseInt(arr[7]   || '0') * MillisecondsIn.MINUTE +
            parseFloat(arr[8] || '0') * MillisecondsIn.SECOND);

    return durationInMilliseconds;
}

export {
    State,
    Palettes,
    PlacementType,
    getMillisecondsFrom,
    getFormattedDateTime
};
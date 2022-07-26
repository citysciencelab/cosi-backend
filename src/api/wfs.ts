import axios from "axios";
import handleAxiosError from "./utils/handleAxiosError";
import getWfsError from "./utils/getWfsError";
import {WFS} from "ol/format.js";
import Filter from "ol/format/filter/Filter";

export interface WriteGetFeatureOptions {
    featureTypes: string[]
    featureNS: string
    featurePrefix?: string
    version?: string
    propertyNames?: string[]
    bbox?: number[]
    srsName?: string
    geometryName?: string
    filter?: Filter
    resultType?: string
    count?: number
    maxFeatures?: number
    outputFormat?: string
}

/**
 * Handles the WFS GetFeature request by GET.
 * @throws Throws an error if an error occures and no onerror callback is given.
 * @param {String} url - URL that will be used for the request.
 * @param {Object} payload - The URL parameters(KVP) to be sent with the request.
 * @param {String} payload.version - The version of the WFS.
 * @param {String|String[]} payload.featureType - Name(s) of the feature type(s).
 * @param {String} [payload.propertyNames] - A comma separated list of feature properties to restrict the request.
 * @param {String} [payload.bbox] - A extent to restrict the request.
 * @returns {Promise<Object|String|undefined>} Promise object represents the GetFeature request.
 */
export function getFeatureGET (url: string, payload: WriteGetFeatureOptions) {
    const {featureTypes, version, propertyNames, bbox} = payload;
    const options = {
        url,
        method: "GET",
        params: {
            // mandatory parameters
            service: "WFS",
            request: "GetFeature",
            version,
            typeName: Array.isArray(featureTypes) ? featureTypes.join(",") : featureTypes, // WFS 1.x.x
            typeNames: Array.isArray(featureTypes) ? featureTypes.join(",") : featureTypes, // WFS 2.x.x
            // optional parameters
            propertyName: propertyNames, // WFS 1.x.x
            propertyNames, // WFS 2.x.x
            bbox
        }
    };

    return axios(options)
        .then(response => handleWfsResponse(response))
        .catch(axiosError => handleAxiosError(axiosError, "api/wfs/getFeatureGET"));
}

/**
 * Handles the WFS GetFeature request by POST.
 * @throws Throws an error if an error occures and no onerror callback is given.
 * @param {String} url - URL that will be used for the request.
 * @param {Object} payload - The URL parameters(KVP) to be sent with the request.
 * @param {String[]|module:ol/format/WFS~FeatureType[]} payload.featureTypes - The feature type names or FeatureType objects.
 * @see {@link https://openlayers.org/en/latest/apidoc/module-ol_format_WFS-WFS.html#writeGetFeature} For further information.
 * @returns {Promise<Object|String|undefined>} Promise object represents the GetFeature request.
 */
export function getFeaturePOST (url: string, payload: WriteGetFeatureOptions) {

    // For now only implemented for version 1.1.0. WFS format by default, supports WFS version 1.1.0 (ol v6.10.0).
    const requestBody = new WFS({version: payload.version})
        .writeGetFeature({featurePrefix: "", ...payload});
    const options = {
        method: "POST",
        // axios content-type default is 'application/x-www-form-urlencoded'
        headers: {"content-type": "text/xml"},
        data: new XMLSerializer().serializeToString(requestBody),
        url
    };

    return axios(options)
        .then(response => handleWfsResponse(response))
        .catch(axiosError => handleAxiosError(axiosError, "api/wfs/getFeaturePOST"));
}

/**
 * Handles the axios response for wfs get and post.
 * @throws Throws an error if a xml error from wfs service is detected.
 * @param {Object} response The response object from a successfull axios call.
 * @returns {Object} The response.data of axios.
 */
function handleWfsResponse (response) {
    const wfsError = getWfsError(response?.request?.responseXML);

    if (wfsError instanceof Error) {
        console.error(wfsError)
        return undefined;
    }
    return response.data;
}

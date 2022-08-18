import axios, { AxiosResponse } from "axios";
import handleAxiosError from "./utils/handleAxiosError.js";
import Filter from "ol/format/filter/Filter.js";
import { WFS } from "ol/format.js"
import { registerXMLSerializer } from "ol/xml.js"
import xml2json from "./utils/xml2json"
import { JSDOM } from "jsdom"

// this should not be done: https://github.com/jsdom/jsdom/wiki/Don't-stuff-jsdom-globals-onto-the-Node-global
// but currently no better way to make ol xml parser work with node
const dom = new JSDOM('<!DOCTYPE html><p>Hello world</p>')
const DOMParser = dom.window.DOMParser
const Node = dom.window.Node
const document = dom.window.document
const XMLSerializer = dom.window.XMLSerializer
global.Node = Node
global.document = document

registerXMLSerializer(new XMLSerializer())

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

export class NodeWFS extends WFS {

    constructor(args?: object) {
        super(args);
    }

    parse(data: string) {
        return new DOMParser().parseFromString(data, 'application/xml');
    }

    readFeatures(data: string) {
        const parsed = this.parse(data)
        return this.readFeaturesFromDocument(parsed);
    }

    readFeaturesFromDocument(doc: XMLDocument, opts?: object) {
        /** @type {Array<import("../Feature.js").default>} */
        const features: any = [];
        for (let n = doc.firstChild; n; n = n.nextSibling) {
            if (n.nodeType === Node.ELEMENT_NODE) {
                features.push(this.readFeaturesFromNode((n as Element), opts));
            }
        }
        return features[0];
    }
}

export function getFeatureGET (url: string, payload: WriteGetFeatureOptions): Promise<string> {
    const {featureTypes, version, propertyNames, srsName} = payload;
    const bbox = Array.isArray(payload.bbox) && payload.bbox.length === 4 ? [...payload.bbox, srsName] : payload.bbox
    const options = {
        params: {
            // mandatory parameters
            service: "WFS",
            request: "GetFeature",
            version,
            typeName: Array.isArray(featureTypes) ? featureTypes.join(",") : featureTypes, // WFS 1.x.x
            typeNames: Array.isArray(featureTypes) ? featureTypes.join(",") : featureTypes, // WFS 2.x.x
            // optional parameters
            propertyName: Array.isArray(propertyNames) ? propertyNames.join(",") : propertyNames,
            bbox: Array.isArray(bbox) ? bbox.join(",") : bbox,
            srsName
        }
    };

    return axios.get(url, options)
        .then(response => handleWfsResponse(response))
        .catch(axiosError => handleAxiosError(axiosError, "api/wfs/getFeatureGET"));
}

export function getFeaturePOST (url: string, payload: WriteGetFeatureOptions): Promise<any> {
    // For now only implemented for version 1.1.0. WFS format by default, supports WFS version 1.1.0 (ol v6.10.0).
    const requestBody = new NodeWFS({version: payload.version})
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
 * Handles the WFS DescribeFeatureType request and returns the response.
 * To return a list of feature types, the GET request would be as follows. This request will return the list of feature types, sorted by namespace:
 * @param {String} url - The url of the WFS.
 * @param {String} [version="1.1.0"] - The version of the WFS.
 * @param {String[]} [featureTypes] - A comma-separated list of feature types. If no value is specified, that is interpreted as all feature types.
 * @returns {Promise<Object|undefined>} Promise object represents the DescribeFeatureType request.
 */
 export async function describeFeatureType (url, version = "1.1.0", featureTypes?: string[]): Promise<any> {
    if (typeof url !== "string") {
        console.error(`api/wfs/describeFeatureType: Url is ${url}. Url has to be defined and a string.`);
        return undefined;
    }

    if (typeof version !== "string") {
        console.error(`api/wfs/describeFeatureType: Version is ${version}. Version has to be a string. Default is 1.1.0.`);
        return undefined;
    }

    const options = {
        params: {
            // mandatory parameters
            service: "WFS",
            request: "DescribeFeatureType",
            version,
            // optional parameters
            typeName: Array.isArray(featureTypes) ? featureTypes.join(",") : featureTypes, // WFS 1.x.x
            typeNames: Array.isArray(featureTypes) ? featureTypes.join(",") : featureTypes // WFS 2.x.x
        }
    };

    try {
        const res = await axios.get(url, options)
        const xml = new NodeWFS().parse(res.data)
        const desc = xml2json(xml)

        return desc
    }
    catch (error) {
        return handleAxiosError(error, "api/wfs/describeFeatureType")
    }
}

/**
 * Returns a description of feature.
 * This means a list of the existing attributes of the feature.
 * @param {Object} json - The response of the describe feature request as a json.
 * @param {String} featureTypeName - Is actually the same as the name of a layer.
 * @returns {Object[]|undefined} A list of feature attributes with name and type.
 */
export function getFeatureDescription (json: any, featureTypeName: string): any[] | undefined {
    if (typeof json !== "object" || json === null || typeof featureTypeName !== "string") {
        console.error(`getFeatureDescription: ${json} has to be defined and an object (not null). ${featureTypeName} has to be defined and a string`);
        return undefined;
    }

    // path to the featureTypes
    const featureType = Array.isArray(json?.schema?.element)
        ? json?.schema?.element?.find((element: {[key: string]: any}) => element.attributes?.name === featureTypeName)
        : json?.schema?.element;

    if (typeof featureType === "undefined") {
        console.error(`getFeatureDescription: FeatureType "${featureType}" was not found, trying GML3 schema`);
        return getFeatureDescriptionForGML3(json, featureTypeName);
    }

    // path to the feature attributes
    if (!Array.isArray(featureType.complexType?.complexContent?.extension?.sequence?.element)) {
        console.error(`getFeatureDescription: No attributes were found for the FeatureType "${featureType}"`);
        return undefined;
    }

    return featureType.complexType.complexContent.extension.sequence.element.map(attribute => attribute.getAttributes());
}

/**
 * Returns a description of feature encoded in GML3.
 * This means a list of the existing attributes of the feature.
 * @param {Object} json - The response of the describe feature request as a json.
 * @param {String} featureTypeName - Is actually the same as the name of a layer.
 * @returns {Object[]|undefined} A list of feature attributes with name and type.
 */
export function getFeatureDescriptionForGML3 (json: any, featureTypeName: string): string[] | undefined {
    const featureType = Array.isArray(json?.schema?.complexType) ?
        json?.schema?.complexType.find((type: {[key: string]: any}) => type.attributes?.name.includes(featureTypeName)) :
        json?.schema?.complexType;

    if (typeof featureType === "undefined") {
        console.error(`getFeatureDescription: FeatureType "${featureType}" was not found for GML3`);
        return undefined;
    }

    // path to the feature attributes
    if (!Array.isArray(featureType.complexContent?.extension?.sequence?.element)) {
        console.error(`getFeatureDescription: No attributes were found for the FeatureType "${featureType}"`);
        return undefined;
    }

    return featureType.complexContent.extension.sequence.element.map(attribute => attribute.getAttributes());
}

/**
 * Handles the axios response for wfs get and post.
 * @throws Throws an error if a xml error from wfs service is detected.
 * @param {Object} response The response object from a successfull axios call.
 * @returns {Object} The response.data of axios.
 */
function handleWfsResponse (response: AxiosResponse): any | undefined {
    if (response.status !== 200) {
        return undefined;
    }
    return response.data;
}

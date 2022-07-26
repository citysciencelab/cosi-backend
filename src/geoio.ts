
import { WFS } from "ol/format.js"
import { registerXMLSerializer } from "ol/xml.js"
import jsdom from "jsdom"

import proj4 from "proj4";
import * as Proj from "ol/proj.js";
import { register } from "ol/proj/proj4.js";
import GeoJSON from "ol/format/GeoJSON";
import Feature from "ol/Feature";
import config from "./utils/config.loader";

const { JSDOM } = jsdom
const DOMParser = new JSDOM().window.DOMParser

// this should not be done: https://github.com/jsdom/jsdom/wiki/Don't-stuff-jsdom-globals-onto-the-Node-global
// but currently no better way to make ol xml parser work with node
const Node = new JSDOM().window.Node
const XMLSerializer = new JSDOM().window.XMLSerializer
global.Node = Node

const namedProjections = config.portal.namedProjections;

function registerProjections(projections: string[][]) {
    proj4.defs(projections);
    register(proj4);
    projections.forEach(projection => {
        Proj.addProjection(Proj.get(projection[0]));
        getProjection(projection[0]).masterportal = true;
    });
}

function getProjection(name: string) {
    return proj4.defs(name);
}

registerXMLSerializer(new XMLSerializer())
registerProjections(namedProjections)

class NodeWFS extends WFS {

    constructor(args: object) {
        super(args);
    }

    private parse(data: string) {
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

export function readFeatures(data: string, featureNS?: string): Feature<any>[] {
    return new NodeWFS({ featureNS: featureNS || "http://www.deegree.org/app" }).readFeatures(data);
}

export function writeFeatures(data: any[]): string {
    return new GeoJSON().writeFeatures(data)
}

export function writeFeaturesObject(data: any[]) {
    return new GeoJSON().writeFeaturesObject(data)
}
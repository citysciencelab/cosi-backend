
import { NodeWFS } from "./api/wfs"
import proj4 from "proj4"
import * as Proj from "ol/proj.js"
import { register } from "ol/proj/proj4.js"
import GeoJSON from "ol/format/GeoJSON"
import Feature from "ol/Feature"
import config from "./utils/config.loader"

const namedProjections = config.portal.namedProjections;

function registerProjections(projections: string[][]) {
    proj4.defs(projections);
    register(proj4);
    projections.forEach(projection => {
        Proj.addProjection(Proj.get(projection[0]));
        getProjection(projection[0]).masterportal = true;
    });

    // add equivalent Proj for fallbacks
    Proj.addEquivalentProjections([Proj.get("EPSG:25832"),
        new Proj.Projection({code: "http://www.opengis.net/gml/srs/epsg.xml#25832", axisOrientation: "enu"})]);
}

function getProjection(name: string) {
    return proj4.defs(name);
}

registerProjections(namedProjections)

export function readFeatures(data: string, version?: string, featureNS?: string): Feature<any>[] {
    return new NodeWFS({
        featureNS: featureNS || "http://www.deegree.org/app",
        version: version || "1.1.0"
    }).readFeatures(data);
}

export function writeFeatures(data: any[]): string {
    return new GeoJSON().writeFeatures(data)
}

export function writeFeaturesObject(data: any[]) {
    return new GeoJSON().writeFeaturesObject(data)
}
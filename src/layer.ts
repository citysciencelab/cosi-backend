import axios from "axios";
import { readFeatures } from "./geoio";
import Feature from "ol/Feature";
import { getFeatureGET, getFeaturePOST } from "./api/wfs";
import config from "./utils/config.loader"

export interface LayerDefinition {
    id: string
    name: string
    url: string
    featureType: string
    featureNS: string
    typ: "WFS" | "GeoJSON"
    version?: string

}

let rawLayerList: LayerDefinition[] = [];
const layerListUrl = "https://geoportal-hamburg.de/lgv-config/services-internet.json"
const featureList: any = {}

export function clearLayerList() {
    rawLayerList = []
}

export function setLayerList(layers: LayerDefinition[]) {
    rawLayerList = layers
}

export async function initializeLayerList(url?: string): Promise<LayerDefinition[]> {
    if (rawLayerList.length) {
        return rawLayerList
    }

    rawLayerList = await (await axios.get(url || layerListUrl)).data;

    return rawLayerList
}

export async function getLayerList() {
    await initializeLayerList()

    return rawLayerList
}

export async function getLayerWhere(attrs: any) {
    await initializeLayerList()

    const keys = Object.keys(attrs);
    return rawLayerList.find(layer => keys.every(key => layer[key] === attrs[key]));
}

export async function getLayerById(id: string): Promise<LayerDefinition> {
    await initializeLayerList()

    return rawLayerList.find(layer => layer.id === id);
}

export async function getFeatures(layerId: string, opts: any = {}, refresh?: boolean): Promise<Feature<any>[] | null> {
    if (featureList[layerId] && !refresh) {
        return featureList[layerId]
    }

    const layer = await getLayerById(layerId)
    if (layer && layer.typ === "WFS") {
        console.log(`Fetching data for "${layer.name}" (FeatureType: "${layer.featureType}"), from ${layer.url}`)
        const response = await getFeatureGET(layer.url, {
            featureTypes: [layer.featureType],
            featureNS: layer.featureNS,
            version: layer.version,
            ...opts,
            srsName: opts.srsName || "EPSG:25832",
            bbox: opts.bbox || config.portal.bbox
        })
        console.log(`Response received for "${layer.name}", parsing features...`)

        const features = readFeatures(response, layer.version, layer.featureNS)
        console.log(`Success! ${features.length} parsed for "${layer.name}".`)
        featureList[layerId] = features
        return featureList[layerId]
    }
    return undefined;
}

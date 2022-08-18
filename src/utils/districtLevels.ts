import config from "./config.loader.js"
import { getFeatures, getLayerById, getLayerList } from "../layer.js";
import { Feature } from "ol";
import { DistrictLevel, District } from "SpatialScreening"
import { Polygon } from "ol/geom.js";
import { describeFeatureType, getFeatureDescription } from "../api/wfs.js";

const districtLevels: DistrictLevel[] = config.portal.districtLevels;

export async function fetchPropertyNameList (urls: string[], typeNames: string[][]) {
    if (!Array.isArray(urls)) {
        console.error(`prepareDistrictLevels.getPropertyNameList: ${urls} has to be defined and an array.`);
        return [];
    }
    const propertyNameList = [];

    for (let i = 0; i < urls.length; i++) {
        propertyNameList[i] = [];

        const layer = (await getLayerList()).find(rawlayer => {
            if (rawlayer.url === urls[i]) {
                if (Array.isArray(typeNames?.[i])) {
                    return rawlayer.featureType === typeNames?.[i][0];
                }
                return true;
            }
            return false;
        });

        if (layer) {
            // get the property names by the 'DescribeFeatureType' request
            const json = await describeFeatureType(urls[i])
            const description = getFeatureDescription(json, layer?.featureType);

            if (description) {
                description.forEach(element => {
                    // "gml:" => geometry property
                    if (element.type.search("gml:") === -1) {
                        propertyNameList[i].push(element.name);
                    }
                });
            }
        }

    }
    return propertyNameList;
}

function prepareDistrict (feature: Feature<Polygon>, districtLevel: DistrictLevel): District {
    return {
        feature,
        stats: {},
        getId: () => feature.getId(),
        getName: () => {
            // The names of St.Pauli and Co. are inconsistent in the different services.
            if (feature.get(districtLevel.keyOfAttrName).indexOf("St. ") !== -1) {
                return feature.get(districtLevel.keyOfAttrName).replace(/ /, "");
            }
            return feature.get(districtLevel.keyOfAttrName);
        },
        getLabel: () => {
            const districtName = feature.get(districtLevel.keyOfAttrName);

            // rename feature name for reference levels to avoid naming conflict
            if (districtLevel.duplicateDistrictNames?.includes(districtName)) {
                return `${districtName} (${districtLevel.label.slice(0, -1)})`;
            }
            return districtName;
        }
    }
}

export async function prepareDistrictLevel (districtLevel: DistrictLevel): Promise<void> {
    const index = districtLevels.findIndex(_districtLevel => _districtLevel === districtLevel);

    districtLevel.referenceLevel = index < districtLevels.length - 1 ? districtLevels[index + 1] : null;
    districtLevel.stats.propertyNameList = districtLevel.stats.propertyNameList || await fetchPropertyNameList(districtLevel.stats.baseUrl, districtLevel.stats.featureTypes)
}

export async function getPropertyNamesByMappingObject (districtLevel: DistrictLevel, mappingObject: any): Promise<string[]> | undefined {
    const rawLayer = await getLayerById(mappingObject[districtLevel.stats.keyOfAttrName])
    return districtLevel.stats.propertyNameList[
        districtLevel.stats.baseUrl.findIndex(url => rawLayer.url === url)
    ]
}

export function getDistrictLevel ({layerId, label}: {layerId?: string, label?: string}) {
    return districtLevels.find(districtLevel => districtLevel.layerId === layerId || districtLevel.label === label);
}

export async function fetchDistricts (districtLevel: DistrictLevel, {refresh = true, srsName, bbox}: {refresh?: boolean, srsName?: string, bbox?: number[]}) {
    if (districtLevel.districts && !refresh) {
        return districtLevel.districts;
    }

    districtLevel.districts = (await getFeatures(districtLevel.layerId, {srsName, bbox}))
        .map(feature => prepareDistrict(feature, districtLevel));
}


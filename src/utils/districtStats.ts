import config from "./config.loader.js"
import { DistrictLevel } from "SpatialScreening"
import { getFeatures } from "../layer"
import StatsMappingList from "../../public/mapping.json"
import { getPropertyNamesByMappingObject } from "./districtLevels"
import Feature from "ol/Feature"

const timestampPrefix = config.portal.stats?.timestampPrefix || "jahr"

export function trimTimestampPrefix (key: string): number {
    return parseFloat(key.replace(`${timestampPrefix}${timestampPrefix ? "_" : ""}`, ""))
}

export function getStatsKey (timestamp: number | string): string {
    return `${timestampPrefix}${timestampPrefix ? "_" : ""}${timestamp}`
}

export function getMappingObjectByCategory (category: string): any {
    return StatsMappingList.find(mappingObject => mappingObject.category === category)
}

export async function fetchDistrictStats (districtLevel: DistrictLevel, stats: string[]) {
    await Promise.all(stats.map(category => fetchStatsByCategory(districtLevel, category)))

    return districtLevel
}

async function fetchStatsByCategory (districtLevel: DistrictLevel, category: string) {
    const mapping = getMappingObjectByCategory(category)
    const features = await getFeatures(mapping[districtLevel.stats.keyOfAttrName], {
        propertyNames: await getPropertyNamesByMappingObject(districtLevel, mapping)
    })
    const statsFeatures = parseStatsFeatures(features, districtLevel)

    for (const district of districtLevel.districts) {
        district.stats[category] = statsFeatures.find(feature => feature.get(districtLevel.stats.keyOfAttrName) === district.getName())
    }
}

export function parseStatsFeatures (features: Feature[], districtLevel: DistrictLevel): Feature[] {
    /**
     * parse LTF
     * @todo refactor
     */
    if (features.every(feature => feature.get(timestampPrefix) && feature.get(timestampPrefix + "_timestamp"))) {
        return createStatFeaturesFromLTF(features, districtLevel);
    }
    /**
     * try old timeline format alternatively
     */
    else {
        return features.map(prepareStatsFeaturesLegacy);
    }
}

export function prepareStatsFeaturesLegacy (feature: Feature): Feature {
    const mappingObject = getMappingObjectByCategory(feature.get("category"));

    feature.unset("geom"); // fallback for accidentially loaded geometries
    if (typeof mappingObject !== "undefined") {
        feature.set("category", mappingObject.value);
        feature.set("group", mappingObject.group);
    }

    return feature
}

export function createStatFeaturesFromLTF (ltfFeatures: Feature[], districtLevel: DistrictLevel): Feature[] {
    const statFeatureList = []
    const mappingLtf = StatsMappingList.filter(obj => obj.ltf);

    mappingLtf.forEach(obj => {
        const statFeature = new Feature({
            category: obj.value,
            group: obj.group
        });

        statFeature.set(districtLevel.stats.keyOfAttrName, ltfFeatures[0].get(districtLevel.stats.keyOfAttrName));
        if (districtLevel.referenceLevel) {
            statFeature.set(districtLevel.referenceLevel.stats.keyOfAttrName, ltfFeatures[0].get(districtLevel.referenceLevel.stats.keyOfAttrName));
        }
        ltfFeatures.forEach(feature => {
            statFeature.set(getStatsKey(feature.get(timestampPrefix)), feature.get(obj.category));
        });
        statFeatureList.push(statFeature);
    });

    return statFeatureList;
}
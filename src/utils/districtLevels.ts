import { getFeatures } from "src/layer";
import { Feature } from "ol";
import config from "./config.loader"
import { DistrictLevel, District } from "SpatialScreening"

const districtLevels: DistrictLevel[] = config.portal.districtLevels;

function prepareDistrict (feature: Feature, districtLevel: DistrictLevel): District {
    return {
        feature,
        statFeatures: [],
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

export function getDistrictLevel ({layerId, label}: {layerId?: string, label?: string}) {
    return districtLevels.find(districtLevel => districtLevel.layerId === layerId || districtLevel.label === label);
}

export async function fetchDistricts (districtLevel: DistrictLevel, refresh = true) {
    if (districtLevel.districts && !refresh) {
        return districtLevel.districts;
    }

    districtLevel.districts = (await getFeatures(this.districtLevel.layerId))
        .map(feature => prepareDistrict(feature, districtLevel));
}


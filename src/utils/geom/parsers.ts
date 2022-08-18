import {
    union as turfUnion,
    intersect as turfIntersect,
    circle as turfCircle,
    centroid as turfCentroid,
    centerOfMass as turfCenterOfMass
} from "@turf/turf";
import {GeoJSON} from "ol/format";
import {getCenter} from "ol/extent";
import { Feature } from "ol";

/**
 * Parses an OL feature to a raw geojson object or string
 * @param {module:ol/Feature} feature - the feature to convert
 * @param {Boolean} [asString=false] - defines whether the result should be returned as Object or String
 * @param {String} [sourceCrs="EPSG:25832"] - the CRS of the input
 * @param {String} [targetCrs="EPSG:4326"] - the CRS of the output
 * @returns {GeoJSONFeature | String} the converted feature as GeoJSON
 */
 export function featureToGeoJson (feature: Feature, asString = false, sourceCrs = "EPSG:25832", targetCrs = "EPSG:4326") {
    const parser = new GeoJSON({
        dataProjection: targetCrs,
        featureProjection: sourceCrs
    })

    return asString ? parser.writeFeature(feature) : parser.writeFeatureObject(feature);
}

/**
 * Parses an OL feature to a raw geojson featureCollection object or string
 * @param {module:ol/Feature | module:ol/Feature[]} features - the feature or features to convert
 * @param {Boolean} [asString=false] - defines whether the result should be returned as Object or String
 * @param {String} [sourceCrs="EPSG:25832"] - the CRS of the input
 * @param {String} [targetCrs="EPSG:4326"] - the CRS of the output
 * @returns {GeoJSONFeatureCollection | String} the converted features as GeoJSON featureCollection
 */
export function featuresToGeoJsonCollection (features: Feature[], asString = false, sourceCrs = "EPSG:25832", targetCrs = "EPSG:4326") {
    const parser = new GeoJSON({
        dataProjection: targetCrs,
        featureProjection: sourceCrs
    })
    const _features = Array.isArray(features) ? features : [features]

    return asString ? parser.writeFeatures(_features) : parser.writeFeaturesObject(_features)
}
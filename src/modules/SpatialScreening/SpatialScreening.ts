import config from "../../utils/config.loader"
import { getFeatures } from "../../layer"
import { fetchDistricts, getDistrictLevel, prepareDistrictLevel } from "../../utils/districtLevels.js"
import { fetchDistrictStats, getStatsKey, trimTimestampPrefix } from "../../utils/districtStats"
import { DistrictLevel, District, Operation } from "SpatialScreening"
import { Feature } from "ol"
import { GeoJSON } from "ol/format.js"
import { LineString, MultiLineString, MultiPolygon, Point, Polygon } from "ol/geom";
import { featuresToGeoJsonCollection, featureToGeoJson } from "../../utils/geom/parsers"
import { mean, median } from "../../utils/math"
import {
    FeatureCollection as GeoJSONFeatureCollection,
    Feature as GeoJSONFeature,
    Point as GeoJSONPoint,
    Polygon as GeoJSONPolygon,
    MultiPolygon as GeoJSONMultiPolygon,
    LineString as GeoJSONLineString,
    pointsWithinPolygon as turfPointsWithinPolygon,
    collect as turfCollect,
    intersect as turfIntersect,
    area as turfArea,
    length as turfLength,
    booleanWithin,
    lineSplit,
    booleanPointInPolygon,
    point as turfPoint
} from "@turf/turf"
import { getIntersection } from "ol/extent"
import booleanIntersects from "@turf/boolean-intersects"

const timestampPrefix = config.portal.stats.timestampPrefix

function calcFallbackValue (values: any[], callback: CallableFunction = median): number {
    const _values = values.filter((v: any) => !isNaN(v) && v !== Infinity)

    return callback(_values)
}

function parseValue (value: any, values: any[], fallback?: number) {
    let val = value
    let _fallback = fallback

    if (isNaN(val)) {
        if (!_fallback) _fallback = calcFallbackValue(values, median)

        val = _fallback
    }

    return {val, _fallback}
}

function pointsWithinPolygon (
    polygonFeature: Feature<Polygon>,
    pointFeatures: Feature<Point>[],
    sourceCrs: string,
    returnOlFeatures = true
) {
    const polygon = featureToGeoJson(polygonFeature, false, sourceCrs) as GeoJSONFeature<GeoJSONPolygon>
    const points = featuresToGeoJsonCollection(pointFeatures, false, sourceCrs) as GeoJSONFeatureCollection<GeoJSONPoint>
    const res = turfPointsWithinPolygon(points, polygon)

    if (!returnOlFeatures)
        return res

    return pointFeatures.filter(feature => res.features.map(feat => feat.id).includes(feature.getId()))
}

function collectPointValues (
    polygonFeatures: Feature<Polygon>[],
    pointFeatures: Feature<Point>[],
    inProp: string,
    outProp: string,
    sourceCrs: string,
    returnOlFeatures = true
): GeoJSONFeatureCollection | Feature[] {
    const polygons = featuresToGeoJsonCollection(polygonFeatures, false, sourceCrs) as GeoJSONFeatureCollection<GeoJSONPolygon>
    const points = featuresToGeoJsonCollection(pointFeatures, false, sourceCrs) as GeoJSONFeatureCollection<GeoJSONPoint>

    // if (!inProp) {
    //     for (const point of points.features) {
    //         point.properties.count = 1;
    //     }
    // }

    const res = turfCollect(polygons, points, inProp || "count", outProp || "count")

    if (inProp) {
        for (const feature of res.features) {
            feature.properties.count = feature.properties[outProp].map(() => 1)
        }
    }

    if (!returnOlFeatures)
        return res

    return new GeoJSON({featureProjection: sourceCrs}).readFeatures(res)
}

function intersect (
    polygonFeature1: Feature<Polygon>,
    polygonFeature2: Feature<Polygon>,
    sourceCrs: string,
    resetProperties = false,
    returnOlFeatures = true
): GeoJSONFeature<GeoJSONPolygon | GeoJSONMultiPolygon> | Feature<Polygon> {
    const polygon1 = featureToGeoJson(polygonFeature1, false, sourceCrs) as GeoJSONFeature<GeoJSONPolygon>
    const polygon2 = featureToGeoJson(polygonFeature2, false, sourceCrs) as GeoJSONFeature<GeoJSONPolygon>

    // if (booleanWithin(polygon1, polygon2)) {
    //     return returnOlFeatures ? polygonFeature1 : polygon1
    // }

    try {
        const res = turfIntersect(polygon1, polygon2, {
            properties: resetProperties ? undefined : polygon1.properties
        })

        if (!returnOlFeatures)
            return res

        return new GeoJSON({featureProjection: sourceCrs}).readFeature(res) as Feature<Polygon>
    }
    catch (e) {
        return undefined
    }
}

function trimLinesByPolygon (
    lineFeature: Feature<LineString | MultiLineString>,
    polygonFeature: Feature<Polygon | MultiPolygon>,
    sourceCrs: string,
    returnOlFeatures = true
): GeoJSONFeature<GeoJSONLineString> | Feature<LineString> {
    const line = featureToGeoJson(lineFeature, false, sourceCrs) as GeoJSONFeature<GeoJSONLineString>
    const polygon = featureToGeoJson(polygonFeature, false, sourceCrs) as GeoJSONFeature<GeoJSONPolygon>
    let res = null

    if (booleanWithin(line, polygon)) {
        res = line
    }
    else if (booleanIntersects(line, polygon)) {
        res = lineSplit(line, polygon).features.find(feature => booleanPointInPolygon(feature.geometry.coordinates[1], polygon))
    }

    if (!returnOlFeatures)
        return res

    return new GeoJSON({featureProjection: sourceCrs}).readFeature(res) as Feature<LineString>
}

interface SpatialScreeningOptions {
    districtLevel: {layerId?: string, label?: string},
    timescope?: "latest" | number | number[]
    stats?: string[],
    layers: {
        polygon?: (string|string[])[][],
        line?: (string|string[])[][],
        point?: (string|string[])[][],
        wms?: (string|string[])[][]
    },
    crs?: string
    bbox?: number[]
}

const _layers = {
    count: 0,
    inputs: {
        polygon: [],
        point: [],
        line: [],
        wms: [],
    },
    features: {
        polygon: {},
        point: {},
        line: {},
    }
}
const _log = {
    errors: 0,
    successes: 0,
    process: {
        initTime: undefined,
        finishRequestsTime: undefined,
        finishProcessingTime: undefined,
        tPolygon: 0,
        tPoint: 0,
        tLine: 0,
        tWMS: 0
    }
}

class SpatialScreening {

    timescope: "latest" | number | number[]
    districtLevel: DistrictLevel
    stats: string[]
    layers: {
        count: number
        inputs: {
            polygon: (string|string[])[][]
            point: (string|string[])[][]
            line: (string|string[])[][]
            wms: (string|string[])[][]
        },
        features: {
            polygon: {[layerId: string]: Feature<Polygon>[]}
            line: {[layerId: string]: Feature<MultiLineString>[]}
            point: {[layerId: string]: Feature<Point>[]}
        }
    }
    crs: string
    bbox: number[]
    log: {
        errors: number,
        successes: number,
        process: {
            initTime: Date | undefined,
            finishRequestsTime: Date | undefined,
            finishProcessingTime: Date | undefined,
            tPolygon: number,
            tPoint: number,
            tLine: number,
            tWMS: number
        }
    }

    constructor (args: SpatialScreeningOptions) {
        console.log("Creating new Spatial Screening...")

        this.districtLevel = getDistrictLevel(args.districtLevel)
        this.timescope = args.timescope || "latest"
        this.stats = args.stats || []
        this.layers = _layers
        this.log = _log
        this.layers.inputs.polygon = args.layers.polygon || []
        this.layers.inputs.line = args.layers.line || []
        this.layers.inputs.point = args.layers.point || []
        this.layers.inputs.wms = args.layers.wms || []
        this.crs = args.crs || "EPSG:25832"

        this.initialize()
    }

    async initialize () {
        this.log.process.initTime = new Date()

        console.log("Fetching input data...")
        await Promise.all([
            this.fetchDistricts(),
            this.fetchAnalysisFeatures()
        ])
        this.log.process.finishRequestsTime = new Date();

        console.log(`Inputs fetched for ${this.log.successes} / ${this.layers.count} layers. Finished with ${this.log.errors} errors.`)
        this.run();
    }

    private async fetchStats () {
        if (!this.districtLevel.stats.propertyNameList) {
            await prepareDistrictLevel(this.districtLevel);
        }
        return fetchDistrictStats(this.districtLevel, this.stats)
    }

    private async fetchDistricts () {
        await fetchDistricts(this.districtLevel, {srsName: this.crs, bbox: this.bbox})
        await this.fetchStats()
    }

    private async fetchAnalysisFeatures () {
        console.log("Fetching vector features...")
        const polygonLayers = this.getLayerIds(this.layers.inputs.polygon, "polygon")
        const pointLayers = this.getLayerIds(this.layers.inputs.point, "point")
        const lineLayers = this.getLayerIds(this.layers.inputs.line, "line")

        // count layer Ids
        this.layers.count =
            polygonLayers.length +
            pointLayers.length +
            lineLayers.length +
            this.layers.inputs.wms.length

        return Promise.all([
            ...polygonLayers,
            ...pointLayers,
            ...lineLayers,
        ].map(({layerId, type}) => this.fetchLayerData(layerId, type)))
    }

    private async fetchLayerData (layerId: string, type: "polygon" | "point" | "line") {
        const features = await getFeatures(layerId, {srsName: this.crs, bbox: this.bbox})

        if (features)
            this.log.successes += 1
        else
            this.log.errors += 1

        this.layers.features[type][layerId] = features
    }

    async run () {
        if (this.log.successes !== this.layers.count) {
            return console.error("Not all input data has been loaded. Please check your configuration or the status of the data services. Aborting...")
        }
        if (!this.districtLevel.districts.length) {
            return console.error("No districts have been loaded. Please check your configuration or the status of the data services. Aborting...")
        }

        console.log(`Running Screening for ${this.districtLevel.label}...`)
        await Promise.all([
            this.processStats(),
            this.intersectFeatures()
        ])

        this.log.process.finishProcessingTime = new Date()
        console.log(this);
    }

    private async processStats() {
        for (const category of this.stats) {
            const timestamps = this.getTimestamps(category)

            for (const district of this.districtLevel.districts) {
                district.feature.set(category, timestamps.map(
                    timestamp => parseFloat(district.stats[category]?.get(getStatsKey(timestamp))
                )))
            }
        }
    }

    private async intersectFeatures () {
        await Promise.all([
            ...this.layers.inputs.point.map((input) =>
                this.intersectPoints(input[0], {
                    attrToCategorize: input[1] as string,
                    attrToCalc: input[2] as string,
                    operation: "sum"
                })),
            ...this.layers.inputs.polygon.map((input) =>
                this.intersectPolygons(input[0], {
                    attr: input[1] as string,
                    attrToCalc: input[2] as string,
                    operation: "geom"
                })),
            ...this.layers.inputs.line.map((input) =>
                this.intersectLines(input[0], {
                    attr: input[1] as string,
                    operation: "geom"
                }))
        ])
    }

    private async aggregateMultipleLayers (
        district: District,
        layerIds: string[],
        {attr, attrToCalc, operation = "geom", geomSuffix}: {attr?: string, attrToCalc?: string, operation: Operation, geomSuffix?: "length" | "area"}
    ) {
        let sumVal: number = 0
        let sumGeom: number = 0
        let attrs: string[]
        const attrValues: string[] = []

        for (const layerId of layerIds) {
            attrs = [...attrValues, layerId]
            for (const key of attrs) {
                if (attrToCalc)
                    sumVal += district.feature.get(layerId)[`${key}_${attrToCalc}`]
                sumGeom += district.feature.get(layerId)[`${key}_${geomSuffix}`]
            }
        }
        for (const layerId of layerIds) {
            attrs = [...attrValues, layerId]
            for (const key of attrs) {
                const values = district.feature.get(layerId)

                if (attrToCalc)
                    values[`${key}_${attrToCalc}_%`] = values[key] / sumVal
                values[`${key}_${geomSuffix}_%`] = values[`${key}_${geomSuffix}`] / sumGeom
            }
        }
    }

    private async processPointsPerCategory (
        layerId: string,
        category: string,
        data: Feature<Point>[],
        {attrToCalc, attrToCategorize, operation = "sum"}: {attrToCalc?: string, attrToCategorize?: string, operation: Operation}
    ) {
        const _data = attrToCategorize && category !== layerId ? data.filter(feature => feature.get(attrToCategorize) === category) : data
        const collection = collectPointValues(this.districtLevel.districts.map(district => district.feature), _data, attrToCalc, attrToCalc, this.crs, false)

        for (const district of this.districtLevel.districts) {
            const res = district.feature.get(layerId) || {}
            const resFeature = (collection as GeoJSONFeatureCollection).features
                .find((feature: GeoJSONFeature<GeoJSONPolygon>) => feature.id === district.feature.getId())

            for (const attr of (attrToCalc ? [attrToCalc, "count"] : ["count"])) {
                let fallback: number
                const values = resFeature.properties[attr].map((v: any) => parseFloat(v as string))
                const aggregate = values.reduce((result: number, v: number|string) => {
                    const {val, _fallback} = parseValue(v, values, fallback)

                    fallback = _fallback
                    if (operation === "mean") {
                        // do stuff
                    }
                    // default to sum
                    return result + val
                }, 0)

                res[`${category}_${attr}`] = aggregate
                district.feature.set(layerId, res);
            }
        }

        return this.districtLevel.districts
    }

    private async processLinesPerDistrict (
        district: District, 
        layerId: string, 
        data: Feature<LineString | MultiLineString>[], 
        {attr, attrToCalc, operation = "geom"}: {attr?: string, attrToCalc?: string, operation: Operation}
    ) {
        const intersections = data.map(feature => trimLinesByPolygon(feature, district.feature, this.crs, false)) as GeoJSONFeature[]
        const categories = attr ? data.reduce((cat, feature) => cat.includes(feature.get(attr)) ? cat : [...cat, feature.get(attr)], []) : []
        const values = categories.map(category => ({category, val: 0, length: 0}))
        const res = {}
        let sumVal = 0
        let sumLength = 0

        for (const feature of intersections) {
            if (!feature) continue
            const length = turfLength(feature) * 1000 // convert to meters
            const val = parseFloat(feature.properties[attrToCalc]) || length

            if (attr) {
                const category = feature.properties[attr]
                values.find(obj => obj.category === category).val += length
                values.find(obj => obj.category === category).length += length
            }

            sumVal += length
            sumLength += length
        }

        for (const obj of values) {
            if (attrToCalc) {
                res[obj.category + `_${attrToCalc}`] = obj.val
                res[obj.category + `_${attrToCalc}_%_of_layer`] = obj.val / sumVal
            }
            res[obj.category + "_length"] = obj.length
            res[obj.category + "_length_%_of_layer"] = obj.length / sumLength
        }

        if (attrToCalc)
            res[layerId + `_${attrToCalc}`] = sumVal
        res[layerId + "_length"] = sumLength
        district.feature.set(layerId, res)

        return district
    }

    private async processPolygonsPerDistrict (
        district: District,
        layerId: string,
        data: Feature<Polygon>[],
        {attr, attrToCalc, operation = "geom"}: {attr?: string, attrToCalc?: string, operation: Operation}
    ) {
        const districtExtent = district.feature.getGeometry().getExtent()
        const _data = data.filter(feature => getIntersection(feature.getGeometry().getExtent(), districtExtent)[0] !== Infinity)
        const intersections = _data.map(feature => intersect(feature, district.feature, this.crs, false, false)) as GeoJSONFeature[]
        const categories = attr ? _data.reduce((cat, feature) => cat.includes(feature.get(attr)) ? cat : [...cat, feature.get(attr)], []) : []
        const values = categories.map(category => ({category, val: 0, area: 0}))
        const res = {}
        let sumVal = 0
        let sumArea = 0
        let errors = 0

        for (const feature of intersections) {
            if (feature === undefined) {
                errors += 1;
                continue
            }
            if (feature === null) {
                continue
            }
            const area = turfArea(feature)
            let val = parseFloat(feature.properties[attrToCalc]) || area

            if (isNaN(val)) val = 0

            if (attr) {
                const category = feature.properties[attr]
                values.find(obj => obj.category === category).val += val
                values.find(obj => obj.category === category).area += area
            }

            sumVal += val
            sumArea += area
        }

        for (const obj of values) {
            if (attrToCalc) {
                res[obj.category + `_${attrToCalc}`] = obj.val
                res[obj.category + `_${attrToCalc}_%_of_layer`] = obj.val / sumVal
            }
            res[obj.category + "_area"] = obj.area
            res[obj.category + "_area_%_of_layer"] = obj.area / sumArea
            res[obj.category + "_area_%_of_district"] = obj.area / district.feature.getGeometry().getArea()
        }

        if (attrToCalc)
            res[layerId + `_${attrToCalc}`] = sumVal
        res[layerId + "_area"] = sumArea
        district.feature.set(layerId, res)

        return district
    }

    async intersectPoints (
        layerIds: string | string[],
        {attrToCalc, attrToCategorize, operation = "sum"}: {attrToCalc?: string, attrToCategorize?: string, operation: Operation}
    ) {
        const _layerIds = Array.isArray(layerIds) ? layerIds : [layerIds]
        const t = new Date()

        for (const layerId of _layerIds) {
            const data = this.layers.features.point[layerId]
            const categories = attrToCategorize ? data.reduce((cat, feature) => cat.includes(feature.get(attrToCategorize)) ? cat : [...cat, feature.get(attrToCategorize)], []) : []

            console.log(`Intersecting all districts (${this.districtLevel.districts.length}) with points of layer "${layerId}" (${data.length} Features)`)

            /**
             * @todo parallelize with workers
             */
            await Promise.all(
                [...categories, layerId].map(
                    category => this.processPointsPerCategory(layerId, category, data,  {attrToCalc, attrToCategorize, operation})
                )
            )
            await Promise.all(
                this.districtLevel.districts.map(
                    async district => {
                        const values = district.feature.get(layerId)
                        const total = values[layerId]

                        for (const category of categories) {
                            for (const attr of attrToCalc ? [attrToCalc, "count"] : ["count"]) {
                                values[`${category}_${attr}_%_of_layer`] = values[category] / total
                            }
                        }
                    }
                )
            )
        }

        this.log.process.tPoint = new Date().getTime() - t.getTime()
    }

    async intersectLines (layerIds: string | string[], {attr, attrToCalc, operation = "geom"}: {attr?: string, attrToCalc?: string, operation: Operation}) {
        const hasMultipleLayers = Array.isArray(layerIds)
        const _layerIds = hasMultipleLayers ? layerIds : [layerIds]
        const t = new Date()

        for (const layerId of _layerIds) {
            const data = this.layers.features.line[layerId]

            console.log(`Intersecting all districts (${this.districtLevel.districts.length}) with lines of layer "${layerId}" (${data.length} Features)`)
            /**
             * @todo parallelize with workers
             */
            await Promise.all(
                this.districtLevel.districts.map(
                    district => this.processLinesPerDistrict(district, layerId, data, {attr, operation})
                )
            )
        }

        if (hasMultipleLayers) {
            console.log(`Aggregating data for lines of layers ${_layerIds.join(",")}`)
            await Promise.all(
                this.districtLevel.districts.map(
                    district => this.aggregateMultipleLayers(district, layerIds, {attr, attrToCalc, operation, geomSuffix: "length"})
                )
            )
        }

        this.log.process.tLine = new Date().getTime() - t.getTime()
    }

    async intersectPolygons (layerIds: string | string[], {attr, attrToCalc, operation = "geom"}: {attr?: string, attrToCalc?: string, operation: Operation}) {
        const hasMultipleLayers = Array.isArray(layerIds)
        const _layerIds = Array.isArray(layerIds) ? layerIds : [layerIds]
        const t = new Date()

        for (const layerId of _layerIds) {
            const data = this.layers.features.polygon[layerId]

            console.log(`Intersecting all districts (${this.districtLevel.districts.length}) with polygons of layer "${layerId}" (${data.length} Features)`)
            /**
             * @todo parallelize with workers
             */
            await Promise.all(
                this.districtLevel.districts.map(
                    district => this.processPolygonsPerDistrict(district, layerId, data, {attr, attrToCalc, operation})
                )
            )
        }

        if (hasMultipleLayers) {
            console.log(`Aggregating data for lines of layers ${_layerIds.join(",")}`)
            await Promise.all(
                this.districtLevel.districts.map(
                    district => this.aggregateMultipleLayers(district, layerIds, {attr, attrToCalc, operation, geomSuffix: "area"})
                )
            )
        }

        this.log.process.tPolygon = new Date().getTime() - t.getTime()
    }

    private getTimestamps (category: string): number[] {
        if (this.timescope === "latest") {
            const keys = Object.keys(this.districtLevel.districts.find(district => district.stats[category])?.stats[category].getProperties())

            if (keys) {
                const timestamps = keys
                    .filter((key: string) => key.includes(timestampPrefix))
                    .map(trimTimestampPrefix)

                return [Math.max(...timestamps)]
            }
        }
        if (!Array.isArray(this.timescope) && typeof this.timescope === "number")
            return [this.timescope]
        if (Array.isArray(this.timescope))
            return this.timescope

        return []
    }

    private getLayerIds (inputs: (string | string[])[][], type: "polygon" | "point" | "line"): {layerId: string, type: "polygon" | "point" | "line"}[] {
        return inputs.reduce((layers: {layerId: string, type: "polygon" | "point" | "line"}[], input) => {
            const layerIds = Array.isArray(input[0]) ? input[0] : [input[0]]

            return [...layers, ...layerIds.map((layerId: string) => ({layerId, type}))]
        }, [])
    }
}

export default SpatialScreening

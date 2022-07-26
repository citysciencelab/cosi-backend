import { getFeatures } from "src/layer";
import { fetchDistricts, getDistrictLevel } from "src/utils/districtLevels";
import { DistrictLevel } from "SpatialScreening"

interface SpatialScreeningOptions {
    districtLevel: {layerId?: string, label?: string}
    layers: {
        polygon?: string[],
        line?: string[],
        point?: string[],
        wms?: string[]
    }
}

class SpatialScreening {

    districtLevel: DistrictLevel
    layers: {
        layerIds: {
            polygon: string[]
            point: string[]
            line: string[]
            wms: string[]
        },
        features: {
            polygon: []
            line: []
            point: []
        }
    }

    constructor (args: SpatialScreeningOptions) {
        console.log("Creating new Spatial Screening...")

        this.districtLevel = getDistrictLevel(args.districtLevel)
        this.layers.layerIds.polygon = args.layers.polygon || []
        this.layers.layerIds.line = args.layers.polygon || []
        this.layers.layerIds.point = args.layers.polygon || []
        this.layers.layerIds.wms = args.layers.polygon || []

        this.initialize()
    }

    async initialize () {
        console.log("Fetching input data...")
        await Promise.all([
            this.fetchDistrictFeatures(),
            this.fetchAnalysisFeatures()
        ])
        console.log("Input data received.")
        console.log(this)
    }

    async fetchDistrictFeatures () {
        fetchDistricts(this.districtLevel)
    }

    async fetchAnalysisFeatures () {
        await Promise.all([
            ...this.layers.layerIds.polygon.map(layerId => ({layerId, type: "polygon"})),
            ...this.layers.layerIds.point.map(layerId => ({layerId, type: "point"})),
            ...this.layers.layerIds.line.map(layerId => ({layerId, type: "line"})),
        ].map(({layerId, type}) => this.fetchLayerData(layerId, type)))
    }

    async fetchLayerData (layerId: string, type: string) {
        this.layers.features[type].push(await getFeatures(layerId))
    }
}

export default SpatialScreening
